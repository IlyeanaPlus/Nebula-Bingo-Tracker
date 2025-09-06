/* src/utils/image.js — Nebula Bingo Tracker v2 (natural-pixel baseline)
   Exports:
     - fileToImage
     - crop25            // returns 25 PNG dataURLs (square, native-size)
     - get25Rects        // returns 25 square rects in natural pixels
     - clientToNaturalLines
     - normalizeGridLines
     - computeSquareCrops
     - cropToDataURL
     - detectGridFromGreenOverlay
     - extractCropsFromGreenOverlay
     - drawDebugRects
     - saveGridFractions, clearGridFractions
*/

const LINE_MERGE_TOL = 3;
const MIN_PEAK_SEP   = 14;
const NMS_RADIUS     = 6;
const DEFAULT_INSET_FRAC = 0.08;

// Loading
export function fileToImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    let blobUrl = null;
    if (typeof src === "string") img.src = src;
    else if (src instanceof Blob) { blobUrl = URL.createObjectURL(src); img.src = blobUrl; }
    else return reject(new Error("fileToImage: expected File|Blob|string"));
    img.onload = () => { if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 0); resolve(img); };
    img.onerror = () => { if (blobUrl) URL.revokeObjectURL(blobUrl); reject(new Error("fileToImage: failed to load image")); };
  });
}

// Storage (fractions 0..1)
function readSavedFractions() {
  try {
    const raw = localStorage.getItem("nbt.gridFractions");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.v) || !Array.isArray(obj.h)) return null;
    if (obj.v.length !== 6 || obj.h.length !== 6) return null;
    return obj;
  } catch { return null; }
}
export function saveGridFractions(vFractions, hFractions) {
  try { localStorage.setItem("nbt.gridFractions", JSON.stringify({ v: vFractions, h: hFractions })); } catch {}
}
export function clearGridFractions() {
  try { localStorage.removeItem("nbt.gridFractions"); } catch {}
}

// Canvas + sizing
function naturalSize(img) { return { W: img.naturalWidth || img.width, H: img.naturalHeight || img.height }; }
function imageToCanvas(img) {
  const { W, H } = naturalSize(img);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  return { canvas: c, ctx: g };
}
function getImageData(img) { const { canvas, ctx } = imageToCanvas(img); return ctx.getImageData(0, 0, canvas.width, canvas.height); }

// Translate CSS/client coords → natural pixels
export function clientToNaturalLines(img, vClient = [], hClient = []) {
  const sx = (img.naturalWidth  || img.width)  / img.clientWidth;
  const sy = (img.naturalHeight || img.height) / img.clientHeight;
  return { vertical: vClient.map(x => Math.round(x * sx)), horizontal: hClient.map(y => Math.round(y * sy)) };
}

// Peak + line utilities
function nonMaxSuppression1D(arr, radius = NMS_RADIUS) {
  const peaks = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    let isMax = true;
    for (let j = Math.max(0, i - radius); j <= Math.min(arr.length - 1, i + radius); j++) {
      if (arr[j] > v) { isMax = false; break; }
    }
    if (isMax && v > 0) peaks.push(i);
  }
  return peaks;
}
function mergeClosePositions(pos, tol = LINE_MERGE_TOL) {
  const s = [...pos].sort((a, b) => a - b);
  const out = [];
  for (const p of s) {
    if (!out.length || Math.abs(p - out[out.length - 1]) > tol) out.push(p);
  }
  return out;
}
function enforceSixLines(pos, axisLen, saved, isVertical) {
  let arr = mergeClosePositions(pos);
  if (arr.length > 6) {
    const kept = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      if (Math.abs(arr[i] - kept[kept.length - 1]) >= MIN_PEAK_SEP) kept.push(arr[i]);
      if (kept.length === 6) break;
    }
    arr = kept;
  }
  if (arr.length !== 6 && saved) {
    const fr = isVertical ? saved.v : saved.h;
    if (fr?.length === 6) arr = fr.map(f => Math.round(f * axisLen));
  }
  if (arr.length !== 6) {
    arr = Array.from({ length: 6 }, (_, i) => Math.round((i / 5) * axisLen));
  }
  arr = arr
    .map((v, i) => (i && v <= arr[i - 1] ? arr[i - 1] + 1 : v))
    .map(v => Math.max(0, Math.min(axisLen, v)));
  if (arr.length > 6) arr = arr.slice(0, 6);
  while (arr.length < 6) arr.push(axisLen);
  return arr;
}

// GREEN overlay detection (optional)
function greenMaskScores(id, axis) {
  const { width: W, height: H, data } = id;
  const scores = new Array(axis === "x" ? W : H).fill(0);
  const G_MIN = 140, RB_MAX = 110, DOM = 1.2;
  if (axis === "x") {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a > 0 && g >= G_MIN && r <= RB_MAX && b <= RB_MAX && g >= Math.max(r, b) * DOM) s++;
      }
      scores[x] = s;
    }
  } else {
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a > 0 && g >= G_MIN && r <= RB_MAX && b <= RB_MAX && g >= Math.max(r, b) * DOM) s++;
      }
      scores[y] = s;
    }
  }
  return scores;
}
function pickLinePositionsFromScores(scores) {
  const peaks = nonMaxSuppression1D(scores, NMS_RADIUS);
  return peaks.sort((a, b) => scores[b] - scores[a]);
}
export function detectGridFromGreenOverlay(img) {
  const id = getImageData(img);
  const vRaw = pickLinePositionsFromScores(greenMaskScores(id, "x"));
  const hRaw = pickLinePositionsFromScores(greenMaskScores(id, "y"));
  return { vertical: vRaw, horizontal: hRaw };
}

// Normalize → exactly 6×6 lines (natural px)
export function normalizeGridLines(img, detected) {
  const { W, H } = naturalSize(img);
  const saved = readSavedFractions();

  let v = [], h = [];
  if (detected) {
    const tryV = detected.vertical || [];
    const tryH = detected.horizontal || [];
    const looksFraction = (arr) => arr.length && arr.every(n => n >= 0 && n <= 1);
    const maxV = Math.max(...tryV, 0);
    const maxH = Math.max(...tryH, 0);

    if (looksFraction(tryV) && looksFraction(tryH)) {
      v = tryV.map(f => Math.round(f * W));
      h = tryH.map(f => Math.round(f * H));
    } else {
      const needClientScale =
        (typeof detected.space === "string" && detected.space === "client") ||
        (img.clientWidth && img.clientHeight && (maxV <= img.clientWidth || maxH <= img.clientHeight) &&
         (maxV > W || maxH > H || W !== img.clientWidth || H !== img.clientHeight));
      if (needClientScale) {
        const scaled = clientToNaturalLines(img, tryV, tryH);
        v = scaled.vertical; h = scaled.horizontal;
      } else {
        v = tryV.map(x => Math.round(x));
        h = tryH.map(y => Math.round(y));
      }
    }
  }

  v = v.filter(n => Number.isFinite(n) && n >= 0 && n <= W);
  h = h.filter(n => Number.isFinite(n) && n >= 0 && n <= H);

  const v6 = enforceSixLines(v, W, saved, true);
  const h6 = enforceSixLines(h, H, saved, false);

  try {
    saveGridFractions(v6.map(x => x / W), h6.map(y => y / H));
  } catch {}

  return { vertical: v6, horizontal: h6 };
}

// Build 5×5 cells → centered square with inset
function buildCellRects(vLines, hLines) {
  const out = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x0 = vLines[c], x1 = vLines[c + 1];
      const y0 = hLines[r], y1 = hLines[r + 1];
      out.push({ x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) });
    }
  }
  return out;
}
function squareInterior(rect, insetFrac = DEFAULT_INSET_FRAC) {
  const side = Math.floor(Math.min(rect.w, rect.h));
  const inset = Math.floor(side * insetFrac);
  const inner = Math.max(1, side - inset * 2);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { x: Math.round(cx - inner / 2), y: Math.round(cy - inner / 2), w: inner, h: inner };
}
export function computeSquareCrops(img, normalizedLines, insetFrac = DEFAULT_INSET_FRAC) {
  const cells = buildCellRects(normalizedLines.vertical, normalizedLines.horizontal);
  return cells.map(r => squareInterior(r, insetFrac));
}

// Cropping
export function cropToDataURL(img, rect) {
  const { W, H } = naturalSize(img);
  const x = Math.max(0, Math.min(W - 1, rect.x));
  const y = Math.max(0, Math.min(H - 1, rect.y));
  const w = Math.max(1, Math.min(W - x, rect.w));
  const h = Math.max(1, Math.min(H - y, rect.h));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, x, y, w, h, 0, 0, w, h);
  return c.toDataURL("image/png");
}

// High-level helpers
export function get25Rects(img, lines, insetFrac = DEFAULT_INSET_FRAC) {
  const normalized = normalizeGridLines(img, lines);
  return computeSquareCrops(img, normalized, insetFrac);
}
export function crop25(img, lines, insetFrac = DEFAULT_INSET_FRAC) {
  const rects = get25Rects(img, lines, insetFrac);
  return rects.map(r => cropToDataURL(img, r));
}

// Optional overlay one-shot
export async function extractCropsFromGreenOverlay(baseImg, overlayImg, insetFrac = DEFAULT_INSET_FRAC) {
  const det = detectGridFromGreenOverlay(overlayImg);
  const { W: BW, H: BH } = naturalSize(baseImg);
  const { W: OW, H: OH } = naturalSize(overlayImg);
  let v = det.vertical, h = det.horizontal;
  if (BW !== OW || BH !== OH) {
    const sx = BW / OW, sy = BH / OH;
    v = v.map(x => Math.round(x * sx));
    h = h.map(y => Math.round(y * sy));
  }
  const rects = get25Rects(baseImg, { vertical: v, horizontal: h }, insetFrac);
  return rects.map(r => cropToDataURL(baseImg, r));
}

// Debug (optional)
export function drawDebugRects(img, rects, { stroke = "rgba(255,255,255,0.9)", lineWidth = 2 } = {}) {
  const { W, H } = naturalSize(img);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, W, H);
  g.strokeStyle = stroke;
  g.lineWidth = lineWidth;
  for (const r of rects) g.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  return c.toDataURL("image/png");
}
