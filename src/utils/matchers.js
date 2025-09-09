// src/utils/matchers.js
import { tuning } from "../tuning/tuningStore";

function pickSpriteUrl(ref) {
  if (!ref) return null;
  return (
    ref.drive_cache ||  // your cached path
    ref.sprite ||
    ref.url ||
    ref.image ||
    ref.thumb ||
    ref.path ||
    null
  );
}

/**
 * @param {Float32Array|number[]} embed
 * @param {{vectors: Float32Array[], meta: any[]}} index
 * @param {number=} threshold  // if omitted, uses tuning.scoreThreshold
 * @returns {{idx:number, score:number, ref:any, spriteUrl:string}|null}
 */
export function findBestMatch(embed, index, threshold) {
  const thr = (threshold ?? tuning.get().scoreThreshold) || 0.28;
  const V = index?.vectors || [];
  const M = index?.meta || [];
  if (!V.length || V.length !== M.length) {
    console.warn("[matchers] bad index sizes", V.length, M.length);
    return null;
  }

  const q = embed instanceof Float32Array ? embed : new Float32Array(embed);

  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    let s = 0.0;
    for (let k = 0; k < q.length; k++) s += q[k] * v[k]; // dot
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  if (bestIdx < 0) return null;

  const ref = M[bestIdx] || null;
  const spriteUrl = pickSpriteUrl(ref);
  const score = Math.max(0, bestScore);

  if (!spriteUrl) {
    console.warn("[matchers] best match has no sprite url", { bestIdx, score, ref });
    return null; // do not fill; UI will show “no match” after run
  }
  if (score < thr) return null;

  return { idx: bestIdx, score, ref, spriteUrl };
}
