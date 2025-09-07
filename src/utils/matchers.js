// src/utils/matchers.js
// Transparent-matching pipeline for 32x32 sprites.
// 1) "Unboard" screenshot crops: remove board bg to transparent via soft color-key,
//    small morphology cleanup, and multi-shrink to avoid gridlines.
// 2) Histogram shortlist (masked) → NCC (±2px) + SSIM/MSE on alpha>0.3 foreground.
// 3) Robust ref image loading with fallbacks for lh3 Drive links.
//
// Enable debug logs with ?debug or localStorage('nbt.debug'='1').

// --- Debug helper ---
let NBT_DEBUG = true;
function dlog(...args) { if (NBT_DEBUG) console.log('[matcher]', ...args); }

const SIZE = 32;
const BINS = 8;
const OFF = [-2, -1, 0, 1, 2];
const SHORTLIST_K = 36;

// ---------- Debug ----------
function dbgOn(flag) {
  if (flag === true) return true;
  if (flag === false) return false;
  try {
    if (typeof location !== 'undefined' && /[?&]debug(=1|&|$)/.test(location.search)) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('nbt.debug') === '1') return true;
  } catch {}
  return false;
}
const dlog = (...a) => console.log('[matcher]', ...a);

// ---------- Image load with retries (lh3 + raw + UC view) ----------
function loadImageOnce(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
function buildFallbackUrls(raw) {
  const list = [];
  if (raw.includes('lh3.googleusercontent.com/d/')) {
    list.push(raw.endsWith('=s64') ? raw : `${raw}=s64`);
    list.push(raw.replace(/=s\d+$/, ''));
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
  for (const u of tries) {
    try { return await loadImageOnce(u); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('image load failed');
}

// ---------- Canvas helpers ----------
function toCanvas(img, w = SIZE, h = SIZE) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}
function imageDataFromDataURL(dataURL, w = SIZE, h = SIZE) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cnv = toCanvas(img, w, h);
      const im = cnv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
      resolve(im);
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}

// ---------- Color utils ----------
function rgbToL(a, i) {
  // luma-ish (ok for mask/metrics) — avoids heavy Lab conversion
  const r = a[i], g = a[i + 1], b = a[i + 2];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function rgbDist(a, i, c) {
  // perceptual-ish RGB distance (weights G more)
  const dr = a[i] - c.r, dg = a[i + 1] - c.g, db = a[i + 2] - c.b;
  return Math.sqrt(dr * dr * 0.8 + dg * dg * 1.4 + db * db * 0.6);
}

// ---------- Unboard: soft color-key to transparency ----------
function sampleBorderColors(im) {
  const { data, width: w, height: h } = im;
  const pick = (x, y) => {
    const i = (y * w + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  const samples = [];
  for (let x = 0; x < w; x++) { samples.push(pick(x, 0), pick(x, h - 1)); }
  for (let y = 1; y < h - 1; y++) { samples.push(pick(0, y), pick(w - 1, y)); }

  // cluster 2–3 dominant colors by simple k-means init (pick medians)
  // cheap: take quantiles
  function median(arr, key) {
    const s = arr.map(o => o[key]).sort((a, b) => a - b);
    const m = s.length >> 1; return s.length & 1 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }
  const c1 = { r: median(samples, 'r'), g: median(samples, 'g'), b: median(samples, 'b') };
  // second: median of farthest half from c1
  const scored = samples.map(c => ({ c, d: Math.abs(c.r - c1.r) + Math.abs(c.g - c1.g) + Math.abs(c.b - c1.b) }))
                        .sort((a, b) => b.d - a.d);
  const half = Math.max(1, Math.floor(scored.length / 2));
  const far = scored.slice(0, half).map(s => s.c);
  const c2 = { r: median(far, 'r'), g: median(far, 'g'), b: median(far, 'b') };

  return [c1, c2];
}

function shrinkImageData(im, border = 1) {
  if (!border) return im;
  const { width: w, height: h } = im;
  const s = document.createElement('canvas');
  s.width = w - border * 2; s.height = h - border * 2;
  const ctxS = s.getContext('2d');
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(im, 0, 0);
  ctxS.drawImage(tmp, border, border, w - border * 2, h - border * 2, 0, 0, s.width, s.height);
  const back = document.createElement('canvas');
  back.width = w; back.height = h;
  back.getContext('2d').drawImage(s, 0, 0, w, h);
  return back.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
}

// soft key to alpha; τ is bg tolerance (higher for low-quality screenshots)
function keyToAlpha(im, bgColors, tau = 16) {
  const { data, width: w, height: h } = im;
  const out = new ImageData(w, h);
  out.data.set(data);

  const tauLo = tau * 0.6, tauHi = tau; // smoothstep window
  let fg = 0;

  for (let i = 0; i < data.length; i += 4) {
    let minD = Infinity;
    for (const c of bgColors) {
      const d = rgbDist(data, i, c);
      if (d < minD) minD = d;
    }
    // soft alpha
    let a = (minD - tauLo) / (tauHi - tauLo);
    if (a < 0) a = 0; else if (a > 1) a = 1;
    out.data[i + 3] = Math.round(a * 255);
    if (a > 0.3) fg++;
  }
  return { im: out, fg, total: (w * h) };
}

// simple morphology on alpha: median 3x3
function median3x3Alpha(im) {
  const { width: w, height: h, data } = im;
  const out = new ImageData(w, h);
  out.data.set(data);
  const getA = (x, y) => data[((y * w + x) * 4) + 3];
  const setA = (x, y, v) => { const i = (y * w + x) * 4 + 3; out.data[i] = v; };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const ns = [];
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) ns.push(getA(x + i, y + j));
      ns.sort((a, b) => a - b);
      setA(x, y, ns[4]);
    }
  }
  return out;
}

// Unboard a crop into *multiple* variants (shrink=1,2,3)
async function unboardCropVariants(dataURL, tau = 16) {
  const im0 = await imageDataFromDataURL(dataURL, SIZE, SIZE);
  const bg = sampleBorderColors(im0);
  const variants = [];
  for (const shrink of [1, 2, 3]) {
    let im = shrinkImageData(im0, shrink);
    let { im: keyed, fg, total } = keyToAlpha(im, bg, tau);
    keyed = median3x3Alpha(keyed);
    variants.push({ im: keyed, fg, total, shrink });
  }
  return variants;
}

// ---------- Masked histograms ----------
function histRGBMasked(im, bins = BINS, alphaThr = 77 /* ~0.3 */) {
  const { data } = im;
  const hist = new Float32Array(bins * 3);
  const step = 256 / bins;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= alphaThr) continue;
    hist[(data[i] / step) | 0] += 1;
    hist[bins + ((data[i + 1] / step) | 0)] += 1;
    hist[2 * bins + ((data[i + 2] / step) | 0)] += 1;
    count++;
  }
  if (!count) return hist;
  for (let i = 0; i < hist.length; i++) hist[i] /= count;
  return hist;
}
function chiSq(h1, h2, eps = 1e-9) {
  let v = 0;
  for (let i = 0; i < h1.length; i++) {
    const a = h1[i], b = h2[i];
    v += ((a - b) * (a - b)) / (a + b + eps);
  }
  return v;
}

// ---------- Metrics over alpha>0.3 ----------
function mseRGBMasked(A, B, alphaThr = 77, dx = 0, dy = 0) {
  const w = A.width, h = A.height;
  const a = A.data, b = B.data;
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) {
    const yb = y + dy; if (yb < 0 || yb >= h) continue;
    for (let x = 0; x < w; x++) {
      const xb = x + dx; if (xb < 0 || xb >= w) continue;
      const ia = (y * w + x) * 4, ib = (yb * w + xb) * 4;
      const aA = a[ia + 3], aB = b[ib + 3];
      if (aA <= alphaThr || aB <= alphaThr) continue;
      const dr = a[ia] - b[ib], dg = a[ia + 1] - b[ib + 1], db = a[ia + 2] - b[ib + 2];
      sum += dr * dr + dg * dg + db * db; n++;
    }
  }
  return n ? sum / (3 * n) : Infinity;
}
function ssimLumaMasked(A, B, alphaThr = 77) {
  const w = A.width, h = A.height;
  const a = A.data, b = B.data;
  const W = 8, C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  const meanVar = (x0, y0) => {
    let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, n = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const xi = (x0 + x) % w, yi = (y0 + y) % h, i = (yi * w + xi) * 4;
      const aA = a[i + 3], aB = b[i + 3];
      if (aA <= alphaThr || aB <= alphaThr) continue;
      const la = rgbToL(a, i), lb = rgbToL(b, i);
      sumA += la; sumB += lb; sumA2 += la * la; sumB2 += lb * lb; n++;
    }
    const muA = n ? sumA / n : 0, muB = n ? sumB / n : 0;
    const sA = n ? Math.max(0, sumA2 / n - muA * muA) : 0;
    const sB = n ? Math.max(0, sumB2 / n - muB * muB) : 0;
    return { muA, muB, sA, sB, n };
  };
  let total = 0, cnt = 0;
  for (let y = 0; y < h; y += W) for (let x = 0; x < w; x += W) {
    const { muA, muB, sA, sB, n } = meanVar(x, y);
    if (!n) continue;
    // covariance
    let cov = 0, nn = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const xi = (x + i) % w, yi = (y + j) % h, k = (yi * w + xi) * 4;
      const aA = a[k + 3], aB = b[k + 3];
      if (aA <= alphaThr || aB <= alphaThr) continue;
      const la = rgbToL(a, k) - muA, lb = rgbToL(b, k) - muB;
      cov += la * lb; nn++;
    }
    cov = nn ? cov / nn : 0;
    const num = (2 * muA * muB + C1) * (2 * cov + C2);
    const den = (muA * muA + muB * muB + C1) * (sA + sB + C2);
    total += den ? num / den : 0; cnt++;
  }
  return cnt ? total / cnt : 0;
}
function nccMasked(A, B, alphaThr = 77, dx = 0, dy = 0) {
  const w = A.width, h = A.height, a = A.data, b = B.data;
  let sumA = 0, sumB = 0, n = 0;
  for (let y = 0; y < h; y++) {
    const yb = y + dy; if (yb < 0 || yb >= h) continue;
    for (let x = 0; x < w; x++) {
      const xb = x + dx; if (xb < 0 || xb >= w) continue;
      const ia = (y * w + x) * 4, ib = (yb * w + xb) * 4;
      if (a[ia + 3] <= alphaThr || b[ib + 3] <= alphaThr) continue;
      const la = rgbToL(a, ia), lb = rgbToL(b, ib);
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
      const ia = (y * w + x) * 4, ib = (yb * w + xb) * 4;
      if (a[ia + 3] <= alphaThr || b[ib + 3] <= alphaThr) continue;
      const la = rgbToL(a, ia) - muA, lb = rgbToL(b, ib) - muB;
      num += la * lb; da2 += la * la; db2 += lb * lb;
    }
  }
  const den = Math.sqrt(da2 * db2) || 1;
  return num / den;
}

// choose best offset by NCC (then break ties with MSE/SSIM)
function bestOffsetScores(A, B) {
  let best = { ncc: -1, mse: Infinity, ssim: -1, dx: 0, dy: 0 };
  for (const dy of OFF) for (const dx of OFF) {
    const ncc = nccMasked(A, B, 77, dx, dy);
    const mse = mseRGBMasked(A, B, 77, dx, dy);
    const ssim = ssimLumaMasked(A, B, 77);
    const better = ncc > best.ncc + 1e-6 ||
      (Math.abs(ncc - best.ncc) < 1e-6 && (mse < best.mse || ssim > best.ssim));
    if (better) best = { ncc, mse, ssim, dx, dy };
  }
  return best;
}

// ---------- Public: reference index ----------
export async function prepareRefIndex(manifest) {
  const refs = [];
  let ok = 0, fail = 0;
  for (const e of manifest || []) {
    const raw = e.src || e.image || e.url;
    if (!raw) continue;
    try {
      const img = await loadImageRobust(raw);
      const cnv = toCanvas(img);
      const im = cnv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, SIZE, SIZE);
      refs.push({
        name: e.name || e.id || 'Unknown',
        src: raw,
        im,                                 // transparent ref
        hist: histRGBMasked(im)             // masked histogram (ignores alpha<=0.3)
      });
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
  dlog('findBestMatch called', {cropType: typeof crop, refCount: Array.isArray(refIndex)? refIndex.length: (refIndex? Object.keys(refIndex).length:0)});
  const {
    shortlistK = SHORTLIST_K,
    // Acceptance: either classic SSIM/MSE or high NCC
    ssimMin = 0.82,
    mseMax = 1100,
    nccMin = 0.88,
    tau = 16,   // bg tolerance for unboarding (raise to 18–20 for low-quality JPG)
    debug
  } = opts;
  const DBG = dbgOn(debug);

  // Build transparent variants of the crop (shrink 1/2/3)
  const variants = await unboardCropVariants(cropDataURL, tau);
  if (DBG) variants.forEach(v =>
    dlog('crop variant', { shrink: v.shrink, fgRatio: +(v.fg / v.total).toFixed(2) })
  );

  // Use the *best variant per ref* implicitly by scoring all variants and taking max per ref.
  // Stage-1: shortlist using the *best* chi^2 across variants.
  const short = refIndex
    .map(r => {
      let bestD = Infinity, bestVar = null;
      for (const v of variants) {
        const h = histRGBMasked(v.im);
        const d = chiSq(h, r.hist);
        if (d < bestD) { bestD = d; bestVar = v; }
      }
      return { r, d: bestD, varIndex: variants.indexOf(bestVar) };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(shortlistK, refIndex.length));

  // Stage-2: precise metrics per ref using that ref's best variant
  const candidates = [];
  for (const item of short) {
    const ref = item.r;
    const v = variants[item.varIndex];
    const scores = bestOffsetScores(v.im, ref.im);
    const combined = (scores.mse / 255) + (1 - scores.ssim) * 200 - (scores.ncc * 50);
    candidates.push({ r: ref, var: v, ...scores, combined });
  }
  candidates.sort((a, b) => a.combined - b.combined);
  const best = candidates[0] || null;

  if (DBG) {
    dlog('best candidates:',
      candidates.slice(0, 3).map(c => ({
        name: c.r.name, shrink: c.var.shrink,
        mse: +c.mse.toFixed(1), ssim: +c.ssim.toFixed(3), ncc: +c.ncc.toFixed(3),
        combined: +c.combined.toFixed(2)
      }))
    );
  }

  if (!best) return null;

  const acceptClassic = best.mse <= mseMax && best.ssim >= ssimMin;
  const acceptNCC = best.ncc >= nccMin;

  if (!acceptClassic && !acceptNCC) {
    if (DBG) dlog('rejected best', {
      name: best.r.name, shrink: best.var.shrink,
      mse: best.mse, ssim: best.ssim, ncc: best.ncc,
      mseMax, ssimMin, nccMin
    });
    return null;
  }

  if (DBG) dlog('ACCEPT', {
    name: best.r.name, shrink: best.var.shrink,
    mse: best.mse, ssim: best.ssim, ncc: best.ncc
  });

  return {
    name: best.r.name,
    src: best.r.src,
    mse: best.mse,
    ssim: best.ssim,
    ncc: best.ncc,
    shrink: best.var.shrink
  };
}