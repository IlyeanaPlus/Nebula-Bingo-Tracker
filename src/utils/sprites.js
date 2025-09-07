// src/utils/sprites.js

// Resolve a public asset under the correct base URL (works with Vite base + GH Pages)
function resolvePublic(pathname) {
  return new URL(pathname, document.baseURI).href;
}

/**
 * getSprites()
 * Loads /public/drive_cache.json and normalizes it into { key: { url, name } }.
 * NOTE: Do NOT filter by file extension — Drive links often have no .png suffix.
 */
export async function getSprites() {
  const url = resolvePublic("drive_cache.json");
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`getSprites: failed to fetch ${url} (${res.status})`);
  const data = await res.json();

  const index = {};
  const add = (key, src, name) => {
    if (!key || !src) return;
    index[key] = { url: src, name: name || key };
  };

  if (Array.isArray(data)) {
    for (const entry of data) add(entry?.name || entry?.src, entry?.src, entry?.name);
  } else if (data && typeof data === "object") {
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
 * - opts.concurrency: number of parallel requests (default 16, try 24–32 if your host is snappy).
 * - opts.retry: number of retries per image (default 1).
 */
export async function preloadSprites(index, onStep, opts = {}) {
  const items = Object.values(index || {});
  const total = items.length;
  let loaded = 0;

  const concurrency = Math.max(1, opts.concurrency ?? 16);
  const retry = Math.max(0, opts.retry ?? 1);

  const loadOne = (src) =>
    new Promise((resolve) => {
      const tryOnce = (attempt) => {
        const im = new Image();
        im.onload = im.onerror = () => resolve();
        try {
          im.src = new URL(src, document.baseURI).href;
        } catch {
          im.src = src;
        }
        // If it errors, try again (lightweight) on next tick
        if (attempt < retry) {
          im.onerror = () => setTimeout(() => tryOnce(attempt + 1), 0);
        }
      };
      tryOnce(0);
    });

  let i = 0;
  // worker pool
  const worker = async () => {
    while (true) {
      const idx = i++;
      if (idx >= total) break;
      const src = items[idx].url;
      await loadOne(src);
      loaded += 1;
      onStep?.(loaded, total);
      // Give the main thread a breath every so often
      if (loaded % 50 === 0) await Promise.resolve();
    }
  };

  // launch pool
  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
  return { loaded, total };
}
