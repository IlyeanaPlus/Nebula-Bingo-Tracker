// src/utils/matchers.js
// Color-heavy, stable sprite matcher for Nebula Bingo Tracker.

const DEFAULT_TRIM = 0.02; // empirically best
const SHORTLIST_K = 150;

// -------- drive cache --------
let _driveCachePromise = null;
async function loadDriveCache() {
  if (_driveCachePromise) return _driveCachePromise;
  _driveCachePromise = (async () => {
    try {
      const res = await fetch("drive_cache.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`drive_cache.json http ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("[matcher] drive_cache.json not available", e);
      return {};
    }
  })();
  return _driveCachePromise;
}

// -------- hash parsing / distance --------
function parseHash(h) {
  if (h == null) return null;
  if (typeof h === "bigint") return h;
  if (typeof h === "number") return BigInt(h >>> 0);
  if (typeof h === "string") {
    const s = h.trim();
    if (!s) return null;
    if (s.startsWith("0x")) { try { return BigInt(s); } catch { return null; } }
    if (/^[0-9a-f]+$/i.test(s)) { try { return BigInt("0x" + s); } catch { return null; } }
    if (/^[01]+$/.test(s)) { try { return BigInt("0b" + s); } catch { return null; } }
    return null;
  }
  if (Array.isArray(h)) {
    try { let x = 0n; for (const bit of h) x = (x << 1n) | (bit ? 1n : 0n); return x; }
    catch { return null; }
  }
  if (typeof h === "object") {
    if (typeof h.hex === "string") return parseHash(h.hex);
    if (typeof h.value === "string") return parseHash(h.value);
    if (Array.isArray(h.bits)) return parseHash(h.bits);
    if (Number.isFinite(h.lo) || Number.isFinite(h.hi)) {
      const lo = BigInt((h.lo ?? 0) >>> 0);
      const hi = BigInt((h.hi ?? 0) >>> 0);
      return (hi << 32n) | lo;
    }
  }
  return null;
}

function ham64(a, b) {
  if (a == null || b == null) return 64;
  let x = a ^ b, c = 0;
  while (x) { x &= (x - 1n); c++; }
  return c;
}

// -------- canvas helpers --------
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function toRGBA(imgOrUrl, { trim = DEFAULT_TRIM, size = 32 } = {}) {
  const img = typeof imgOrUrl === "string" ? await loadImage(imgOrUrl) : imgOrUrl;
  const sx = Math.floor(img.width * trim);
  const sy = Math.floor(img.height * trim);
  const sw = Math.max(1, img.width  - 2 * sx);
  const sh = Math.max(1, img.height - 2 * sy);
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

function channels(id, size = 32) {
  const n = size * size;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const gray = new Float32Array(n);
  const p = id.data;
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    const R = p[i], G = p[i + 1], B = p[i + 2];
    r[j] = R / 255; g[j] = G / 255; b[j] = B / 255;
    gray[j] = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
  }
  return { r, g, b, gray };
}

function sample(vec, size, fx, fy) {
  const x = Math.max(0, Math.min(size - 1, Math.floor(fx)));
  const y = Math.max(0, Math.min(size - 1, Math.floor(fy)));
  return vec[y * size + x];
}

function aHash(vec, size = 32, h = 8) {
  const block = size / h;
  let sum = 0; for (let i = 0; i < vec.length; i++) sum += vec[i];
  const avg = sum / vec.length;
  let bits = 0n;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      const gx = Math.min(size - 1, Math.floor((x + 0.5) * block));
      const gy = Math.min(size - 1, Math.floor((y + 0.5) * block));
      const v = vec[gy * size + gx];
      bits = (bits << 1n) | (v >= avg ? 1n : 0n);
    }
  }
  return bits;
}

function dHash(vec, size = 32, w = 9, h = 8) {
  const sx = size / w, sy = size / h;
  let bits = 0n;
  for (let y = 0; y < h; y++) {
    let prev = sample(vec, size, 0.5 * sx, (y + 0.5) * sy);
    for (let x = 1; x < w; x++) {
      const cur = sample(vec, size, (x + 0.5) * sx, (y + 0.5) * sy);
      bits = (bits << 1n) | (prev > cur ? 1n : 0n);
      prev = cur;
    }
  }
  return bits;
}

function edgeHash(gray, size = 32) {
  const W = size, H = size;
  const mag = new Float32Array(W * H);
  const sobelX = [[-1,0,1],[-2,0,2],[-1,0,1]];
  const sobelY = [[-1,-2,-1],[0,0,0],[1,2,1]];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      let gx = 0, gy = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const v = gray[(y + j) * W + (x + i)];
          gx += v * sobelX[j + 1][i + 1];
          gy += v * sobelY[j + 1][i + 1];
        }
      }
      mag[y * W + x] = Math.hypot(gx, gy);
    }
  }
  return aHash(mag, size, 8);
}

// -------- manifest / refs --------
function normalizeManifest(manifest) {
  if (Array.isArray(manifest)) {
    return manifest.map((e, i) => ({
      key: e.key || e.name || String(i),
      name: e.name || e.key || String(i),
      src: e.src || e.image || e.url || null
    }));
  }
  const out = [];
  if (manifest && typeof manifest === "object") {
    for (const k of Object.keys(manifest)) {
      const v = manifest[k] || {};
      out.push({ key: k, name: v.name || k, src: v.src || v.image || v.url || null });
    }
  }
  return out;
}

export async function prepareRefIndex(manifest) {
  const cache = await loadDriveCache();
  const norm = normalizeManifest(manifest);

  let list;
  if (norm.length === 0) {
    // Fallback: cache-only refs (works before "Get Sprites")
    list = Object.keys(cache).map((k) => {
      const c = cache[k] || {};
      return {
        key: k,
        name: c.name || k,
        src: c.src || c.url,
        ahash:    parseHash(c.ahash),
        dhash:    parseHash(c.dhash),
        phash:    parseHash(c.phash),
        edgeHash: parseHash(c.edgeHash),
        ahashR: parseHash(c.ahashR),
        ahashG: parseHash(c.ahashG),
        ahashB: parseHash(c.ahashB),
        dhashR: parseHash(c.dhashR),
        dhashG: parseHash(c.dhashG),
        dhashB: parseHash(c.dhashB),
      };
    }).filter(e => e.src);
  } else {
    list = norm.map((m) => {
      const c = cache[m.key] || cache[m.name] || {};
      return {
        key: m.key,
        name: m.name,
        src: c.src || m.src,
        ahash:    parseHash(c.ahash),
        dhash:    parseHash(c.dhash),
        phash:    parseHash(c.phash),
        edgeHash: parseHash(c.edgeHash),
        ahashR: parseHash(c.ahashR),
        ahashG: parseHash(c.ahashG),
        ahashB: parseHash(c.ahashB),
        dhashR: parseHash(c.dhashR),
        dhashG: parseHash(c.dhashG),
        dhashB: parseHash(c.dhashB),
      };
    }).filter(e => e.src);
  }

  return { list, byKey: new Map(list.map(e => [e.key, e])) };
}

// -------- crop & ref hashing --------
async function hashCrop(dataUrl) {
  const id = await toRGBA(dataUrl, { trim: DEFAULT_TRIM, size: 32 });
  const { r, g, b, gray } = channels(id, 32);
  return {
    ahash: aHash(gray), dhash: dHash(gray), edgeHash: edgeHash(gray),
    ahashR: aHash(r),   ahashG: aHash(g),   ahashB: aHash(b),
    dhashR: dHash(r),   dhashG: dHash(g),   dhashB: dHash(b),
  };
}

function hasAnyHash(r) {
  return !!(r.dhash || r.ahash || r.edgeHash ||
            r.dhashR || r.dhashG || r.dhashB ||
            r.ahashR || r.ahashG || r.ahashB || r.phash);
}

const _refHashMemo = new Map();
async function ensureRefHashes(r) {
  if (!r?.key) return r;
  const memo = _refHashMemo.get(r.key);
  if (memo) { Object.assign(r, memo); return r; }

  if (hasAnyHash(r)) { _refHashMemo.set(r.key, r); return r; }
  if (!r.src) return r;

  try {
    const id = await toRGBA(r.src, { trim: DEFAULT_TRIM, size: 32 });
    const { r: RR, g: GG, b: BB, gray } = channels(id, 32);
    const computed = {
      ahash: aHash(gray), dhash: dHash(gray), edgeHash: edgeHash(gray),
      ahashR: aHash(RR),  ahashG: aHash(GG),  ahashB: aHash(BB),
      dhashR: dHash(RR),  dhashG: dHash(GG),  dhashB: dHash(BB),
    };
    _refHashMemo.set(r.key, computed);
    Object.assign(r, computed);
  } catch {}
  return r;
}

// -------- color-heavy weights & scoring --------
const WEIGHTS = {
  // grayscale much less influential
  dhash: 0.35,
  ahash: 0.20,
  // color structure dominates
  dR: 4, dG: 4, dB: 4,
  // small color aHash assist
  aR: 0.25, aG: 0.25, aB: 0.25,
  // edges help, but don't dominate
  edge: 0.75,
};

function coarseScore(c, r) {
  // rank by color dHash first; tiny nudge from edge if present
  let s = 0, used = 0;
  const add = (a, b, w) => { if (a != null && b != null) { s += w * ham64(a, b); used++; } };
  add(c.dhashR, r.dhashR, 1);
  add(c.dhashG, r.dhashG, 1);
  add(c.dhashB, r.dhashB, 1);
  add(c.edgeHash, r.edgeHash, 0.25);
  return used ? s : Infinity;
}

function weightedDistance(c, r, W = WEIGHTS) {
  let score = 0, used = 0;
  const add = (a, b, w) => { if (a != null && b != null) { score += w * ham64(a, b); used++; } };
  add(c.dhash,  r.dhash,  W.dhash);
  add(c.ahash,  r.ahash,  W.ahash);
  add(c.edgeHash, r.edgeHash, W.edge);
  add(c.dhashR, r.dhashR, W.dR);
  add(c.dhashG, r.dhashG, W.dG);
  add(c.dhashB, r.dhashB, W.dB);
  add(c.ahashR, r.ahashR, W.aR);
  add(c.ahashG, r.ahashG, W.aG);
  add(c.ahashB, r.ahashB, W.aB);
  return used ? score : Infinity;
}

function tieBreak(aKey, bKey) {
  const A = String(aKey), B = String(bKey);
  return A < B ? -1 : (A > B ? 1 : 0);
}

// -------- public API --------
export async function findBestMatch(cropUrl, refsIndexOrArray) {
  const refs = Array.isArray(refsIndexOrArray)
    ? refsIndexOrArray
    : (refsIndexOrArray?.list || []);
  if (!cropUrl || !Array.isArray(refs) || refs.length === 0) return null;

  const crop = await hashCrop(cropUrl);

  // ensure hashes for refs (from cache or computed once from local src)
  const candidates = [];
  for (const r of refs) {
    await ensureRefHashes(r);
    candidates.push({ r, coarse: coarseScore(crop, r) });
  }

  // shortlist with deterministic tiebreak
  candidates.sort((a, b) => {
    if (a.coarse !== b.coarse) return a.coarse - b.coarse;
    return tieBreak(a.r.key, b.r.key);
  });
  const shortlist = candidates.slice(0, Math.min(SHORTLIST_K, candidates.length));

  // refine by weighted distance (deterministic tie break)
  let best = null, bestScore = Infinity, bestKey = null;
  for (const { r } of shortlist) {
    const s = weightedDistance(crop, r, WEIGHTS);
    if (s < bestScore || (s === bestScore && tieBreak(r.key, bestKey) < 0)) {
      best = r; bestScore = s; bestKey = r.key;
    }
  }

  return best ? { key: best.key, name: best.name, src: best.src, score: bestScore } : null;
}
