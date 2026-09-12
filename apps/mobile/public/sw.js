/**
 * Minimal service worker.
 *
 * Its job is to make SideQuest installable and to keep the shell openable when
 * the network is flaky on a walk. It deliberately does NOT cache API responses:
 * location readings, sessions, and party presence are time-sensitive, and a
 * stale cached position is worse than no position at all.
 */
const CACHE = "sidequest-shell-v1";
const SHELL = ["/", "/manifest.json", "/favicon.png", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  // Individual failures must not abort the whole install (a hashed bundle path
  // can change between builds), so each entry is added best-effort.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never serve a cached API response. Location data must be live or absent.
  if (url.pathname.startsWith("/v1/")) return;

  // Navigations: network first, falling back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Static assets: cache first, since bundle filenames are content-hashed.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
