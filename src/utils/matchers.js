// src/utils/matchers.js
// CLIP-based matching helpers (cosine similarity).

import { getClipSession, embedImage, l2norm } from './clipSession';

/** Cosine similarity of two Float32Array vectors */
export function cosineSim(a, b) {
  let dot = 0.0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Build an index of reference images (urls). Returns:
 * { vectors: Float32Array[], meta: { url, name, key }[] }
 */
export async function prepareRefIndex(refs) {
  const session = await getClipSession();
  const vectors = [];
  const meta = [];

  // Load images & embed serially to avoid saturating memory/threads excessively.
  for (const r of refs) {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = r.url;
    });

    const tensor = await embedImage(img, session);
    // Normalize now so cosine becomes just dot
    const v = l2norm(tensor.data);
    vectors.push(v);
    meta.push({ url: r.url, name: r.name ?? r.key ?? '', key: r.key ?? r.name ?? r.url });
  }
  return { vectors, meta };
}

/** Find the best reference match for a single embedding */
export function findBestMatch(queryVec, index) {
  if (!queryVec) return null;
  const q = l2norm(queryVec);
  let best = -2;
  let bestIdx = -1;
  for (let i = 0; i < index.vectors.length; i++) {
    const score = cosineSim(q, index.vectors[i]);
    if (score > best) {
      best = score;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return { score: best, ref: index.meta[bestIdx], idx: bestIdx };
}