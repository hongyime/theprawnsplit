const CACHE_NAME = "theprawnsplit-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg"];
const CACHEABLE_PREFIXES = ["/assets/"];

function isCacheable(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return APP_SHELL.includes(url.pathname) || CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (!isCacheable(event.request)) return;
  const url = new URL(event.request.url);
  const isShell = event.request.mode === "navigate" || url.pathname === "/";

  if (isShell) {
    // Network-first: always try for a fresh shell, fall back to cache offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || Response.error())),
    );
    return;
  }

  // Hashed assets: cache-first is correct — the filename changes when contents do.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    }),
  );
});
