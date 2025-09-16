// src/utils/spriteUrl.js
export function resolveSpriteUrl(ref) {
  if (!ref) return null;
  const base = (import.meta?.env?.BASE_URL ?? "/");
  if (ref.path)  return join(base, strip(ref.path));               // v3
  if (ref.sprite) return join(base, `sprites/${strip(ref.sprite)}`); // v2
  return null;
}
function join(base, rel){ return (base.endsWith("/")?base:base+"/") + strip(rel); }
function strip(s){ return String(s||"").replace(/^\/+/, ""); }
