/* src/utils/image.js
   Nebula Bingo Tracker — grid & crop utilities (full drop-in, with fileToImage)

   - fileToImage(File|Blob|string): Promise<HTMLImageElement>
   - Green overlay grid detection (bright green → lines)
   - Normalizes to exactly 6 vertical + 6 horizontal lines in NATURAL pixels
   - Builds 25 square interior crops with configurable inset
   - Safe, clamped cropping to PNG dataURLs
*/

const LINE_MERGE_TOL = 3;           // px, at natural size
const MIN_PEAK_SEP   = 14;          // px, distance between line peaks at natural size
const NMS_RADIUS     = 6;           // px, non-max suppression window
const DEFAULT_INSET_FRAC = 0.08;    // 8% padding of square side on each edge

// -----------------------------
// Loading helpers
// -----------------------------
export function fileToImage(src) {
  // Accepts File, Blob, or string (URL/dataURL). Returns a loaded <img>.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";

    let objectUrl = null;
    if (typeof src === "string") {
      img.src = src; // URL or dataURL
    } else if (src instanceof Blob) {
      objectUrl = URL.createObjectURL(src);
      img.src = objectUrl;
    } else {
      return reject(new Error("fileToImage: expected File|Blob|string"));
    }

    img.onload = () => {
      // Revoke later to avoid upsetting some browsers while decoding
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      resolve(img);
    };
    img.onerror = (e) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("fileToImage: failed to load image"));
    };
  });
}

// -----------------------------
// LocalStorage helpers (fractions: 0..1)
// -----------------------------
function readSavedFractions() {
  try {
    const raw = localStorage.getItem("nbt.gridFractions");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj) return null;
    if (!Array.isArray(obj.v) || !Array.isArray(obj.h)) return null;
    if (obj.v.length !== 6 || obj.h.length !== 6) return null;
    return obj;
  } catch { return null; }
}

export function saveGridFractions(vFractions, hFractions) {
  try {
    localStorage.setItem("nbt.gridFractions", JSON.stringify({ v: vFractions, h: hFractions }));
  } catch {}
}

export function clearGridFractions() {
  try { localStorage.removeItem("nbt.gridFractions"); } catch {}
}

// -----------------------------
// Canvas helpers
// -----------------------------
function naturalSize(img) {
  return {
    W: img.naturalWidth  || img.width,
    H: img.naturalHeight || img.height,
  };
}

function imageToCanvas(img) {
  const { W, H } = naturalSize(img);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  return { canvas: c, ctx: g };
}

function getImageData(img) {
  const { canvas, ctx } = imageToCanvas(img);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// If detector lines are in client/CSS space, convert to natural pixel space.
export function clientToNaturalLines(img, clientVertical, clientHorizontal) {
  const sx = (img.naturalWidth  || img.width)  / img.clientWidth;
  const sy = (img.naturalHeight || img.height) / img.clientHeight;
  return {
    vertical: (clientVertical  || []).map(x => Math.round(x * sx)),
    horizontal: (clientHorizontal || []).map(y => Math.round(y * sy)),
  };
}

// -----------------------------
// Peak utilities (1D)
// -----------------------------
function nonMaxSuppression1D(array, radius = NMS_RADIUS) {
  const peaks = [];
  for (let i = 0; i < array.length; i++) {
    const v = array[i];
    let isMax = true;
    for (let j = Math.max(0, i - radius); j <= Math.min(array.length - 1, i + radius); j++) {
      if (array[j] > v) { isMax = false; break; }
    }
    if (isMax && v > 0) peaks.push(i);
  }
  return peaks;
}

function mergeClosePositions(positions, tol = LINE_MERGE_TOL) {
  const sorted = [...positions].sort((a, b) => a - b);
  const merged = [];
  for (const p of sorted) {
    if (!merged.length || Math.abs(p - merged[merged.length - 1]) > tol) {
      merged.push(p);
    }
  }
  return merged;
}

function enforceSixLines(positions, axisLen, savedFracs, useVertical) {
  let arr = mergeClosePositions(positions);
  if (arr.length > 6) {
    const kept = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      if (Math.abs(arr[i] - kept[kept.length - 1]) >= MIN_PEAK_SEP) kept.push(arr[i]);
      if (kept.length === 6) break;
    }
    arr = kept;
  }

  if (arr.length !== 6 && savedFracs) {
    const fracs = useVertical ? savedFracs.v : savedFracs.h;
    if (fracs?.length === 6) {
      arr = fracs.map(f => Math.round(f * axisLen));
    }
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

// -----------------------------
// GREEN overlay detector (bright-green lines)
// -----------------------------
function greenMaskScores(imgData, axis) {
  const { width: W, height: H, data } = imgData;
  const scores = new Array(axis === "x" ? W : H).fill(0);

  const G_MIN = 140;
  const RB_MAX = 110;
  const DOM_FACTOR = 1.2;

  if (axis === "x") {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = 0; y < H; y++) {
        const idx = (y * W + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        if (a > 0 && g >= G_MIN && r <= RB_MAX && b <= RB_MAX && g >= Math.max(r, b) * DOM_FACTOR) s++;
      }
      scores[x] = s;
    }
  } else {
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        if (a > 0 && g >= G_MIN && r <= RB_MAX && b <= RB_MAX && g >= Math.max(r, b) * DOM_FACTOR) s++;
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

/** Detect grid lines from a GREEN overlay image (preferred path). */
export function detectGridFromGreenOverlay(img) {
  const id = getImageData(img);
  const xScores = greenMaskScores(id, "x");
  const yScores = greenMaskScores(id, "y");
  const vRaw = pickLinePositionsFromScores(xScores);
  const hRaw = pickLinePositionsFromScores(yScores);
  return { vertical: vRaw, horizontal: hRaw };
}

// -----------------------------
// Normalize detected lines to exactly six each
// -----------------------------
export function normalizeGridLines(img, detected) {
  const { W, H } = naturalSize(img);
  const saved = readSavedFractions();

  let v = Array.isArray(detected?.vertical) ? detected.vertical.map(v => Math.round(v)) : [];
  let h = Array.isArray(detected?.horizontal) ? detected.horizontal.map(v => Math.round(v)) : [];

  v = v.filter(n => Number.isFinite(n) && n >= 0 && n <= W);
  h = h.filter(n => Number.isFinite(n) && n >= 0 && n <= H);

  const v6 = enforceSixLines(v, W, saved, true);
  const h6 = enforceSixLines(h, H, saved, false);

  try {
    const vFrac = v6.map(x => x / W);
    const hFrac = h6.map(y => y / H);
    saveGridFractions(vFrac, hFrac);
  } catch {}

  return { vertical: v6, horizontal: h6 };
}

// -----------------------------
// Build cells → square interiors
// -----------------------------
function buildCellRects(vLines, hLines) {
  const rects = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x0 = vLines[c], x1 = vLines[c + 1];
      const y0 = hLines[r], y1 = hLines[r + 1];
      rects.push({ x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) });
    }
  }
  return rects;
}

function squareInterior(rect, insetFrac = DEFAULT_INSET_FRAC) {
  const side = Math.floor(Math.min(rect.w, rect.h));
  const inset = Math.floor(side * insetFrac);
  const inner = Math.max(1, side - inset * 2);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    x: Math.round(cx - inner / 2),
    y: Math.round(cy - inner / 2),
    w: inner,
    h: inner,
  };
}

// Public: compute 25 square crops
export function computeSquareCrops(img, normalizedLines, insetFrac = DEFAULT_INSET_FRAC) {
  const cells = buildCellRects(normalizedLines.vertical, normalizedLines.horizontal);
  return cells.map(r => squareInterior(r, insetFrac));
}

// Public: crop to PNG dataURL
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

// Convenience: one-shot extractor using green overlay image
export async function extractCropsFromGreenOverlay(baseImg, overlayImg, insetFrac = DEFAULT_INSET_FRAC) {
  const detected = detectGridFromGreenOverlay(overlayImg);
  const { W: BW, H: BH } = naturalSize(baseImg);
  const { W: OW, H: OH } = naturalSize(overlayImg);

  let v = detected.vertical, h = detected.horizontal;
  if (BW !== OW || BH !== OH) {
    const sx = BW / OW, sy = BH / OH;
    v = v.map(x => Math.round(x * sx));
    h = h.map(y => Math.round(y * sy));
  }

  const normalized = normalizeGridLines(baseImg, { vertical: v, horizontal: h });
  const rects = computeSquareCrops(baseImg, normalized, insetFrac);
  return rects.map(r => cropToDataURL(baseImg, r));
}

// Debug: draw rect outlines for your modal
export function drawDebugRects(img, rects, { stroke = "rgba(255,255,255,0.9)", lineWidth = 2 } = {}) {
  const { W, H } = naturalSize(img);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, W, H);
  g.strokeStyle = stroke;
  g.lineWidth = lineWidth;
  for (const r of rects) {
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  }
  return c.toDataURL("image/png");
}
