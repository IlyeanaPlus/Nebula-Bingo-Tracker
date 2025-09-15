// src/utils/matchers.js
// Re-ranking matcher: CLIP cosine (512-D) blended with 64-D shape similarity.
// Usage:
//   const match = findBestMatch(vec, index, { threshold: 0.34, canvas, topK: 200, shapeWeight: 0.25 });
// or keep legacy:
//   const match = findBestMatch(vec, index, 0.34);

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function argsortDesc(arr) { return Array.from(arr.keys()).sort((i, j) => arr[j] - arr[i]); }

// ---- 64-D shape signature from a canvas (Sobel -> 8x8 pooled -> L2) ----
function computeShape64(canvas) {
  const w = 32, h = 32;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d");
  tctx.drawImage(canvas, 0, 0, w, h);
  const { data } = tctx.getImageData(0, 0, w, h);

  // grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2]) / 255;
  }

  // Sobel gradients
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  const Kx = [1,0,-1, 2,0,-2, 1,0,-1];
  const Ky = [1,2, 1, 0,0,0, -1,-2,-1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0, sy = 0, k = 0;
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          const v = gray[(y + yy) * w + (x + xx)];
          sx += v * Kx[k]; sy += v * Ky[k]; k++;
        }
      }
      const i = y * w + x;
      gx[i] = sx; gy[i] = sy;
    }
  }

  // 8x8 average pool over 32x32 (blocks of 4x4)
  const v = new Float32Array(64);
  for (let gyc = 0; gyc < 8; gyc++) {
    for (let gxc = 0; gxc < 8; gxc++) {
      let sum = 0;
      for (let yy = 0; yy < 4; yy++) {
        for (let xx = 0; xx < 4; xx++) {
          const x = gxc * 4 + xx, y = gyc * 4 + yy, i = y * w + x;
          sum += Math.hypot(gx[i], gy[i]);
        }
      }
      v[gyc * 8 + gxc] = sum / 16;
    }
  }
  // L2
  let s = 0; for (let i = 0; i < 64; i++) s += v[i] * v[i];
  s = Math.sqrt(Math.max(s, 1e-12));
  for (let i = 0; i < 64; i++) v[i] /= s;
  return v;
}

// Main API
export function findBestMatch(vec, index, opts = {}) {
  const isNumber = typeof opts === "number";
  const threshold   = isNumber ? opts : (opts.threshold ?? 0.1);
  const topK        = isNumber ? 200 : (opts.topK ?? 200);
  const shapeWeight = isNumber ? 0.3 : (opts.shapeWeight ?? 0.3);
  const canvas      = isNumber ? null  : (opts.canvas ?? null);

  // 1) CLIP cosines
  const sims = new Float32Array(index.count);
  for (let i = 0; i < index.count; i++) sims[i] = dot(vec, index.vecs[i]);

  // 2) Preselect by CLIP
  const order = argsortDesc(sims).slice(0, topK);

  // 3) Optional shape re-rank
  let cropShape = null;
  const useShape = !!(canvas && shapeWeight > 0 && index.shapes && index.shapes.length);
  if (useShape) {
    try { cropShape = computeShape64(canvas); }
    catch { /* ignore */ }
  }

  let bestI = -1, bestScore = -1;
  for (const i of order) {
    let s = sims[i];
    if (useShape && index.shapes[i]) {
      const ss = dot(cropShape, index.shapes[i]); // 0..1
      s = (1 - shapeWeight) * s + shapeWeight * ss;
    }
    if (s > bestScore) { bestScore = s; bestI = i; }
  }

  if (bestI < 0 || bestScore < threshold) {
    // Debug breadcrumbs (comment out if noisy)
    console.debug("[matchers] no acceptable match; best=", bestScore?.toFixed?.(3));
    return null;
  }

  const ref = index.refs[bestI];
  const out = { id: ref.key, ref, score: bestScore, spriteUrl: ref.spriteUrl };
  console.debug("[matchers] best:", out.ref?.name, "score=", bestScore.toFixed(3));
  return out;
}

// Optional: get top K with blended scores (handy for debugging)
export function findTopK(vec, index, { canvas = null, topK = 10, shapeWeight = 0.25 } = {}) {
  const sims = new Float32Array(index.count);
  for (let i = 0; i < index.count; i++) sims[i] = dot(vec, index.vecs[i]);

  const order = argsortDesc(sims).slice(0, Math.max(topK, 10));
  let cropShape = null;
  if (canvas && shapeWeight > 0) {
    try { cropShape = computeShape64(canvas); } catch {}
  }

  const rows = [];
  for (const i of order) {
    let s = sims[i];
    if (cropShape && index.shapes[i]) {
      const ss = dot(cropShape, index.shapes[i]);
      s = (1 - shapeWeight) * s + shapeWeight * ss;
    }
    rows.push({ i, score: s, ref: index.refs[i] });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, topK);
}
