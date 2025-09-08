// src/utils/matchers.js
// Cosine similarity against pre-normalized index vectors.

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * tensorData: Float32Array (single 512-d embedding) or ort tensor-like {data: Float32Array}
 * index: { vectors: Float32Array[], meta: [{key,name,url}] }
 * returns: { score, index, key, name, url, matchUrl, label }
 */
export function findBestMatch(tensorData, index) {
  if (!tensorData) return null;
  const vec = tensorData.data instanceof Float32Array ? tensorData.data : tensorData;

  const V = index?.vectors || [];
  const M = index?.meta || [];
  if (!V.length || V.length !== M.length) {
    console.warn("[matchers] index missing or malformed");
    return null;
  }

  // Normalize query (index vectors are already normalized)
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  const q = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) q[i] = vec[i] * inv;

  let bestI = -1;
  let bestS = -1;
  for (let i = 0; i < V.length; i++) {
    const d = dot(q, V[i]); // cosine because both normalized
    if (d > bestS) {
      bestS = d;
      bestI = i;
    }
  }

  if (bestI < 0) return null;
  const m = M[bestI] || {};
  return {
    score: bestS,
    index: bestI,
    key: m.key || "",
    name: m.name || m.key || "",
    url: m.url || "",
    matchUrl: m.url || "",   // your view reads matchUrl/url/ref.url
    label: m.name || m.key || "",
  };
}
