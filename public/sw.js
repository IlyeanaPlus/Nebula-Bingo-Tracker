/* global self, caches, fetch */
const BASE = self.registration.scope; // base-aware for GitHub Pages
const CACHE_APP = 'nebula-bingo-app-v2-2';
const CACHE_OTHER = 'nebula-bingo-other-v2-1';

// Precaches only app shell
const PRECACHE = [BASE, BASE + 'index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    await cache.addAll(PRECACHE);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => {
      if (n !== CACHE_APP && n !== CACHE_OTHER) {
        return caches.delete(n);
      }
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  const url = new URL(req.url);
  const isManifest = url.pathname.endsWith('/drive_cache.json') || url.pathname === BASE + 'drive_cache.json';

  if (isManifest) {
    // Network-first for manifest
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_OTHER);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_OTHER);
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error('Offline and no manifest in cache');
      }
    })());
    return;
  }

  // Cache-first for other same-origin GETs
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_OTHER);
    const cached = await cache.match(req);
    if (cached) return cached;
    const resp = await fetch(req);
    cache.put(req, resp.clone());
    return resp;
  })());
});
