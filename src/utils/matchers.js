// src/utils/matchers.js
// Keep existing cosineHead; add optional excludeRef predicate.

export function cosineHead(index, opts = {}) {
  const { vectors, dim, items } = index;
  const excludeRef = opts.excludeRef || null;

  return {
    query(vec, topK = 5) {
      const scores = [];
      for (let i = 0; i < items.length; i++) {
        const ref = items[i];
        if (excludeRef && excludeRef(ref)) continue; // ⬅️ skip excluded entries

        const row = index.getVector(i);
        let s = 0;
        for (let d = 0; d < dim; d++) s += row[d] * vec[d];
        scores.push({ i, s });
      }
      scores.sort((a, b) => b.s - a.s);

      const K = Math.min(topK, scores.length);
      const out = [];
      for (let k = 0; k < K; k++) {
        const r = scores[k];
        out.push({ score: r.s, ref: index.items[r.i] });
      }
      return out;
    },
  };
}

// === NEW: shape-aware reranker ===
export function rerankTopByShape(top, cropMask64 /* Float32Array(4096) */, index, opts = {}) {
  if (!top || !top.length || !cropMask64) return top;
  const dim = 64*64;
  const A = to01(cropMask64);

  const wClip = Number(opts.wClip ?? 0.7);
  const wShape = Number(opts.wShape ?? 0.3);
  const minShape = Number(opts.minShape ?? 0.12);
  const ignoreBorder = Number(opts.ignoreBorder ?? 2);

  const ring = buildInnerRingMask(64, ignoreBorder); // ignore 2px border by default

  const scored = top.map(t => {
    const ref = t?.ref;
    const Braw = ref?.shape64;
    let shape = 0;
    if (Braw && Braw.length === dim) {
      const B = to01(Braw);
      shape = iouMasked(A, B, ring); // IoU ignoring outer ring
    }
    const clip = Number(t.score ?? 0);
    const final = (shape < minShape) ? (clip * 0.5) : (wClip*clip + wShape*shape);
    return { ...t, score: final, clip, shape };
  });

  scored.sort((a,b) => b.score - a.score);
  return scored;
}

// helpers
function to01(arr) {
  const out = new Uint8Array(arr.length);
  for (let i=0;i<arr.length;i++) out[i] = arr[i] > 0 ? 1 : 0;
  return out;
}
function iouMasked(A, B, mask /* Uint8Array same length */) {
  let inter=0, uni=0;
  for (let i=0;i<A.length;i++) {
    if (mask && !mask[i]) continue;
    const a=A[i], b=B[i];
    if (a|b) uni++;
    if (a&b) inter++;
  }
  return uni ? inter/uni : 0;
}
function buildInnerRingMask(n=64, border=2) {
  const m = new Uint8Array(n*n);
  for (let y=0;y<n;y++) for (let x=0;x<n;x++) {
    const ok = (x>=border && x<n-border && y>=border && y<n-border);
    m[y*n+x] = ok ? 1 : 0;
  }
  return m;
}
