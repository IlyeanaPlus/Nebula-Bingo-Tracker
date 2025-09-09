// src/utils/matchers.js
// Cosine matching against sprite index, returning UI-ready fields.
// Accepts either shape:
//  A) { vectors: Float32Array[], meta: any[] }     (sprites.js loader)
//  B) { list: [{ key,name,src,vec:Float32Array }]} (clipMatcher.js loader)

function l2norm(v) {
  let s = 0.0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}

function normalizeIndex(index) {
  // Shape B (clipMatcher): { list: [...] }
  if (index && Array.isArray(index.list)) {
    const vectors = index.list.map(r =>
      r.vec instanceof Float32Array ? r.vec : new Float32Array(r.vec)
    );
    const meta = index.list.map(r => ({
      key: r.key,
      name: r.name,
      // map src -> drive_cache so UI code can keep using matchUrl
      drive_cache: r.src,
      // keep original row in case you need more fields later
      _row: r,
    }));
    return { vectors, meta };
  }

  // Shape A (sprites.js) already normalized
  return index || { vectors: [], meta: [] };
}

/**
 * @param {Float32Array|number[]} embed - 512-d embedding for one crop
 * @param {object} index - accepted shapes noted above
 * @param {number} [threshold=0.28] - cosine threshold; below => null (no match)
 * @returns {null|{idx:number, score:number, label:string, matchUrl:string|null, ref:any}}
 */
export function findBestMatch(embed, index, threshold = 0.28) {
  const { vectors, meta } = normalizeIndex(index);
  if (!vectors?.length || !meta?.length) return null;

  const q = embed instanceof Float32Array ? embed : new Float32Array(embed);
  const vec = l2norm(q); // ensure normalized

  let best = -2.0, bestIdx = -1;
  const D = vec.length;

  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (!v) continue;
    let s = 0.0;
    for (let d = 0; d < D; d++) s += vec[d] * v[d]; // dot = cosine (vectors are L2)
    if (s > best) { best = s; bestIdx = i; }
  }

  if (bestIdx < 0 || best < threshold) return null;

  const m = meta[bestIdx] || {};
  const url = m.drive_cache || m.thumb || m.url || m.image || (m._row?.src ?? null);
  const label = m.label ?? m.name ?? m.key ?? m._row?.name ?? "";

  return {
    idx: bestIdx,
    score: best,
    label,
    matchUrl: url, // what BingoCardView prefers
    ref: m,        // keep full meta for fallbacks/debug
  };
}

export function topKMatches(embed, index, k = 3, threshold = 0.28) {
  const { vectors, meta } = normalizeIndex(index);
  if (!vectors?.length || !meta?.length) return [];

  const q = embed instanceof Float32Array ? embed : new Float32Array(embed);
  const vec = l2norm(q);
  const scores = new Array(vectors.length);

  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    let s = 0.0;
    for (let d = 0; d < vec.length; d++) s += vec[d] * v[d];
    scores[i] = [i, s];
  }
  scores.sort((a, b) => b[1] - a[1]);

  const out = [];
  for (let j = 0; j < Math.min(k, scores.length); j++) {
    const [i, s] = scores[j];
    if (s < threshold) break;
    const m = meta[i] || {};
    const url = m.drive_cache || m.thumb || m.url || m.image || (m._row?.src ?? null);
    const label = m.label ?? m.name ?? m.key ?? m._row?.name ?? "";
    out.push({ idx: i, score: s, label, matchUrl: url, ref: m });
  }
  return out;
}
