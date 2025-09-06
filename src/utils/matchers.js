// src/utils/matchers.js
// Histogram shortlist → SSIM/MSE final on a foreground mask.
// Debug logging is controlled by URL (?debug) or localStorage('nbt.debug' = '1') or opts.debug.

const BG = { r: 139, g: 139, b: 139 }; // #8b8b8b
const SIZE = 32;
const BINS = 8;
const OFF = [-1, 0, 1];
const SHORTLIST_K = 24;

// ---------- Debug gate ----------
function isDebugEnabled(explicitFlag) {
  if (explicitFlag === true) return true;
  if (explicitFlag === false) return false;
  try {
    if (typeof location !== 'undefined' && /[?&]debug(=1|&|$)/.test(location.search)) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('nbt.debug') === '1') return true;
  } catch {}
  return false;
}
const dlog = (...args) => console.log('[matcher]', ...args);

// ---------- Canvas helpers ----------
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

// Composite transparent pixels over BG gray
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
  return im; // ImageData
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

// ---------- Foreground mask ----------
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

function makeMask(im, thr = 24) { // ↑ default from 18 → 24 (keep more pixels)
  const { data, width: w, height: h } = im;
  const bg = estimateBGFromBorder(im);
  const mask = new Uint8Array(w * h);
  let fg = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const dr = data[i] - bg.r, dg = data[i + 1] - bg.g, db = data[i + 2] - bg.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const v = dist > thr ? 1 : 0;
    mask[p] = v; fg += v;
  }
  return { mask, fg, total: w * h };
}

// ---------- Histograms + χ² ----------
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

// ---------- Luma + SSIM ----------
function lumaArray(im) {
  const { data } = im;
  const out = new Float32Array(im.width * im.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return out;
}

function ssimLuma(a, b, w, h, mask = null) {
  // Single-scale SSIM, 8x8 windows, wrap-around (cheap at 32x32)
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

// ---------- MSE with small offset search ----------
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
  return n ? sum / (3 * n) : Infinity;
}

function bestOffsetScores(refIm, cropIm, mask) {
  const cropL = lumaArray(cropIm);
  const refL = lumaArray(refIm);
  const w = cropIm.width, h = cropIm.height;

  let best = { mse: Infinity, ssim: -1, dx: 0, dy: 0 };
  for (const dy of OFF) {
    for (const dx of OFF) {
      const mse = mseRGB(cropIm, refIm, mask, dx, dy);
      const ssim = ssimLuma(cropL, refL, w, h, mask); // approx same offset; OK at 32x32
      if (mse < best.mse || (Math.abs(mse - best.mse) < 1e-6 && ssim > best.ssim)) {
        best = { mse, ssim, dx, dy };
      }
    }
  }
  return best;
}

// ---------- Public: prepare reference index ----------
export async function prepareRefIndex(manifest) {
  const refs = [];
  let ok = 0, fail = 0;

  for (const e of manifest || []) {
    const rawSrc = e.src || e.image || e.url;
    if (!rawSrc) continue;

    const src = rawSrc.includes('lh3.googleusercontent.com/d/')
      ? `${rawSrc}=s64`
      : rawSrc;

    try {
      const img = await loadImage(src);
      const cnv = toCanvas(img);
      const im = compositeToBG(cnv);
      refs.push({
        name: e.name || e.id || 'Unknown',
        src,
        im,
        hist: histRGB(im),
      });
      ok++;
    } catch (err) {
      console.warn('Ref load failed:', e.name || e.id || '<unnamed>', rawSrc, err);
      fail++;
    }
  }

  console.log(`[matchers] refs loaded: ${ok} ok, ${fail} failed, manifest: ${(manifest || []).length}`);
  return refs;
}

// ---------- Public: find best match (with debug logs) ----------
export async function findBestMatch(cropDataURL, refIndex, opts = {}) {
  const {
    shortlistK = SHORTLIST_K,
    ssimMin = 0.80,  // looser default so we can see real values
    mseMax = 1200,   // looser default so we can see real values
    debug
  } = opts;

  const DBG = isDebugEnabled(debug);

  // Prepare crop image data + mask
  const cropIm = await imageDataFromDataURL(cropDataURL, SIZE, SIZE);
  const cropHist = histRGB(cropIm);
  const { mask, fg, total } = makeMask(cropIm);
  const fgRatio = +(fg / total).toFixed(2);

  if (DBG) dlog('crop: fg pixels', fg, '/', total, 'ratio', fgRatio);

  // Stage-1 shortlist
  const ranked = refIndex
    .map(r => ({ r, d: chiSq(cropHist, r.hist) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(shortlistK, refIndex.length));

  // Stage-2 precise scoring + collect top-3 for debug
  const candidates = [];
  for (const { r } of ranked) {
    const { mse, ssim } = bestOffsetScores(r.im, cropIm, mask);
    const combined = (mse / 255) + (1 - ssim) * 200;
    candidates.push({ r, mse, ssim, combined });
  }
  candidates.sort((a, b) => a.combined - b.combined);

  const best = candidates[0] || null;

  if (DBG) {
    const top = candidates.slice(0, 3).map(c => ({
      name: c.r.name, mse: +c.mse.toFixed(1), ssim: +c.ssim.toFixed(3), combined: +c.combined.toFixed(2)
    }));
    dlog('best candidates:', top);
  }

  if (!best) return null;
  if (best.mse > mseMax || best.ssim < ssimMin) {
    if (DBG) dlog('rejected best', { name: best.r.name, mse: best.mse, ssim: best.ssim, mseMax, ssimMin });
    return null;
  }

  if (DBG) dlog('ACCEPT', { name: best.r.name, mse: best.mse, ssim: best.ssim });

  return { name: best.r.name, src: best.r.src, mse: best.mse, ssim: best.ssim, debug: { fgRatio } };
}
