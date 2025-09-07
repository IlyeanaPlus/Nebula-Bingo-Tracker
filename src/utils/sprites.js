// src/utils/sprites.js
/**
 * getSprites()
 * Loads the reference sprite index from the public drive cache and prepares URLs.
 * Expects: /drive_cache.json in public/ with entries containing .png URLs.
 * Returns a map/object suitable for prepareRefIndex() down the pipeline.
 */
export async function getSprites() {
  // Public root fetch
  const res = await fetch("/drive_cache.json", { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`getSprites: failed to fetch /drive_cache.json (${res.status})`);
  }
  const data = await res.json();

  // Accept both array or object formats; normalize to { key: { url, ... } }
  const index = {};
  if (Array.isArray(data)) {
    // Expect entries like {id, url, name?}
    for (const entry of data) {
      if (!entry) continue;
      const key = entry.id || entry.name || entry.url;
      if (!key || !entry.url) continue;
      if (!entry.url.toLowerCase().endsWith(".png")) continue;
      index[key] = { url: entry.url, name: entry.name || key };
    }
  } else if (data && typeof data === "object") {
    // e.g., { "Bulbasaur": "https://...png", ... } or { key: {url: "..."} }
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
