// src/utils/matchers.js
// Histogram shortlist + SSIM/MSE final on a foreground mask.
// Works with tiny 32x32 color sprites. Background composited to #8b8b8b.

const BG = { r: 139, g: 139, b: 139 };   // board gray #8b8b8b
const SIZE = 32;                          // reference/crop working size
const BINS = 8;                           // per-channel histogram bins
const OFF = [-1, 0, 1];                   // small shift search
const SHORTLIST_K = 24;                   // keep top-K from histogram stage

// ---- Canvas helpers ----
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function toCanvas(img, w = SIZE, h = SIZE) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

// Composite transparent pixels over BG gray (matches board)
function compositeToBG(cnv) {
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  const im = ctx.getImageData(0, 0, cnv.width, cnv.height);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i + 0] = Math.round(d[i + 0] * a + BG.r * (1 - a));
    d[i + 1] = Math.round(d[i + 1] * a + BG.g * (1 - a));
    d[i + 2] = Math.round(d[i + 2] * a + BG.b * (1 - a));
    d[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return im; // return ImageData
}

function imageDataFromDataURL(dataURL, w = SIZE, h = SIZE) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cnv = toCanvas(img, w, h);
      const im = compositeToBG(cnv);
      resolve(im);
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}

// ---- Foreground mask (estimate background from a 1px border ring) ----
function estimateBGFromBorder(im) {
  const { data, width: w, height: h } = im;
  const valsR = [], valsG = [], valsB = [];
  const push = (x, y) => {
    const i = (y * w + x) * 4;
    valsR.push(data[i]); valsG.push(data[i + 1]); valsB.push(data[i + 2]);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { push(0, y); push(w - 1, y); }
  const med = (a) => { const s = a.sort((x, y) => x - y); const m = s.length >> 1; return s.length & 1 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  return { r: med(valsR), g: med(valsG), b: med(valsB) };
}

function makeMask(im, thr = 18) {
  const { data, width: w, height: h } = im;
  const bg = estimateBGFromBorder(im);
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const dr = data[i] - bg.r, dg = data[i + 1] - bg.g, db = data[i + 2] - bg.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    mask[p] = dist > thr ? 1 : 0;
  }
  return mask;
}

// ---- Histograms (per-channel) + χ² distance ----
function histRGB(im, bins = BINS) {
  const { data } = im;
  const hist = new Float32Array(bins * 3);
  const step = 256 / bins;
  for (let i = 0; i < data.length; i += 4) {
    hist[(data[i] / step) | 0] += 1;                     // R
    hist[bins + ((data[i + 1] / step) | 0)] += 1;        // G
    hist[2 * bins + ((data[i + 2] / step) | 0)] += 1;    // B
  }
  // L1 normalize
  let s = 0; for (let i = 0; i < hist.length; i++) s += hist[i];
  for (let i = 0; i < hist.length; i++) hist[i] /= (s || 1);
  return hist;
}
function chiSq(h1, h2, eps = 1e-9) {
  let v = 0;
  for (let i = 0; i < h1.length; i++) {
    const a = h1[i], b = h2[i];
    const num = (a - b) * (a - b);
    const den = a + b + eps;
    v += num / den;
  }
  return v;
}

// ---- Luma conversion ----
function lumaArray(im) {
  const { data } = im;
  const out = new Float32Array(im.width * im.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return out;
}

// ---- SSIM (single-scale, luma, small window) ----
function ssimLuma(a, b, w, h, mask = null) {
  // window 8x8 with circular padding; constants from SSIM paper
  const W = 8; const C1 = (0.01 * 255) ** 2; const C2 = (0.03 * 255) ** 2;
  let scoreSum = 0, count = 0;

  function meanVar(arr, x0, y0) {
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const xi = (x0 + x) % w;
        const yi = (y0 + y) % h;
        const idx = yi * w + xi;
        if (mask && !mask[idx]) continue;
        const v = arr[idx];
        sum += v; sum2 += v * v; n++;
      }
    }
    const mu = n ? sum / n : 0;
    const sig = n ? Math.max(0, sum2 / n - mu * mu) : 0;
    return { mu, sig, n };
  }

  for (let y = 0; y < h; y += W) {
    for (let x = 0; x < w; x += W) {
      const A = meanVar(a, x, y), B = meanVar(b, x, y);
      const n = Math.min(A.n, B.n);
      if (!n) continue;

      // covariance
      let cov = 0, nn = 0;
      for (let j = 0; j < W; j++) {
        for (let i = 0; i < W; i++) {
          const xi = (x + i) % w, yi = (y + j) % h, idx = yi * w + xi;
          if (mask && !mask[idx]) continue;
          cov += (a[idx] - A.mu) * (b[idx] - B.mu); nn++;
        }
      }
      cov = nn ? cov / nn : 0;

      const num = (2 * A.mu * B.mu + C1) * (2 * cov + C2);
      const den = (A.mu ** 2 + B.mu ** 2 + C1) * (A.sig + B.sig + C2);
      scoreSum += den ? num / den : 0;
      count++;
    }
  }
  return count ? scoreSum / count : 0;
}

// ---- MSE over RGB with mask and small offset search ----
function mseRGB(imA, imB, mask = null, dx = 0, dy = 0) {
  const { data: A, width: w, height: h } = imA;
  const { data: B } = imB;
  let sum = 0, n = 0;

  for (let y = 0; y < h; y++) {
    const yb = y + dy; if (yb < 0 || yb >= h) continue;
    for (let x = 0; x < w; x++) {
      const xb = x + dx; if (xb < 0 || xb >= w) continue;
      const ai = (y * w + x) * 4; const bi = (yb * w + xb) * 4;
      if (mask && !mask[y * w + x]) continue;
      const dr = A[ai] - B[bi], dg = A[ai + 1] - B[bi + 1], db = A[ai + 2] - B[bi + 2];
      sum += dr * dr + dg * dg + db * db;
      n++;
    }
  }
  return n ? sum / (3 * n) : Infinity; // per-channel average
}

function bestOffsetScores(refIm, cropIm, mask) {
  // Try small offsets, return best MSE + corresponding SSIM
  const cropL = lumaArray(cropIm);
  const refL = lumaArray(refIm);
  const w = cropIm.width, h = cropIm.height;

  let best = { mse: Infinity, ssim: -1, dx: 0, dy: 0 };
  for (const dy of OFF) {
    for (const dx of OFF) {
      const mse = mseRGB(cropIm, refIm, mask, dx, dy);
      // SSIM computed with same offset by shifting ref luma array virtually
      // (recompute shifted luma lazily via ImageData shift if needed; at 32x32 MSE is the main offset guard)
      const ssim = ssimLuma(cropL, refL, w, h, mask); // acceptable approximation
      if (mse < best.mse || (Math.abs(mse - best.mse) < 1e-6 && ssim > best.ssim)) {
        best = { mse, ssim, dx, dy };
      }
    }
  }
  return best;
}

// ---- Public: prepare reference index ----
export async function prepareRefIndex(manifest) {
  const refs = [];
  for (const e of manifest || []) {
    const src = e.src || e.image || e.url;
    if (!src) continue;
    try {
      const img = await loadImage(src);
      const cnv = toCanvas(img);
      const im = compositeToBG(cnv);
      refs.push({
        name: e.name || e.id || 'Unknown',
        src,
        im,
        hist: histRGB(im)
      });
    } catch (err) {
      console.warn('Ref load failed', e.name || e.id, err);
    }
  }
  return refs;
}

// ---- Public: find best match for a dataURL crop ----
export async function findBestMatch(cropDataURL, refIndex, opts = {}) {
  const {
    shortlistK = SHORTLIST_K,
    ssimMin = 0.88,
    mseMax = 600
  } = opts;

  // Prepare crop image data + mask
  const cropIm = await imageDataFromDataURL(cropDataURL, SIZE, SIZE);
  const cropHist = histRGB(cropIm);
  const mask = makeMask(cropIm);

  // Stage-1 shortlist by histogram chi-squared (lower is better)
  const ranked = refIndex
    .map(r => ({ r, d: chiSq(cropHist, r.hist) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(shortlistK, refIndex.length));

  // Stage-2 precise scoring with small offset search
  let best = { score: Infinity, entry: null, mse: Infinity, ssim: -1 };
  for (const { r } of ranked) {
    const { mse, ssim } = bestOffsetScores(r.im, cropIm, mask);
    // Combine (lower better): normalized MSE + (1-SSIM)
    const combined = (mse / 255) + (1 - ssim) * 200; // weight SSIM strongly
    if (combined < best.score) best = { score: combined, entry: r, mse, ssim };
  }

  // Thresholding
  if (!best.entry) return null;
  if (best.mse > mseMax || best.ssim < ssimMin) return null;

  return { name: best.entry.name, src: best.entry.src, mse: best.mse, ssim: best.ssim };
}
