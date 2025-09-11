// src/utils/matchers.js
// Robust cosine-similarity matching against a flat Float32Array index.
// Compatible with both legacy and new sprite index formats.
// Exports:
//  - l2norm, cosineSim
//  - decodeB64Float32 (for callers that need it)
//  - prepareRefIndex(raw)  -> { dim, count, vectors: Float32Array, meta: Array, normalized: true }
//  - getVectorAt(index, i) -> Float32Array (view)
//  - findTopK(vec, index, k=5, minScore=0)
//  - findBestMatch(vec, index, threshold=0.22)
//  - pickSpriteUrl(meta)   -> local-only resolver via imageHosts

import { spriteUrlFromMeta } from "./imageHosts";

/* ---------- math helpers ---------- */

export function l2norm(v) {
  let s = 0.0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0.0;
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

/**
 * Cosine sim between vec (length=dim) and a row in base starting at offset.
 * Assumes both are L2-normalized.
 */
export function cosineSim(vec, base, offset, dim) {
  let s = 0.0;
  // unrolled 4x gives a small boost; keep tight and branchless
  let i = 0;
  const end = offset + dim;
  while (offset + i + 3 < end) {
    s += vec[i] * base[offset + i];
    s += vec[i + 1] * base[offset + i + 1];
    s += vec[i + 2] * base[offset + i + 2];
    s += vec[i + 3] * base[offset + i + 3];
    i += 4;
  }
  for (; offset + i < end; i++) s += vec[i] * base[offset + i];
  return s;
}

/* ---------- index parsing / normalization ---------- */

export function decodeB64Float32(b64) {
  if (!b64) return new Float32Array(0);
  const bin = atob(b64);
  const ab = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(ab);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(ab);
}

// Normalize various raw shapes to the flat matrix form used in search.
export function prepareRefIndex(raw) {
  if (!raw) throw new Error("prepareRefIndex: empty input");

  // NEW format: { dim, items:[{ key,name,drive_cache?,sprite?,vector_b64 }] }
  if (Array.isArray(raw.items)) {
    const dim = raw.dim || 512;
    const count = raw.items.length | 0;
    const vectors = new Float32Array(dim * count);
    const meta = new Array(count);

    for (let i = 0; i < count; i++) {
      const it = raw.items[i] || {};
      const v = decodeB64Float32(it.vector_b64 || "");
      if (v.length !== dim) {
        console.warn("[matchers] item dim mismatch", it.key, v.length, dim);
      }
      vectors.set(v.subarray(0, dim), i * dim);
      meta[i] = { key: it.key, name: it.name, sprite: it.sprite };
    }
    // NEW indexes are produced normalized; mark as such
    return { dim, count, vectors, meta, normalized: true };
  }

  // LEGACY format: { vectors:[b64...], meta:[...] }
  if (Array.isArray(raw.vectors) && Array.isArray(raw.meta)) {
    const first = decodeB64Float32(raw.vectors[0] || "");
    const dim = first.length || 512;
    const count = raw.vectors.length | 0;
    const vectors = new Float32Array(dim * count);

    for (let i = 0; i < count; i++) {
      const v = decodeB64Float32(raw.vectors[i] || "");
      if (v.length !== dim) {
        console.warn("[matchers] legacy dim mismatch @", i, v.length, dim);
      }
      // Many legacy dumps were already normalized; we’ll still normalize defensively below.
      vectors.set(v.subarray(0, dim), i * dim);
    }

    const out = { dim, count, vectors, meta: raw.meta.slice(), normalized: false };
    ensureNormalizedInPlace(out);
    return out;
  }

  // Already normalized form?
  if (
    raw &&
    Number.isFinite(raw.dim) &&
    Number.isFinite(raw.count) &&
    raw.vectors instanceof Float32Array &&
    Array.isArray(raw.meta)
  ) {
    // Normalize if not marked
    const out = { ...raw };
    if (!out.normalized) ensureNormalizedInPlace(out);
    return out;
  }

  throw new Error("prepareRefIndex: unrecognized index shape");
}

/**
 * Ensure each row in index.vectors is L2-normalized (in-place).
 * NO-OP if index.normalized === true.
 */
function ensureNormalizedInPlace(index) {
  if (index.normalized) return;
  const { dim, count, vectors } = index;
  for (let i = 0; i < count; i++) {
    let s = 0.0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) {
      const x = vectors[off + d];
      s += x * x;
    }
    const inv = s > 0 ? 1 / Math.sqrt(s) : 0.0;
    for (let d = 0; d < dim; d++) vectors[off + d] *= inv;
  }
  index.normalized = true;
}

/* ---------- utility views ---------- */

export function getVectorAt(index, i) {
  const { dim, count, vectors } = index || {};
  if (!index || !vectors || !Number.isFinite(dim) || i < 0 || i >= count) {
    return new Float32Array(0);
  }
  return vectors.subarray(i * dim, (i + 1) * dim);
}

/* ---------- matching ---------- */

/**
 * Return top-k matches with scores >= minScore.
 * vec must be L2-normalized and have length == index.dim.
 */
export function findTopK(vec, index, k = 5, minScore = 0) {
  if (!index || !index.vectors || !Number.isFinite(index.dim)) return [];
  const dim = index.dim | 0;
  if (!vec || vec.length !== dim) {
    console.warn("[matchers] dim mismatch:", vec?.length, "vs", dim);
    return [];
  }

  const base = index.vectors;
  const n = index.count | 0;

  // simple k-best
  const top = new Array(k).fill(null); // {i, s}
  const tryPush = (i, s) => {
    if (s < minScore) return;
    // insert sorted desc
    let j = k - 1;
    if (!top[j] || s > top[j].s) {
      // bubble up
      while (j > 0 && top[j - 1] && s > top[j - 1].s) {
        top[j] = top[j - 1];
        j--;
      }
      top[j] = { i, s };
    }
  };

  for (let i = 0; i < n; i++) {
    const s = cosineSim(vec, base, i * dim, dim);
    tryPush(i, s);
  }

  // map to enriched results
  const out = [];
  for (const e of top) {
    if (!e) continue;
    const ref = index.meta?.[e.i] || { key: String(e.i) };
    out.push({
      index: e.i,
      score: e.s,
      ref,
      spriteUrl: spriteUrlFromMeta(ref),
    });
  }
  return out;
}

/**
 * Return the single best match if score >= threshold, else null.
 */
export function findBestMatch(vec, index, threshold = 0.22) {
  if (!index || !index.vectors || !Number.isFinite(index.dim)) return null;
  const dim = index.dim | 0;
  if (!vec || vec.length !== dim) {
    console.warn("[matchers] dim mismatch:", vec?.length, "vs", dim);
    return null;
  }

  const base = index.vectors;
  const n = index.count | 0;

  let bestI = -1, bestS = -1.0;
  for (let i = 0; i < n; i++) {
    const s = cosineSim(vec, base, i * dim, dim);
    if (s > bestS) { bestS = s; bestI = i; }
  }
  if (bestI < 0 || bestS < threshold) return null;

  const ref = index.meta?.[bestI] || { key: String(bestI) };
  return {
    index: bestI,
    score: bestS,
    ref,
    spriteUrl: spriteUrlFromMeta(ref),
  };
}

/* ---------- optional convenience ---------- */

// Kept for compatibility with older code paths that expect a "pick" util.
export function pickSpriteUrl(metaLike) {
  return spriteUrlFromMeta(metaLike?.ref || metaLike);
}
