const CACHE_NAME = "mu-chordbot-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./src/app.js",
  "./src/audio.js",
  "./src/history.js",
  "./src/pitch.js",
  "./src/storage.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  const isShellAsset =
    requestUrl.pathname.endsWith("/") ||
    requestUrl.pathname.endsWith("/index.html") ||
    requestUrl.pathname.endsWith(".js") ||
    requestUrl.pathname.endsWith(".css") ||
    requestUrl.pathname.endsWith(".webmanifest");

  event.respondWith(
    (async () => {
      if (isShellAsset) {
        try {
          const fresh = await fetch(event.request, { cache: "no-store" });
          if (fresh && fresh.status === 200 && fresh.type === "basic") {
            const cloned = fresh.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return fresh;
        } catch {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          throw new Error(`offline and no cache: ${event.request.url}`);
        }
      }

      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response && response.status === 200 && response.type === "basic") {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
      }
      return response;
    })()
  );
});
