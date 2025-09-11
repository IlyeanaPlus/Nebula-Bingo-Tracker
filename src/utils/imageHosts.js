// src/utils/imageHosts.js
// Local-only sprite URL resolver. Ignores any remote/drive links.

function keyOf(meta) {
  return (
    meta?.key ||
    meta?.id ||
    meta?.ref?.key ||
    ""
  );
}

/**
 * Resolve a sprite URL from index/meta in local-only mode.
 * Accepts:
 *  - meta.sprite: "name.png" or "/sprites/name.png"
 *  - otherwise falls back to "/sprites/<key>.png"
 */
export function spriteUrlFromMeta(meta) {
  const sp = meta?.sprite;
  if (typeof sp === "string") {
    // If already absolute under /sprites, use as-is.
    if (sp.startsWith("/sprites/")) return sp;
    // If it's just a filename, mount it under /sprites/.
    if (!sp.startsWith("http")) return `/sprites/${sp.replace(/^\/?sprites\//, "")}`;
  }
  const key = keyOf(meta);
  return key ? `/sprites/${key}.png` : "";
}

// Kept for compatibility with older imports; no-op in local mode.
export function spriteUrlFromKey(key) {
  return key ? `/sprites/${key}.png` : "";
}
export function spriteUrlFromMatch(match) {
  const meta = match?.ref || match?.meta || match;
  return spriteUrlFromMeta(meta);
}
export function ensureLocalCacheLoaded() { return Promise.resolve(null); }
