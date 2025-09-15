// src/utils/matchers.js
// Re-ranking matcher: CLIP cosine blended with 64-D shape similarity.
// Cosine-classifier head support (sprite_head.json).
// Tuner integration + LIVE DEBUG store (no callsite changes required).

// -------------------- small utils --------------------
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function argsortDesc(arr) { return Array.from(arr.keys()).sort((i, j) => arr[j] - arr[i]); }

// -------------------- DEBUG STORE --------------------
const DBG = (window.__NBT_DEBUG = window.__NBT_DEBUG || {});
DBG.cellTopK = DBG.cellTopK || Object.create(null); // { [tag]: {time, mode, rows, scoreBest} }
DBG.last = DBG.last || null;

function emitTopK(tag, rows, { mode, scoreBest, vecLen, shapeWeight, threshold }) {
  if (tag == null) return;
  const rec = { time: Date.now(), mode, rows, scoreBest, vecLen, shapeWeight, threshold };
  DBG.cellTopK[String(tag)] = rec;
  DBG.last = rec;
  try {
    window.dispatchEvent(new CustomEvent("nbt:match-topk", { detail: { tag: String(tag), ...rec } }));
  } catch {}
}

// Try to infer a "cell number" from a canvas/img element so we can
// record Top-K per cell without changing call sites.
function inferDebugTagFromCanvas(el) {
  if (!el || !(el instanceof Element)) return null;

  // 1) data-cell="N"
  let v = el.getAttribute("data-cell") || el.dataset?.cell;
  if (v) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  // 2) alt="cell N"
  v = el.getAttribute?.("alt") || "";
  const m = /cell\s*(\d+)/i.exec(v);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) return n;
  }
  // 3) nearest .cell wrapper with data-cell
  const cell = el.closest?.(".cell");
  if (cell) {
    v = cell.getAttribute("data-cell") || cell.dataset?.cell;
    if (v) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  // 4) position within the card grid images
  try {
    const list = Array.from(document.querySelectorAll(".bingo-card .cell img.bingo-sprite"));
    const idx = list.indexOf(el);
    if (idx >= 0) return idx + 1; // 1..25
  } catch {}
  return null;
}

// -------------------- SHAPE (64-D) --------------------
function computeShape64(canvas) {
  const w = 32, h = 32;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d");
  tctx.drawImage(canvas, 0, 0, w, h);
  const { data } = tctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2]) / 255;
  }

  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  const Kx = [1,0,-1, 2,0,-2, 1,0,-1];
  const Ky = [1,2, 1, 0,0,0, -1,-2,-1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0, sy = 0, k = 0;
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
        const v = gray[(y + yy) * w + (x + xx)];
        sx += v * Kx[k]; sy += v * Ky[k]; k++;
      }
      const i = y * w + x;
      gx[i] = sx; gy[i] = sy;
    }
  }

  const v = new Float32Array(64);
  for (let gyc = 0; gyc < 8; gyc++) {
    for (let gxc = 0; gxc < 8; gxc++) {
      let sum = 0;
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
        const x = gxc * 4 + xx, y = gyc * 4 + yy, i = y * w + x;
        sum += Math.hypot(gx[i], gy[i]);
      }
      v[gyc * 8 + gxc] = sum / 16;
    }
  }
  let s = 0; for (let i = 0; i < 64; i++) s += v[i] * v[i];
  s = Math.sqrt(Math.max(s, 1e-12));
  for (let i = 0; i < 64; i++) v[i] /= s;
  return v;
}

// -------------------- COSINE HEAD (optional) --------------------
let COSINE_HEAD = null; // {dim, keys, W: Float32Array, scale, keyToIdx: Map}

function b64ToFloat32(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function buildKeyToIdx(index) {
  const m = new Map();
  for (let i = 0; i < index.refs.length; i++) {
    const k = index.refs[i]?.key ?? index.refs[i]?.id ?? index.refs[i]?.name;
    if (k) m.set(k, i);
  }
  return m;
}

export async function loadCosineHead(index, url = "/sprite_head.json") {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const head = await res.json();
    const { dim, keys, weights_b64, scale = 30.0 } = head || {};
    if (!dim || !keys?.length || !weights_b64) return null;

    const W = b64ToFloat32(weights_b64);
    if (W.length !== dim * keys.length) return null;

    const keyToIdx = buildKeyToIdx(index);
    let mapped = 0; for (const k of keys) if (keyToIdx.has(k)) mapped++;
    if (!mapped) return null;

    COSINE_HEAD = { dim, keys, W, scale, keyToIdx };
    if (typeof SETTINGS.scale === "number") COSINE_HEAD.scale = SETTINGS.scale;
    console.debug("[matchers] cosine head loaded:", { dim, classes: keys.length, mapped });
    return COSINE_HEAD;
  } catch (e) {
    console.debug("[matchers] no cosine head:", e);
    return null;
  }
}

function classifyWithHead(vec, index, { canvas = null, shapeWeight = 0.0, needTopK = 0 } = {}) {
  const H = COSINE_HEAD;
  if (!H || !vec || vec.length !== H.dim) return null;

  let cropShape = null;
  const useShape = !!(canvas && shapeWeight > 0 && index.shapes && index.shapes.length);
  if (useShape) { try { cropShape = computeShape64(canvas); } catch {} }

  const K = H.keys.length, D = H.dim, W = H.W;

  let bestI = -1, bestScore = -1e9, bestRow = -1;
  const topRows = needTopK ? [] : null;

  for (let row = 0; row < K; row++) {
    const key = H.keys[row];
    const idx = H.keyToIdx.get(key);
    if (idx == null) continue;

    let s = 0.0, off = row * D;
    for (let d = 0; d < D; d++) s += W[off + d] * vec[d];

    if (useShape && index.shapes[idx]) {
      const ss = dot(cropShape, index.shapes[idx]);
      s = (1 - shapeWeight) * s + shapeWeight * ss;
    }

    if (s > bestScore) { bestScore = s; bestI = idx; bestRow = row; }
    if (topRows) topRows.push({ i: idx, row, key, score: s, ref: index.refs[idx] });
  }

  if (topRows) topRows.sort((a, b) => b.score - a.score);
  if (bestI < 0) return null;

  return { i: bestI, row: bestRow, score: bestScore, topRows };
}

export function classifyTopK(vec, index, k = 10, { canvas = null, shapeWeight = 0.0 } = {}) {
  if (!COSINE_HEAD || vec?.length !== COSINE_HEAD.dim) return null;
  const got = classifyWithHead(vec, index, { canvas, shapeWeight, needTopK: k });
  if (!got) return null;
  return got.topRows.slice(0, k);
}

// -------------------- TUNER SETTINGS --------------------
const SETTINGS_DEFAULT = {
  threshold: 0.1,
  topK: 200,        // classic preselect; 0 => all
  shapeWeight: 0.05,
  scale: undefined,
};
let SETTINGS = { ...SETTINGS_DEFAULT };

export function getMatcherSettings() { return { ...SETTINGS }; }
export function setMatcherSettings(patch = {}) {
  SETTINGS = { ...SETTINGS, ...patch };
  if (typeof patch.scale === "number" && COSINE_HEAD) COSINE_HEAD.scale = patch.scale;
}
window.addEventListener("nbt:tuner-change", (e) => {
  const v = (e && e.detail) || {};
  const next = { ...SETTINGS };
  if ("scoreThreshold" in v) next.threshold = Number(v.scoreThreshold);
  if ("shapeWeight"    in v) next.shapeWeight = Number(v.shapeWeight);
  if ("topK"           in v) next.topK = Math.max(0, parseInt(v.topK, 10));
  if ("scale"          in v) next.scale = Number(v.scale);
  setMatcherSettings(next);
});

// -------------------- MAIN API --------------------
export function findBestMatch(vec, index, opts = {}) {
  const isNumber    = typeof opts === "number";
  const threshold   = isNumber ? opts : (opts.threshold   ?? SETTINGS.threshold);
  const shapeWeight = isNumber ? 0.05 : (opts.shapeWeight ?? SETTINGS.shapeWeight);
  let   topK        = isNumber ? 200  : (opts.topK        ?? SETTINGS.topK);
  const canvas      = isNumber ? null : (opts.canvas      ?? null);

  // NEW: auto-debug tagging — no callsite changes needed
  const explicitTag = isNumber ? null : (opts.debugTag ?? null);
  const tag = explicitTag != null ? explicitTag : inferDebugTagFromCanvas(canvas);
  const wantTopK = isNumber ? 0 : (opts.debugTopK ?? 10);

  // Prefer cosine head if available
  if (COSINE_HEAD && vec?.length === COSINE_HEAD.dim) {
    const got = classifyWithHead(vec, index, { canvas, shapeWeight, needTopK: tag ? Math.max(1, wantTopK) : 0 });
    if (got) {
      if (tag) {
        emitTopK(tag, (got.topRows || []).slice(0, wantTopK), {
          mode: "head", scoreBest: got.score, vecLen: vec.length, shapeWeight, threshold
        });
      }
      if (got.i >= 0 && got.score >= threshold) {
        const ref = index.refs[got.i];
        return { id: ref.key, ref, score: got.score, spriteUrl: ref.spriteUrl };
      }
      // fall through to classic if below threshold
    }
  }

  // Classic CLIP cosine + optional shape rerank
  const sims = new Float32Array(index.count);
  for (let i = 0; i < index.count; i++) sims[i] = dot(vec, index.vecs[i]);

  const order = (topK && topK > 0) ? argsortDesc(sims).slice(0, topK) : argsortDesc(sims);

  let cropShape = null;
  const useShape = !!(canvas && shapeWeight > 0 && index.shapes && index.shapes.length);
  if (useShape) { try { cropShape = computeShape64(canvas); } catch {} }

  let bestI = -1, bestScore = -1e9;
  const rows = tag ? [] : null;

  for (const i of order) {
    let s = sims[i];
    if (useShape && index.shapes[i]) {
      const ss = dot(cropShape, index.shapes[i]);
      s = (1 - shapeWeight) * s + shapeWeight * ss;
    }
    if (s > bestScore) { bestScore = s; bestI = i; }
    if (rows) rows.push({ i, key: index.refs[i]?.key, score: s, ref: index.refs[i] });
  }

  if (tag && rows) {
    rows.sort((a, b) => b.score - a.score);
    emitTopK(tag, rows.slice(0, wantTopK), {
      mode: "classic", scoreBest: bestScore, vecLen: vec.length, shapeWeight, threshold
    });
  }

  if (bestI < 0 || bestScore < threshold) return null;
  const ref = index.refs[bestI];
  return { id: ref.key, ref, score: bestScore, spriteUrl: ref.spriteUrl };
}

// Expose the latest recorded Top-K for a tag (cell number)
export function getLatestTopKFor(tag) {
  return DBG.cellTopK[String(tag)] || null;
}
