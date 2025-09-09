// src/utils/matchers.js
// Cosine matching against sprite index, returning UI-ready fields.

function l2norm(v) {
  let s = 0.0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}

/**
 * @param {Float32Array|number[]} embed - 512-d embedding for one crop
 * @param {{vectors: Float32Array[], meta: any[]}} index - sprite index
 * @param {number} [threshold=0.28] - cosine threshold; below => null (no match)
 * @returns {null|{idx:number, score:number, label:string, matchUrl:string|null, ref:any}}
 */
export function findBestMatch(embed, index, threshold = 0.28) {
  if (!index?.vectors?.length || !index?.meta?.length) return null;

  // Ensure Float32Array and normalized
  const q = embed instanceof Float32Array ? embed : new Float32Array(embed);
  const vec = l2norm(q);

  let best = -2.0;
  let bestIdx = -1;

  const N = index.vectors.length;
  for (let i = 0; i < N; i++) {
    const v = index.vectors[i];
    if (!v) continue;
    let s = 0.0;
    // tight loop dot-product (vectors in index are already normalized by sprites.js)
    for (let d = 0; d < vec.length; d++) s += vec[d] * v[d];
    if (s > best) { best = s; bestIdx = i; }
  }

  if (bestIdx < 0 || best < threshold) return null;

  const meta = index.meta[bestIdx] || {};
  const url =
    meta.drive_cache ||  // your preferred field
    meta.thumb ||
    meta.url ||
    meta.image ||
    null;

  const label =
    meta.label ??
    meta.name ??
    meta.key ??
    "";

  return {
    idx: bestIdx,
    score: best,
    label,
    matchUrl: url,  // <-- what BingoCardView prefers
    ref: meta,      // fallback for UI (ref.url)
  };
}

/**
 * Optional: top-K matches if you ever want alternates in the UI.
 * Returns array sorted by score desc with same UI-ready shape.
 */
export function topKMatches(embed, index, k = 3, threshold = 0.28) {
  if (!index?.vectors?.length || !index?.meta?.length) return [];
  const q = embed instanceof Float32Array ? embed : new Float32Array(embed);
  const vec = l2norm(q);

  const scores = [];
  for (let i = 0; i < index.vectors.length; i++) {
    const v = index.vectors[i];
    let s = 0.0;
    for (let d = 0; d < vec.length; d++) s += vec[d] * v[d];
    scores.push([i, s]);
  }
  scores.sort((a, b) => b[1] - a[1]);

  const out = [];
  for (let j = 0; j < Math.min(k, scores.length); j++) {
    const [i, s] = scores[j];
    if (s < threshold) break;
    const meta = index.meta[i] || {};
    const url = meta.drive_cache || meta.thumb || meta.url || meta.image || null;
    const label = meta.label ?? meta.name ?? meta.key ?? "";
    out.push({ idx: i, score: s, label, matchUrl: url, ref: meta });
  }
  return out;
}
