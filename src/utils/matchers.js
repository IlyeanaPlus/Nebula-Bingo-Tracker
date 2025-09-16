// src/utils/matchers.js
// Cosine matcher for the v4/v3 loader shape: { items[], getVector(i), dim, count }.
// No references to `meta`. Returns rich objects you can render directly.

/** @param {Float32Array} a @param {Float32Array} b */
function dot(a, b) {
  let s = 0.0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Build a cosine search head over the packed index.
 * @param {{items: any[], getVector: (i:number)=>Float32Array}} index
 */
export function cosineHead(index) {
  if (!index || !Array.isArray(index.items) || typeof index.getVector !== "function") {
    throw new Error("Invalid index: expected items[] and getVector(i).");
  }
  const { items, getVector } = index;

  return {
    /**
     * Top-K cosine search.
     * @param {Float32Array} q  L2-normalized 512-D query vector
     * @param {number} k       number of results (>=1)
     * @returns {{idx:number, score:number, ref:object}[]}
     */
    query(q, k = 5) {
      const K = Math.max(1, k | 0);
      // Simple & reliable path: score everything, then slice top-K.
      // For ~1–2k items this is perfectly fine and very debuggable.
      const scored = new Array(items.length);
      for (let i = 0; i < items.length; i++) {
        const v = getVector(i);             // zero-copy row view into the packed Float32Array
        scored[i] = { idx: i, score: dot(q, v), ref: items[i] };
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, K);
    },
  };
}

/**
 * Convenience: best match above threshold (else null).
 * @param {Float32Array} q
 * @param {{items:any[], getVector:(i:number)=>Float32Array}} index
 * @param {number} thresh 0..1 (defaults to 0)
 */
export function findBestMatch(q, index, thresh = 0.0) {
  const head = cosineHead(index);
  const [best] = head.query(q, 1);
  if (!best) return null;
  const t = Number.isFinite(thresh) ? +thresh : 0;
  return best.score >= t ? best : null;
}
