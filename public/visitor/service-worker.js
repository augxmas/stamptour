// 방문자 PWA 서비스워커 — 프로젝트별 스코프 /v/{serial}/ 에서 동작
// 스코프에서 프로젝트 일련번호를 추출하여 캐시를 프로젝트별로 분리
const CACHE_VERSION = 'v7';
let PROJECT_SERIAL = 'default';
let CACHE = `tracker-visitor-${PROJECT_SERIAL}-${CACHE_VERSION}`;
let SHELL = ['/visitor/index.html', '/favicon.svg'];

function deriveScope() {
  try {
    const scopePath = new URL(self.registration.scope).pathname;
    const m = scopePath.match(/^\/v\/([^/]+)/);
    if (m) {
      PROJECT_SERIAL = m[1];
      CACHE = `tracker-visitor-${PROJECT_SERIAL}-${CACHE_VERSION}`;
      SHELL = [`/v/${PROJECT_SERIAL}`, '/favicon.svg'];
    }
  } catch (e) { /* noop */ }
}

self.addEventListener('install', (e) => {
  deriveScope();
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  deriveScope();
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        // 본인(프로젝트) 캐시의 옛 버전만 삭제 — 다른 프로젝트 캐시는 건드리지 않음
        keys
          .filter(k => k.startsWith(`tracker-visitor-${PROJECT_SERIAL}-`) && k !== CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                  // 방문/식별 등 POST는 그대로 통과
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;        // 외부 도메인은 패스
  if (url.pathname.startsWith('/api/')) return;       // API 응답은 절대 캐시하지 않음
  if (url.pathname === '/v/sw.js') return;

  if (req.mode === 'navigate') {
    // HTML은 항상 최신 우선, 오프라인이면 캐시된 셸로 대응
    e.respondWith(fetch(req).catch(() => caches.match('/visitor/index.html')));
    return;
  }

  // 정적 자원은 캐시 우선 + 백그라운드 채움
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return resp;
    }).catch(() => cached))
  );
});

// ── 웹푸시 수신 → 알림 표시 (예: "Gift 사용이 완료되었습니다") ──
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Tour Tracker';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    data: { url: data.url || '/' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── 알림 클릭 → 앱 열기/포커스 ──
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/v/') && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
