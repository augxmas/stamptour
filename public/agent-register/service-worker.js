// 현장요원 PWA 서비스워커 — 프로젝트별 스코프 /agent-register/{serial}/
const CACHE_VERSION = 'v1';
let PROJECT_SERIAL = 'default';
let CACHE = `tracker-agent-${PROJECT_SERIAL}-${CACHE_VERSION}`;
let SHELL = ['/agent-register/index.html'];

function deriveScope() {
  try {
    const scopePath = new URL(self.registration.scope).pathname;
    const m = scopePath.match(/^\/agent-register\/([^/]+)/);
    if (m) {
      PROJECT_SERIAL = m[1];
      CACHE = `tracker-agent-${PROJECT_SERIAL}-${CACHE_VERSION}`;
      SHELL = [`/agent-register/${PROJECT_SERIAL}`];
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
        keys.filter(k => k.startsWith(`tracker-agent-${PROJECT_SERIAL}-`) && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.endsWith('/sw.js')) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/agent-register/index.html')));
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
