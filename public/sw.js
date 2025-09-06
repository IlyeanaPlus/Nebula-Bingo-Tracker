// /public/sw.js
const CACHE_NAME = 'nbt-sprites-v1';
const MANIFEST_CANDIDATES = [
  'drive_cache.json',
  '/drive_cache.json',
  'sprites.json',
  '/sprites.json',
  '/cache/drive.json',
];

// Small helper: chunk long arrays so we don't burst requests.
const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Try to fetch a local manifest and pre-cache those image URLs.
    for (const path of MANIFEST_CANDIDATES) {
      try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        const list = json.files || json.images || json.items || json.list || json || [];
        const urls = list
          .map((f) => f && (f.url || f.thumbnailLink || f.webContentLink))
          .filter(Boolean);

        if (urls.length) {
          const cache = await caches.open(CACHE_NAME);
          // Use no-cors so cross-origin image responses cache as opaque (fine for <img> + canvas hashing).
          for (const group of chunk(urls, 25)) {
            await Promise.allSettled(
              group.map((u) => cache.add(new Request(u, { mode: 'no-cors' })))
            );
          }
          break;
        }
      } catch {
        // Try next candidate
      }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Cache-first for lh3.googleusercontent.com images (your sprites)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSprite =
    url.hostname === 'lh3.googleusercontent.com' ||
    url.hostname.endsWith('.googleusercontent.com');

  if (!isSprite || req.destination !== 'image') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;

    try {
      const net = await fetch(req);
      // Cache successful responses (opaque is fine).
      cache.put(req, net.clone());
      return net;
    } catch {
      return cached || Response.error();
    }
  })());
});
