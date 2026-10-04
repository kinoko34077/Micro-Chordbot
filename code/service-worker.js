importScripts("./pwa-cache-manifest.js");

const manifest = self.__MU_CHORDBOT_PWA_CACHE__;
if (!manifest || typeof manifest.version !== "string" || !Array.isArray(manifest.assets)) {
  throw new Error("invalid PWA cache manifest");
}

const CACHE_PREFIX = "mu-chordbot-";
const CACHE_NAME = `${CACHE_PREFIX}${manifest.version}`;
const ASSETS = manifest.assets;

async function fetchFreshAsset(asset) {
  const request = new Request(asset, {cache: "reload"});
  const response = await fetch(request);
  if (!response || !response.ok) {
    throw new Error(`precache failed: ${asset}`);
  }
  return {request, response};
}

async function precacheCurrentVersion() {
  const cache = await caches.open(CACHE_NAME);
  for (const asset of ASSETS) {
    const {request, response} = await fetchFreshAsset(asset);
    await cache.put(request, response);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheCurrentVersion().then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
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
      const cache = await caches.open(CACHE_NAME);

      if (isShellAsset) {
        try {
          const fresh = await fetch(event.request, {cache: "no-store"});
          if (fresh && fresh.status === 200 && fresh.type === "basic") {
            await cache.put(event.request, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          throw new Error(`offline and no cache: ${event.request.url}`);
        }
      }

      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request, {cache: "no-store"});
      if (response && response.status === 200 && response.type === "basic") {
        await cache.put(event.request, response.clone());
      }
      return response;
    })()
  );
});
