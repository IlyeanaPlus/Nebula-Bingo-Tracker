// public/sw.js
const BASE = new URL(self.registration.scope).pathname; // e.g. "/Nebula-Bingo-Tracker/"
const CACHE = "nebula-bingo-v3";
const ASSETS = [BASE, BASE + "index.html"]; // don't precache drive_cache.json

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin && url.pathname.startsWith(BASE);

  // Network-first for the manifest regardless of base prefix
  if (sameOrigin && url.pathname.endsWith("drive_cache.json")) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for other same-origin GETs under BASE
  if (sameOrigin && e.request.method === "GET") {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached ||
        fetch(e.request).then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        })
      )
    );
    return;
  }

  e.respondWith(fetch(e.request));
});
