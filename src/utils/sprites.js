// src/utils/sprites.js

// Resolve a public asset under the correct base URL (works with Vite base + GH Pages)
function resolvePublic(pathname) {
  return new URL(pathname, document.baseURI).href;
}

/**
 * getSprites()
 * Loads /public/drive_cache.json and normalizes it into:
 *   { key: { url, name } }
 * NOTE: Do NOT filter by file extension. Google Drive links (lh3.googleusercontent.com/d/ID)
 *       often have no .png suffix but still serve PNG content.
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
    // Your format: [{ name, src, ...hashes }]
    for (const entry of data) add(entry?.name || entry?.src, entry?.src, entry?.name);
  } else if (data && typeof data === "object") {
    // Fallback formats:
    // { key: "https://...", ... } OR { key: { src: "https://...", name? } }
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string") add(k, v, k);
      else if (v && typeof v === "object") add(v.name || k, v.src || v.url, v.name || k);
    }
  }

  console.log("Sprites index count:", Object.keys(index).length);
  return index;
}

/**
 * preloadSprites(index, onStep?)
 * Sequentially warms the browser cache by loading each sprite URL into an <img>.
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
      // Drive links may be relative/absolute; make them absolute against baseURI for safety
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
