// src/utils/matchers.js
// Cosine best-match against preloaded CLIP index.

import { tuning } from "../tuning/tuningStore";

function pickSpriteUrl(ref) {
  if (!ref) return null;
  return (
    ref.drive_cache ||  // your GH cached sprites
    ref.sprite ||       // common key name
    ref.url ||          // generic
    ref.image ||        // alt
    ref.thumb ||        // alt
    ref.path ||         // alt
    null
  );
}

/**
 * @param {Float32Array|number[]} embed - CLIP embedding for a crop
 * @param {{vectors: Float32Array[], meta: any[]}} index - preloaded index
 * @param {number} threshold - cosine similarity threshold (0..1)
 * @returns {{idx:number, score:number, ref:any, matchUrl:string}|null}
 */
export function findBestMatch(embed, index, threshold = 0.28) {
   // live threshold unless caller passes their own
   if (threshold === undefined || threshold === null) {
     threshold = tuning.get().scoreThreshold;
   }
 const V = index?.vectors || [];
  const M = index?.meta || [];
  if (!V.length || V.length !== M.length) {
    console.warn("[matchers] bad index: vectors=", V.length, "meta=", M.length);
    return null;
  }

  // Ensure 'embed' is Float32Array
  const q = embed instanceof Float32Array ? embed : new Float32Array(embed);

  // Cosine with normalized vectors (index vectors are already l2-normalized)
  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    let s = 0.0;
    // Manual dot-product for speed & no deps
    for (let k = 0; k < q.length; k++) s += q[k] * v[k];
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return null;

  const ref = M[bestIdx] || null;
  const url = pickSpriteUrl(ref);
  const score = Math.max(0, bestScore); // clamp tiny negatives

  if (!url || score < threshold) return null;

  return { idx: bestIdx, score, ref, matchUrl: url };
}
