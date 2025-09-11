// src/utils/matchers.js
// Verbose cosine-similarity matcher with deep logging.
// Works with indices where vectors are Float32Array[] or base64 Float32 strings.
// Reads default threshold from tuningStore but allows an override.

import { tuning } from "../tuning/tuningStore";

const log  = (...a) => console.log("[matchers]", ...a);
const warn = (...a) => console.warn("[matchers]", ...a);

// --- helpers --------------------------------------------------------------

function l2NormalizeInPlace(v) {
  if (!v || !v.length) return v;
  let s = 0.0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

function l2NormalizedCopy(v) {
  if (!v || !v.length) return v;
  let s = 0.0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}

function decodeVecB64(b64) {
  // Assume little-endian float32 (typical on x86 where the file was generated).
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const u8  = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

// Ensure index.vectors = Float32Array[] and index.dim is set
function normalizeIndexLayout(index) {
  if (!index) return index;
  if (Array.isArray(index.vectors) && typeof index.vectors[0] === "string") {
    log("decoding base64 vectors → Float32Array…");
    index.vectors = index.vectors.map(decodeVecB64);
  }
  if (!index.dim && Array.isArray(index.vectors) && index.vectors[0]) {
    index.dim = index.vectors[0].length | 0;
  }
  index.count = index.count ?? (index.vectors?.length | 0);
  return index;
}

// L2-normalize every row of the index if not already done
function ensureIndexNormalized(index) {
  if (!index || !Array.isArray(index.vectors)) return index;
  if (index.normalized) return index;
  let changed = 0;
  for (let i = 0; i < index.vectors.length; i++) {
    const row = index.vectors[i];
    if (row && row.length) {
      l2NormalizeInPlace(row);
      changed++;
    }
  }
  index.normalized = true;
  log(`normalized ${changed} index vectors`);
  return index;
}

// Compute cosine sim (dot of normalized vectors)
function cosineDot(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0.0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// --- main API -------------------------------------------------------------

/**
 * Find best match from a 512-D CLIP index.
 * @param {Float32Array} queryVec - raw or normalized (we'll normalize)
 * @param {object} index - { vectors: Float32Array[], meta:[], dim, count, normalized? }
 * @param {number} [overrideThreshold]
 * @returns {null | {bestIdx:number, score:number, ref:object, spriteUrl?:string, top5:Array}}
 */
export function findBestMatch(queryVec, index, overrideThreshold) {
  const store = (tuning.get?.() || {});
  const threshold = (overrideThreshold ?? store.scoreThreshold ?? 0.28);

  if (!queryVec || !queryVec.length) {
    warn("empty query vector");
    return null;
  }
  if (!index || !Array.isArray(index.vectors) || !index.vectors.length) {
    warn("empty index or vectors missing");
    return null;
  }

  normalizeIndexLayout(index);
  const D = index.dim || queryVec.length;
  if (queryVec.length !== D) {
    warn(`dim mismatch: query=${queryVec.length} vs index=${D} (will compare over min len)`);
  }

  // Normalize once (both query and index).
  ensureIndexNormalized(index);
  const q = l2NormalizedCopy(queryVec);

  log("running", {
    qLen: q.length,
    indexDim: D,
    indexCount: index.count,
    threshold,
  });

  // First pass: best only
  let bestIdx = -1;
  let bestScore = -2.0; // cosine in [-1, 1]
  const N = index.vectors.length;
  for (let i = 0; i < N; i++) {
    const row = index.vectors[i];
    if (!row || !row.length) continue;
    const s = cosineDot(q, row);
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }

  // Second pass: top-5 for logging/inspection
  const top = [];
  for (let i = 0; i < N; i++) {
    const row = index.vectors[i];
    if (!row || !row.length) continue;
    const s = cosineDot(q, row);
    if (top.length < 5) {
      top.push([i, s]);
      top.sort((a, b) => b[1] - a[1]);
    } else if (s > top[top.length - 1][1]) {
      top[top.length - 1] = [i, s];
      top.sort((a, b) => b[1] - a[1]);
    }
  }

  const prettyTop = top.map(([i, s]) => ({
    i,
    score: +s.toFixed(4),
    key: index.meta?.[i]?.key,
    name: index.meta?.[i]?.name,
    hasUrl: !!(index.meta?.[i]?.url || index.meta?.[i]?.sprite || index.meta?.[i]?.drive_cache),
  }));
  log("candidates (top5):", prettyTop);

  if (bestIdx < 0) {
    warn("no candidate produced a score");
    return null;
  }

  const bestMeta = index.meta?.[bestIdx] || {};
  const spriteUrl =
    bestMeta.url ||
    bestMeta.sprite ||
    bestMeta.drive_cache ||
    bestMeta.image ||
    bestMeta.thumb ||
    bestMeta.path ||
    bestMeta?.ref?.url ||
    "";

  if (!(bestScore >= threshold)) {
    warn("best below threshold", {
      bestIdx,
      bestScore: +bestScore.toFixed(4),
      threshold,
      ref: bestMeta,
    });
    return null;
  }

  if (!spriteUrl) {
    warn("best match has no sprite url", {
      bestIdx,
      score: +bestScore.toFixed(4),
      ref: bestMeta,
    });
  } else {
    log("BEST", {
      bestIdx,
      score: +bestScore.toFixed(4),
      key: bestMeta.key,
      name: bestMeta.name,
      spriteUrl,
    });
  }

  return {
    bestIdx,
    score: bestScore,
    ref: bestMeta,
    spriteUrl,
    top5: prettyTop,
  };
}
