// src/utils/sprites.js

/** Resolve a public asset under the correct base URL (works with Vite base + GH Pages). */
export function resolvePublic(pathname) {
  return new URL(pathname, document.baseURI).href;
}

/**
 * getSprites()
 * Loads /public/drive_cache.json and normalizes it into:
 *   { key: { url, name } }
 * - No extension filtering (Drive links often lack .png).
 * - Dedupes by key and by URL.
 */
export async function getSprites() {
  const url = resolvePublic("drive_cache.json");
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`getSprites: failed to fetch ${url} (${res.status})`);
  const data = await res.json();

  const index = {};
  const seenUrls = new Set();

  const add = (key, src, name) => {
    if (!key || !src) return;
    // Normalize to absolute against baseURI so we don't create dup entries
    let abs = src;
    try { abs = new URL(src, document.baseURI).href; } catch {}
    if (seenUrls.has(abs)) return;
    seenUrls.add(abs);
    index[key] = { url: abs, name: name || key };
  };

  if (Array.isArray(data)) {
    // Expect: [{ name, src, ...hashes }]
    for (const entry of data) add(entry?.name || entry?.src, entry?.src, entry?.name);
  } else if (data && typeof data === "object") {
    // Fallback: { key: "https://..." } or { key: { src/url, name? } }
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string") add(k, v, k);
      else if (v && typeof v === "object") add(v.name || k, v.src || v.url, v.name || k);
    }
  }

  console.log("Sprites index count:", Object.keys(index).length);
  return index;
}

/**
 * preloadSprites(index, onStep?, opts?)
 * Concurrently warms the browser cache by loading each sprite URL into an <img>.
 * - onStep(loaded, total) is called after each image settles (load OR error).
 * - opts.concurrency: number of parallel requests (default 24; 12–32 is typical).
 * - opts.retry: number of retries per image (default 1).
 * - Returns { loaded, total } when all settle.
 */
export async function preloadSprites(index, onStep, opts = {}) {
  const items = Object.values(index || {});
  const total = items.length;
  let loaded = 0;

  const concurrency = Math.max(1, opts.concurrency ?? 24);
  const retry = Math.max(0, opts.retry ?? 1);
  const controller = new AbortController(); // optional external abort in future
  const { signal } = controller;

  const loadOne = (src) =>
    new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const tryOnce = (attempt) => {
        if (signal.aborted) return resolve();
        const im = new Image();
        // These help with cross-origin Drive images
        im.crossOrigin = "anonymous";
        im.referrerPolicy = "no-referrer";
        im.decoding = "async";
        im.onload = () => resolve();
        im.onerror = () => {
          if (attempt < retry) {
            // minimal backoff
            setTimeout(() => tryOnce(attempt + 1), 0);
          } else {
            resolve(); // settle even on error; we just won't have it warmed
          }
        };
        // Ensure absolute URL is used
        try {
          im.src = new URL(src, document.baseURI).href;
        } catch {
          im.src = src;
        }
      };
      tryOnce(0);
    });

  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= total) break;
      const src = items[idx].url;
      await loadOne(src);
      loaded += 1;
      onStep?.(loaded, total);
      // Yield every so often to keep the UI responsive
      if (loaded % 50 === 0) await Promise.resolve();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
  return { loaded, total };
}
