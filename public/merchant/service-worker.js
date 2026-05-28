// 가맹점 PWA 서비스워커 — /merchant/ 스코프
const CACHE = 'tracker-merchant-v1';
const SHELL = ['/merchant', '/merchant/index.html', '/favicon.svg', '/merchant/manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;            // API는 항상 네트워크
  if (url.pathname === '/merchant/service-worker.js') return;

  if (req.mode === 'navigate') {
    // HTML은 네트워크 우선, 오프라인 시 셸 폴백
    e.respondWith(fetch(req).catch(() => caches.match('/merchant/index.html')));
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return resp;
    }).catch(() => cached))
  );
});
