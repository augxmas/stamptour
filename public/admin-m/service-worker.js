// 모노라마 관리자 모바일 PWA — 최소 SW (네트워크 우선 + offline fallback)
const CACHE = 'mn-admin-m-v1';
const PRECACHE = ['/admin/m', '/favicon-blue.svg', '/vendor/jsQR.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // API 요청은 항상 네트워크
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (event.request.method === 'GET' && res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((c) => c || caches.match('/admin/m')))
  );
});
