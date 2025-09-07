// src/utils/sprites.js

/**
 * Resolve a public asset under the correct base URL (works with Vite base and GH Pages).
 */
function resolvePublic(pathname) {
  return new URL(pathname, document.baseURI).href;
}

/**
 * getSprites()
 * Loads /public/drive_cache.json and normalizes it into:
 *   { key: { url, name } }
 * Filters to .png URLs only.
 */
export async function getSprites() {
  const url = resolvePublic("drive_cache.json");
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`getSprites: failed to fetch ${url} (${res.status})`);
  }
  const data = await res.json();

  const index = {};
  if (Array.isArray(data)) {
    // Entries like { id, url, name? }
    for (const entry of data) {
      if (!entry) continue;
      const key = entry.id || entry.name || entry.url;
      if (!key || !entry.url) continue;
      if (!String(entry.url).toLowerCase().endsWith(".png")) continue;
      index[key] = { url: entry.url, name: entry.name || key };
    }
  } else if (data && typeof data === "object") {
    // Entries like { "Bulbasaur": "https://...png" } or { key: { url: "...", name? } }
    for (const [k, v] of Object.entries(data)) {
      if (!v) continue;
      if (typeof v === "string") {
        if (!v.toLowerCase().endsWith(".png")) continue;
        index[k] = { url: v, name: k };
      } else if (v.url && typeof v.url === "string" && v.url.toLowerCase().endsWith(".png")) {
        index[k] = { url: v.url, name: v.name || k };
      }
    }
  }
  return index;
}

/**
 * preloadSprites(index, onStep?)
 * Warms the browser cache by loading each sprite URL into an <img>.
 * Calls onStep(loaded, total) as it progresses.
 */
export async function preloadSprites(index, onStep) {
  const items = Object.values(index || {});
  const total = items.length;
  let loaded = 0;

  const loadOne = (src) =>
    new Promise((resolve) => {
      const im = new Image();
      im.onload = im.onerror = () => resolve();
      try {
        im.src = new URL(src, document.baseURI).href;
      } catch {
        im.src = src;
      }
    });

  for (const it of items) {
    await loadOne(it.url);
    loaded += 1;
    onStep?.(loaded, total);
  }
  return { loaded, total };
}
