const RESET_CACHE_VERSION = "visitor-reset-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve(RESET_CACHE_VERSION));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("tracker-visitor-"))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => Promise.all(
        clients.map((client) => {
          try {
            const url = new URL(client.url);
            if (url.pathname.startsWith("/v/")) return client.navigate("/");
          } catch (_) {}
          return Promise.resolve();
        }),
      ))
      .then(() => self.registration.unregister()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === "navigate" && url.pathname.startsWith("/v/")) {
    event.respondWith(Response.redirect("/", 302));
  }
});
