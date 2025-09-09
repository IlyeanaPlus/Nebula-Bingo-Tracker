// src/utils/sprites.js
// Single source of truth for loading the CLIP sprite index.
// Uses Vite/GitHub-Pages–safe path resolution (no "/public" at runtime).

import { resolvePublic } from "./publicPath"; // same helper you use elsewhere

// Default index lives at public/sprite_index_clip.json → served at /<base>/sprite_index_clip.json
let SPRITE_INDEX_URL = resolvePublic("sprite_index_clip.json");
let _indexPromise = null;

/** Optionally point to a different index path (relative names are resolved via resolvePublic). */
export function setSpriteIndexUrl(url) {
  if (!url) return;
  // Allow absolute http(s)://, absolute-from-origin (/foo), or relative ("foo/bar.json")
  if (/^https?:\/\//i.test(url)) {
    SPRITE_INDEX_URL = url;
  } else if (url.startsWith("/")) {
    // Keep absolute-from-origin as-is (useful for testing)
    SPRITE_INDEX_URL = url;
  } else {
    SPRITE_INDEX_URL = resolvePublic(url.replace(/^public\//, "")); // tolerate "public/..." inputs
  }
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

/** L2-normalize vector */
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
    const tried = [];
    const candidates = [
      SPRITE_INDEX_URL,                            // explicit/default
      resolvePublic("sprite_index_clip.json"),     // safety: recompute
      "/sprite_index_clip.json",                   // last-resort absolute (useful locally)
    ];

    let raw = null, lastErr;
    for (const u of candidates) {
      if (tried.includes(u)) continue;
      tried.push(u);
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
    if (!raw) {
      throw new Error(`[sprites] failed to load sprite index (${tried.join(" → ")}): ${lastErr?.message || "unknown"}`);
    }

    // Accept either {vectors:[], meta:[]} or legacy array form (meta-only)
    const meta = raw.meta || (Array.isArray(raw) ? raw : []);
    const V = raw.vectors || [];
    const vectors = new Array(meta.length);

    if (Array.isArray(V) && V.length === meta.length) {
      for (let i = 0; i < V.length; i++) {
        const vi = V[i];
        let f32;
        if (typeof vi === "string") f32 = b64ToFloat32(vi);
        else if (Array.isArray(vi)) f32 = new Float32Array(vi);
        else if (vi instanceof Float32Array) f32 = vi;
        else throw new Error("Unsupported vector entry type");
        vectors[i] = l2(f32); // normalize for cosine sims
      }
    } else if (V.length && V.length !== meta.length) {
      console.warn("[sprites] vector/meta length mismatch:", V.length, meta.length);
    } else if (!V.length) {
      console.warn("[sprites] no vectors in index; matching will not work!");
    }

    return { vectors, meta }; // N-length arrays
  })();

  return _indexPromise;
}

/** Legacy helper: return only meta list. */
export async function getSprites() {
  const { meta } = await getSpriteIndex();
  return meta;
}

/** No-op preload (kept for API compatibility). */
export async function preloadSprites(/* countOrIndex, onProgress, opts */) {
  return [];
}
