// src/utils/matchers.js
// Robust reference loading + histogram shortlist → (SSIM/MSE or NCC) final with a foreground mask.
// Composites transparency to board gray (#8b8b8b). Includes debug logging.

const BG = { r: 139, g: 139, b: 139 }; // #8b8b8b
const SIZE = 32;
const BINS = 8;
const OFF = [-2, -1, 0, 1, 2]; // wider offset search
const SHORTLIST_K = 36;        // a bit wider

// ---------- Debug ----------
function dbgOn(flag) {
  if (flag === true) return true;
  try {
    if (typeof location !== 'undefined' && /[?&]debug(=1|&|$)/.test(location.search)) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('nbt.debug') === '1') return true;
  } catch {}
  return false;
}
const dlog = (...a) => console.log('[matcher]', ...a);

// ---------- Image load with retries ----------
function loadImageOnce(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function buildFallbackUrls(raw) {
  // prefer =s64 thumb (fast), then raw, then UC view
  const u = new URL(raw, location.origin);
  const list = [];
  if (raw.includes('lh3.googleusercontent.com/d/')) {
    list.push(raw.endsWith('=s64') ? raw : `${raw}=s64`);
    list.push(raw.replace(/=s\d+$/, '')); // raw
    const id = raw.split('/d/')[1]?.split(/[/?#]/)[0];
    if (id) list.push(`https://drive.google.com/uc?export=view&id=${id}`);
  } else {
    list.push(raw);
  }
  return Array.from(new Set(list));
}

async function loadImageRobust(raw) {
  const tries = buildFallbackUrls(raw);
  let lastErr;
  for (const url of tries) {
    try {
      return await loadImageOnce(url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('image load failed');
}

// ---------- Canvas ----------
function toCanvas(img, w = SIZE, h = SIZE) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

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
  return im;
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

// Central shrink to avoid gridlines (crop 1px border → 30x30 → back to 32x32)
function shrinkImageData(im, border = 1) {
  if (!border) return im;
  const { width: w, height: h, data } = im;
  const s = document.createElement('canvas');
  s.width = w - border * 2;
  s.height = h - border * 2;
  const ctx = s.getContext('2d');
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(im, 0, 0);
  ctx.drawImage(tmp, border, border, w - border * 2, h - border * 2, 0, 0, s.width, s.height);
  const back = document.createElement('canvas');
  back.width = w; back.height = h;
  back.getContext('2d').drawImage(s, 0, 0, w, h);
  return back.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
}

// ---------- Mask ----------
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

function makeMask(im, thr = 22) { // slightly looser than before
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

// ---------- Luma / SSIM / MSE / NCC ----------
function lumaArray(im) {
  const { data } = im;
  const out = new Float32Array(im.width * im.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return out;
}

function ssimLuma(a, b, w, h, mask = null) {
  const W = 8; const C1 = (0.01 * 255) ** 2; const C2 = (0.03 * 255) ** 2;
  let scoreSum = 0, count = 0;
  function meanVar(arr, x0, y0) {
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const xi = (x0 + x) % w, yi = (y0 + y) % h, idx = yi * w + xi;
      if (mask && !mask[idx]) continue;
      const v = arr[idx]; sum += v; sum2 += v * v; n++;
    }
    const mu = n ? sum / n : 0;
    const sig = n ? Math.max(0, sum2 / n - mu * mu) : 0;
    return { mu, sig, n };
  }
  for (let y = 0; y < h; y += W) for (let x = 0; x < w; x += W) {
    const A = meanVar(a, x, y), B = meanVar(b, x, y); const n = Math.min(A.n, B.n);
    if (!n) continue;
    let cov = 0, nn = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const xi = (x + i) % w, yi = (y + j) % h, idx = yi * w + xi;
      if (mask && !mask[idx]) continue;
      cov += (a[idx] - A.mu) * (b[idx] - B.mu); nn++;
    }
    cov = nn ? cov / nn : 0;
    const num = (2 * A.mu * B.mu + C1) * (2 * cov + C2);
    const den = (A.mu ** 2 + B.mu ** 2 + C1) * (A.sig + B.sig + C2);
    scoreSum += den ? num / den : 0; count++;
  }
  return count ? scoreSum / count : 0;
}

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
      sum += dr * dr + dg * dg + db * db; n++;
    }
  }
  return n ? sum / (3 * n) : Infinity;
}

// Normalized cross-correlation (mean/std normalized), with offsets
function nccScore(imA, imB, mask = null, dx = 0, dy = 0) {
  const { data: A, width: w, height: h } = imA;
  const { data: B } = imB;
  // compute mean/std for masked pixels
  let sumA = 0, sumB = 0, n = 0;
  for (let y = 0; y < h; y++) {
    const yb = y + dy; if (yb < 0 || yb >= h) continue;
    for (let x = 0; x < w; x++) {
      const xb = x + dx; if (xb < 0 || xb >= w) continue;
      if (mask && !mask[y * w + x]) continue;
      const ai = (y * w + x) * 4; const bi = (yb * w + xb) * 4;
      const la = 0.2126 * A[ai] + 0.7152 * A[ai + 1] + 0.0722 * A[ai + 2];
      const lb = 0.2126 * B[bi] + 0.7152 * B[bi + 1] + 0.0722 * B[bi + 2];
      sumA += la; sumB += lb; n++;
    }
  }
  if (!n) return -1;
  const muA = sumA / n, muB = sumB / n;
  let num = 0, da2 = 0, db2 = 0;
  for (let y = 0; y < h; y++) {
    const yb = y + dy; if (yb < 0 || yb >= h) continue;
    for (let x = 0; x < w; x++) {
      const xb = x + dx; if (xb < 0 || xb >= w) continue;
      if (mask && !mask[y * w + x]) continue;
      const ai = (y * w + x) * 4; const bi = (yb * w + xb) * 4;
      const la = 0.2126 * A[ai] + 0.7152 * A[ai + 1] + 0.0722 * A[ai + 2] - muA;
      const lb = 0.2126 * B[bi] + 0.7152 * B[bi + 1] + 0.0722 * B[bi + 2] - muB;
      num += la * lb; da2 += la * la; db2 += lb * lb;
    }
  }
  const den = Math.sqrt(da2 * db2) || 1;
  return num / den; // [-1..1]
}

function bestOffsetScores(refIm, cropIm, mask) {
  const w = cropIm.width, h = cropIm.height;
  let best = { mse: Infinity, ssim: -1, ncc: -1, dx: 0, dy: 0 };
  for (const dy of OFF) for (const dx of OFF) {
    const mse = mseRGB(cropIm, refIm, mask, dx, dy);
    const ncc = nccScore(cropIm, refIm, mask, dx, dy);
    // SSIM (no shift) is fine at 32x32 — keeps cost down
    const ssim = ssimLuma(lumaArray(cropIm), lumaArray(refIm), w, h, mask);
    const better =
      ncc > best.ncc + 1e-6 ||
      (Math.abs(ncc - best.ncc) < 1e-6 && (mse < best.mse || ssim > best.ssim));
    if (better) best = { mse, ssim, ncc, dx, dy };
  }
  return best;
}

// ---------- Public: prepare reference index ----------
export async function prepareRefIndex(manifest) {
  const refs = [];
  let ok = 0, fail = 0;

  for (const e of manifest || []) {
    const raw = e.src || e.image || e.url;
    if (!raw) continue;
    try {
      const img = await loadImageRobust(raw);
      const cnv = toCanvas(img);
      const im = compositeToBG(cnv);
      refs.push({ name: e.name || e.id || 'Unknown', src: raw, im, hist: histRGB(im) });
      ok++;
    } catch (err) {
      console.warn('Ref load failed:', e.name || e.id || '<unnamed>', raw, err);
      fail++;
    }
  }
  console.log(`[matchers] refs loaded: ${ok} ok, ${fail} failed, manifest: ${(manifest || []).length}`);
  return refs;
}

// ---------- Public: find best match ----------
export async function findBestMatch(cropDataURL, refIndex, opts = {}) {
  const {
    shortlistK = SHORTLIST_K,
    ssimMin = 0.82,   // a bit looser
    mseMax = 1000,    // a bit looser
    nccMin = 0.90,    // NEW: accept by NCC
    debug
  } = opts;

  const DBG = dbgOn(debug);

  // Prepare crop image data + mask; shrink to avoid gridlines
  let cropIm = await imageDataFromDataURL(cropDataURL, SIZE, SIZE);
  cropIm = shrinkImageData(cropIm, 1);
  const { mask, fg, total } = makeMask(cropIm, 22);
  if (DBG) dlog('crop: fg pixels', fg, '/', total, 'ratio', +(fg / total).toFixed(2));

  // Stage-1 shortlist by histogram
  const cropHist = histRGB(cropIm);
  const ranked = refIndex
    .map(r => ({ r, d: chiSq(cropHist, r.hist) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(shortlistK, refIndex.length));

  // Stage-2: evaluate scores
  const candidates = [];
  for (const { r } of ranked) {
    const { mse, ssim, ncc } = bestOffsetScores(r.im, cropIm, mask);
    const combined = (mse / 255) + (1 - ssim) * 200 - (ncc * 50); // reward high NCC
    candidates.push({ r, mse, ssim, ncc, combined });
  }
  candidates.sort((a, b) => a.combined - b.combined);
  const best = candidates[0] || null;

  if (DBG) {
    dlog('best candidates:', candidates.slice(0, 3).map(c => ({
      name: c.r.name, mse: +c.mse.toFixed(1), ssim: +c.ssim.toFixed(3), ncc: +c.ncc.toFixed(3), combined: +c.combined.toFixed(2)
    })));
  }

  if (!best) return null;

  const acceptByClassic = best.mse <= mseMax && best.ssim >= ssimMin;
  const acceptByNCC = best.ncc >= nccMin;

  if (!acceptByClassic && !acceptByNCC) {
    if (DBG) dlog('rejected best', { name: best.r.name, mse: best.mse, ssim: best.ssim, ncc: best.ncc, mseMax, ssimMin, nccMin });
    return null;
    }

  if (DBG) dlog('ACCEPT', { name: best.r.name, mse: best.mse, ssim: best.ssim, ncc: best.ncc });
  return { name: best.r.name, src: best.r.src, mse: best.mse, ssim: best.ssim, ncc: best.ncc };
}
