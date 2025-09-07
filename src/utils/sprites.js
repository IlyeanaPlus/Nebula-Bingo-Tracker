// src/utils/sprites.js

function resolvePublic(pathname) {
  return new URL(pathname, document.baseURI).href;
}

export async function getSprites() {
  const url = resolvePublic("drive_cache.json");
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`getSprites: failed to fetch ${url} (${res.status})`);
  const data = await res.json();

  const index = {};
  if (Array.isArray(data)) {
    // Your drive_cache.json is an array of { name, src, ... }
    for (const entry of data) {
      if (!entry?.name || !entry?.src) continue;
      if (!entry.src.toLowerCase().endsWith(".png")) continue;
      index[entry.name] = { url: entry.src, name: entry.name };
    }
  } else if (data && typeof data === "object") {
    // Fallback for object formats
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string") {
        if (!v.toLowerCase().endsWith(".png")) continue;
        index[k] = { url: v, name: k };
      } else if (v?.src && v.src.toLowerCase().endsWith(".png")) {
        index[v.name || k] = { url: v.src, name: v.name || k };
      }
    }
  }

  console.log("Sprites index count:", Object.keys(index).length);
  return index;
}

export async function preloadSprites(index, onStep) {
  const items = Object.values(index || {});
  const total = items.length;
  let loaded = 0;

  const loadOne = (src) =>
    new Promise((resolve) => {
      const im = new Image();
      im.onload = im.onerror = () => resolve();
      im.src = src;
    });

  for (const it of items) {
    await loadOne(it.url);
    loaded += 1;
    onStep?.(loaded, total);
  }
  return { loaded, total };
}
