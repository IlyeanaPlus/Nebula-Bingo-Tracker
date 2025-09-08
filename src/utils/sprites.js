// src/utils/sprites.js
// Single source of truth for loading the CLIP sprite index.
// Supports base64 Float32 vectors or numeric arrays; caches in-memory.

let SPRITE_INDEX_URL = "/sprite_index_clip.json";
let _indexPromise = null;

/** Optionally point to a different index path */
export function setSpriteIndexUrl(url) {
  SPRITE_INDEX_URL = url || SPRITE_INDEX_URL;
  _indexPromise = null; // reset cache
}

/** Decode a base64 string into Float32Array */
function b64ToFloat32(b64) {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

/** Normalize vector to unit length */
function l2(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}

/** Load and cache the CLIP index (vectors + meta). */
export async function getSpriteIndex() {
  if (_indexPromise) return _indexPromise;

  _indexPromise = (async () => {
    // Try filtered index first; fall back to legacy names if you keep them
    const urls = [SPRITE_INDEX_URL, "/public/sprite_index_clip.json"];
    let raw = null, lastErr;

    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        raw = await res.json();
        console.log("[sprites] loaded index:", u, "entries=", raw?.meta?.length || raw?.length || 0);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!raw) throw new Error(`[sprites] failed to load sprite index: ${lastErr?.message || "unknown"}`);

    // Accept either {vectors:[], meta:[]} or legacy array form (meta-only)
    let meta = raw.meta || (Array.isArray(raw) ? raw : []);
    let V = raw.vectors || [];

    // Decode vectors if needed
    const vectors = new Array(meta.length);
    if (Array.isArray(V) && V.length === meta.length) {
      // Either base64 strings or numeric arrays
      for (let i = 0; i < V.length; i++) {
        const vi = V[i];
        let f32;
        if (typeof vi === "string") f32 = b64ToFloat32(vi);
        else if (Array.isArray(vi)) f32 = new Float32Array(vi);
        else if (vi instanceof Float32Array) f32 = vi;
        else throw new Error("Unsupported vector entry type");
        vectors[i] = l2(f32); // store normalized (cosine match is fast)
      }
    } else if (V.length && V.length !== meta.length) {
      console.warn("[sprites] vector/meta length mismatch:", V.length, meta.length);
    } else {
      console.warn("[sprites] no vectors in index; matching will not work!");
    }

    // Build compact accessor object
    const index = { vectors, meta }; // both arrays length N
    return index;
  })();

  return _indexPromise;
}

/** Legacy helper name kept for callers that expect sprite ‘meta’ only. */
export async function getSprites() {
  const { meta } = await getSpriteIndex();
  return meta;
}

/** No-op now (we don’t need to preload images for matching). */
export async function preloadSprites(/* countOrIndex, onProgress, opts */) {
  return [];
}
