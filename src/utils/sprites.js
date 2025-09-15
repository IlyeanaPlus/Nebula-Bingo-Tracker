// src/utils/sprites.js
// Loads /sprite_index_clip.json (root-served from public/),
// builds the index for matchers, and auto-loads optional /sprite_head.json.
// Includes legacy export getSpriteIndex for back-compat.

import { loadCosineHead } from "./matchers.js"; // explicit extension for ESM

// ---- Base64 decoders --------------------------------------------------------

function b64ToFloat32(b64) {
  if (!b64) return new Float32Array(0);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer); // float32 LE
}

function b64ToUint8(b64) {
  if (!b64) return new Uint8Array(0);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function l2Normalize(vec) {
  let s = 0.0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  s = Math.sqrt(Math.max(s, 1e-12));
  for (let i = 0; i < vec.length; i++) vec[i] /= s;
  return vec;
}

// Decode 64-D shape: Uint8 → Float32 [0..1] → L2
function decodeShape64(b64) {
  const u8 = b64ToUint8(b64);
  if (u8.length !== 64) return null;
  const f = new Float32Array(64);
  for (let i = 0; i < 64; i++) f[i] = u8[i] / 255.0;
  return l2Normalize(f);
}

// ---- URL helpers ------------------------------------------------------------

function joinUrl(...parts) {
  return parts
    .filter(Boolean)
    .map((p, i) =>
      i === 0
        ? String(p).replace(/\/+$/g, "")
        : String(p).replace(/^\/+/g, "").replace(/\/+$/g, "")
    )
    .join("/");
}

function resolveSpriteUrl(item) {
  // Files under /public are served at /
  if (item.drive_cache) return item.drive_cache; // external URL wins
  if (item.sprite) return joinUrl("/sprites", item.sprite); // NOT /public/sprites
  if (item.key) return joinUrl("/sprites", `${item.key}.png`);
  return "";
}

// ---- Loader / Cache ---------------------------------------------------------

let _index = null;    // { dim, count, vecs[], shapes[], refs[] }
let _loading = null;  // Promise to de-dupe loads

export function getRefIndex() {
  return _index;
}

/**
 * Loads and prepares the reference index from /sprite_index_clip.json,
 * then tries to load /sprite_head.json (optional).
 * Safe: on failure, throws (so your UI can show an error) but won’t break the module.
 */
export async function prepareRefIndex(url = "/sprite_index_clip.json") {
  if (_index) return _index;
  if (_loading) return _loading;

  _loading = (async () => {
    // Fetch JSON with no-store so local rebuilds are visible
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      // Don’t hard-crash the app — throw a readable error
      throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
    }
    const json = await res.json();

    const dim = Number(json.dim || json.D || 512);
    const items = Array.isArray(json.items) ? json.items : [];
    if (!dim || !items.length) {
      throw new Error(`Malformed sprite index (dim=${dim}, items=${items.length})`);
    }

    const vecs = new Array(items.length);
    const shapes = new Array(items.length);
    const refs = new Array(items.length);

    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const key = it.key ?? it.id ?? `row_${i}`;
      const name = it.name ?? key;
      const spriteUrl = resolveSpriteUrl(it);

      // Vectors: Float32 dim, L2
      const v = b64ToFloat32(it.vector_b64);
      if (v.length !== dim) {
        throw new Error(`vector length mismatch for ${key}: got ${v.length}, want ${dim}`);
      }
      vecs[i] = l2Normalize(v);

      // Shapes: optional 64-D
      shapes[i] = decodeShape64(it.shape64_b64) || null;

      refs[i] = {
        key,
        name,
        spriteUrl,
        dex: it.dex ?? null,
        slug: it.slug ?? null,
      };
    }

    _index = { dim, count: items.length, vecs, shapes, refs };

    // Try to load cosine head at /sprite_head.json (optional)
    try {
      await loadCosineHead(_index, "/sprite_head.json");
    } catch {
      // ignore — head is optional
    }

    return _index;
  })();

  return _loading;
}

/**
 * Back-compat alias some codebases import:
 * `getSpriteIndex()` → same as prepareRefIndex().
 */
export async function getSpriteIndex(url = "/sprite_index_clip.json") {
  return prepareRefIndex(url);
}

// Optional default export (helps mixed import styles)
export default {
  prepareRefIndex,
  getRefIndex,
  getSpriteIndex,
};
