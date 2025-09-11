/* global self, caches, fetch */
const SCOPE = self.registration.scope; // base-aware for GH Pages
const DEV = /^(http|https):\/\/(localhost|127\.0\.0\.1)/.test(SCOPE);

// Bump versions to evict any bad cached JS/HTML
const CACHE_APP   = 'nbt-app-v3';
const CACHE_OTHER = 'nbt-static-v3';

// Only precache the shell in production
const PRECACHE = DEV ? [] : [SCOPE, SCOPE + 'index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (!DEV) {
      const cache = await caches.open(CACHE_APP);
      await cache.addAll(PRECACHE);
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.map((n) => (n === CACHE_APP || n === CACHE_OTHER) ? null : caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only GET + same-origin
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // Never interfere in dev (let Vite handle everything)
  if (DEV) return;

  // Network-first for the manifest
  if (url.pathname.endsWith('/drive_cache.json') || url.pathname === SCOPE + 'drive_cache.json') {
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

  // Don’t cache dev/HMR/module-ish things or “import” warmups
  const isDevish =
    url.pathname.startsWith(SCOPE + 'src/') ||
    url.pathname.includes('/src/') ||
    url.pathname.includes('/node_modules/') ||
    url.pathname.includes('@react-refresh') ||
    url.searchParams.has('import') ||
    url.pathname.endsWith('.jsx') ||
    url.pathname.endsWith('.map');

  if (isDevish) return; // bypass SW

  // Avoid caching HTML except index.html shell
  const accept = req.headers.get('accept') || '';
  const isHTML = req.destination === 'document' || accept.includes('text/html');
  if (isHTML && url.pathname !== SCOPE && url.pathname !== SCOPE + 'index.html') {
    return; // let network handle it, don’t cache
  }

  // Static assets we *do* want to cache (build output / public)
  const isStaticPath =
    url.pathname.startsWith(SCOPE + 'assets/') ||
    url.pathname.startsWith(SCOPE + 'sprites/') ||
    url.pathname.startsWith(SCOPE + 'ort/');

  const isCodeBlob =
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.mjs') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg');

  if (isStaticPath || isCodeBlob) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_OTHER);
      const cached = await cache.match(req);
      if (cached) return cached;
      const resp = await fetch(req);
      // only cache non-HTML (prevents “HTML for JS” bugs)
      const ct = resp.headers.get('content-type') || '';
      if (resp.ok && !ct.includes('text/html')) {
        cache.put(req, resp.clone());
      }
      return resp;
    })());
    return;
  }

  // Fallback: network-first, cache successful non-HTML responses
  event.respondWith((async () => {
    try {
      const resp = await fetch(req);
      const ct = resp.headers.get('content-type') || '';
      if (resp.ok && !ct.includes('text/html')) {
        const cache = await caches.open(CACHE_OTHER);
        cache.put(req, resp.clone());
      }
      return resp;
    } catch {
      const cache = await caches.open(CACHE_OTHER);
      const hit = await cache.match(req);
      if (hit) return hit;
      throw new Error('Offline and not cached');
    }
  })());
});
