// src/utils/spriteMatch.js
// Cosine matching against the preloaded sprite index.
// Assumes vectors in the index are already L2-normalized (our sprites.js does this).

import { getSpriteIndex } from "./sprites";

/** Cosine argmax for a single embedding */
function bestMatch(vec, vectors, meta, threshold = 0.28) {
  let best = -2.0, idx = -1;
  // vec is Float32Array(512), vectors[i] are Float32Array(512)
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    let s = 0.0;
    // tight loop, no bounds checks
    for (let d = 0; d < vec.length; d++) s += vec[d] * v[d];
    if (s > best) { best = s; idx = i; }
  }
  if (idx < 0 || best < threshold) return null;
  const m = meta[idx] || {};
  // prefer drive_cache, fall back to thumb or url-ish fields
  const url = m.drive_cache || m.thumb || m.url || m.image || null;
  return { index: idx, score: best, meta: m, url };
}

/**
 * Match an array of embeddings to the sprite index.
 * @param {Float32Array[]} embeds  array of 512-d Float32Array
 * @param {{threshold?:number}} opts
 * @returns {Promise<(null|{index:number,score:number,meta:any,url:string|null})[]>}
 */
export async function matchEmbeds(embeds, opts = {}) {
  const { vectors, meta } = await getSpriteIndex();
  if (!vectors || !vectors.length) {
    console.warn("[match] empty sprite index");
    return embeds.map(() => null);
  }
  const threshold = opts.threshold ?? 0.28;
  return embeds.map((e) => bestMatch(e, vectors, meta, threshold));
}
