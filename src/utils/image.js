// src/utils/image.js
// Nebula Bingo Tracker v2 — tuned grid detection + in-browser tuner & overlay
// Hotkey: Alt+Shift+G

// -----------------------------
// Live config (localStorage-backed)
// -----------------------------
const CONFIG_KEY = "nbt.gridConfig";

function getDefaultConfig() {
  return {
    // Green mask thresholds
    gMinBoost: 1.05,   // require G > gAvg * gMinBoost
    dom: 1.25,         // require G > dom * R and G > dom * B

    // Peak detection
    minPeakSep: 10,    // drop peaks closer than this (post-filter)
    nmsRadius: 4,      // non-max suppression radius

    // Cropping
    insetFrac: 0.06,   // inner padding fraction per cell
  };
}

function readConfig() {
  const d = getDefaultConfig();
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    return { ...d, ...saved };
  } catch {
    return d;
  }
}

function writeConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function getCfg() {
  // Expose for console tuning
  window.NBT = window.NBT || {};
  window.NBT.grid = window.NBT.grid || readConfig();
  return window.NBT.grid;
}

// -----------------------------
// Utilities
// -----------------------------
export async function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function toImageData(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// -----------------------------
// Green mask (adaptive)
// -----------------------------
function makeGreenMask(data, w, h) {
  const cfg = getCfg();
  const mask = new Uint8Array(w * h);

  let gSum = 0, px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) gSum += data[i + 1];
  const gAvg = gSum / px;
  const G_MIN = gAvg * cfg.gMinBoost;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > G_MIN && g > cfg.dom * r && g > cfg.dom * b) {
        mask[y * w + x] = 1;
      }
    }
  }
  return mask;
}

// -----------------------------
// Projections & peaks
// -----------------------------
function project(mask, w, h, axis = "x") {
  const proj = new Float32Array(axis === "x" ? w : h);
  if (axis === "x") {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) proj[x] += mask[row + x];
    }
  } else {
    for (let y = 0; y < h; y++) {
      let acc = 0, row = y * w;
      for (let x = 0; x < w; x++) acc += mask[row + x];
      proj[y] = acc;
    }
  }
  return proj;
}

function smooth(arr) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const prev = arr[i - 1] ?? arr[i];
    const next = arr[i + 1] ?? arr[i];
    out[i] = (prev + arr[i] + next) / 3;
  }
  return out;
}

function findPeaks(proj, nmsRadius) {
  const raw = [];
  for (let i = 1; i < proj.length - 1; i++) {
    if (proj[i] > proj[i - 1] && proj[i] > proj[i + 1]) raw.push({ x: i, val: proj[i] });
  }
  // non-maximum suppression
  raw.sort((a, b) => b.val - a.val);
  const kept = [];
  for (const p of raw) {
    if (kept.every(k => Math.abs(k.x - p.x) > nmsRadius)) kept.push(p);
  }
  kept.sort((a, b) => a.x - b.x);
  return kept.map(p => p.x);
}

// -----------------------------
// Grid detection & cropping
// -----------------------------
export function detectGrid(img) {
  const cfg = getCfg();
  const { data, width: w, height: h } = toImageData(img);
  const mask = makeGreenMask(data, w, h);

  const projX = smooth(project(mask, w, h, "x"));
  const projY = smooth(project(mask, w, h, "y"));

  const xs0 = findPeaks(projX, cfg.nmsRadius);
  const ys0 = findPeaks(projY, cfg.nmsRadius);

  // post-filter by min separation
  const filtered = (arr) => {
    const out = [];
    for (const v of arr) {
      if (!out.length || v - out[out.length - 1] >= cfg.minPeakSep) out.push(v);
    }
    return out;
  };

  return { xs: filtered(xs0), ys: filtered(ys0), w, h };
}

export function cropCells(img, grid) {
  const cfg = getCfg();
  const { xs, ys } = grid;
  const crops = [];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  for (let row = 0; row < ys.length - 1; row++) {
    for (let col = 0; col < xs.length - 1; col++) {
      const x0 = xs[col], x1 = xs[col + 1];
      const y0 = ys[row], y1 = ys[row + 1];
      const cw = x1 - x0, ch = y1 - y0;
      const insetX = cw * cfg.insetFrac, insetY = ch * cfg.insetFrac;

      canvas.width = Math.max(1, Math.round(cw - insetX * 2));
      canvas.height = Math.max(1, Math.round(ch - insetY * 2));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      ctx.drawImage(
        img,
        x0 + insetX, y0 + insetY,
        cw - insetX * 2, ch - insetY * 2,
        0, 0,
        canvas.width, canvas.height
      );
      crops.push(canvas.toDataURL());
    }
  }
  return crops;
}

// Persist fractions (unchanged)
export function saveGridFractions(grid) {
  const { xs, ys, w, h } = grid;
  const xf = xs.map(x => x / w);
  const yf = ys.map(y => y / h);
  localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf }));
}

export function loadGridFractions() {
  const saved = localStorage.getItem("nbt.gridFractions");
  if (!saved) return null;
  try { return JSON.parse(saved); } catch { return null; }
}

// -----------------------------
// Baseline compatibility (equalize 5×5 + crop25)
// -----------------------------
function equalizeAxisTo5(lines, span) {
  if (!lines || lines.length < 2) {
    // fallback: 5 equal cells across full span
    return [0, span * 0.2, span * 0.4, span * 0.6, span * 0.8, span].map(v => Math.round(v));
  }
  const first = lines[0];
  const last = lines[lines.length - 1];
  const total = Math.max(1, last - first);
  const out = [];
  for (let i = 0; i <= 5; i++) out.push(Math.round(first + (total * i) / 5));
  return out.map(v => Math.min(span, Math.max(0, v)));
}

export function equalizeGridTo5x5(grid) {
  const { xs, ys, w, h } = grid;
  const ex = equalizeAxisTo5(xs, w);
  const ey = equalizeAxisTo5(ys, h);
  return { xs: ex, ys: ey, w, h };
}

/**
 * crop25(imgOrFile) -> Promise<string[]>
 * Detects grid, equalizes to 5×5, saves fractions, returns 25 dataURLs.
 */
export async function crop25(imgOrFile) {
  const img = (imgOrFile instanceof File) ? await fileToImage(imgOrFile) : imgOrFile;
  const detected = detectGrid(img);
  const eq = equalizeGridTo5x5(detected);
  saveGridFractions(eq);
  return cropCells(img, eq);
}

// -----------------------------
// Overlay (green lines) helpers
// -----------------------------
let __overlay = null;
let __overlayTargetImg = null;
let __overlayGrid = null;
let __overlayObjectURL = null;

function createOverlayCanvas() {
  if (__overlay) return __overlay;
  const c = document.createElement("canvas");
  c.id = "nbt-grid-overlay";
  c.style.position = "absolute";
  c.style.pointerEvents = "none";
  c.style.zIndex = "999998";
  c.style.left = "0";
  c.style.top = "0";
  document.body.appendChild(c);

  window.addEventListener("resize", () => positionOverlay());
  window.addEventListener("scroll", () => positionOverlay(), true);

  __overlay = c;
  return c;
}

function positionOverlay() {
  if (!__overlay || !__overlayTargetImg) return;
  const r = __overlayTargetImg.getBoundingClientRect();
  __overlay.width = Math.max(1, Math.floor(r.width));
  __overlay.height = Math.max(1, Math.floor(r.height));
  __overlay.style.left = `${Math.floor(r.left + window.scrollX)}px`;
  __overlay.style.top = `${Math.floor(r.top + window.scrollY)}px`;
}

function drawOverlayGrid(grid) {
  if (!__overlay || !__overlayTargetImg || !grid) return;
  __overlayGrid = grid;

  positionOverlay();
  const ctx = __overlay.getContext("2d");
  ctx.clearRect(0, 0, __overlay.width, __overlay.height);

  const r = __overlayTargetImg.getBoundingClientRect();
  const scaleX = r.width / grid.w;
  const scaleY = r.height / grid.h;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,255,140,0.95)";
  ctx.setLineDash([6, 3]);

  // verticals
  ctx.beginPath();
  for (const x of grid.xs) {
    const dx = Math.round(x * scaleX) + 0.5;
    ctx.moveTo(dx, 0);
    ctx.lineTo(dx, r.height);
  }
  // horizontals
  for (const y of grid.ys) {
    const dy = Math.round(y * scaleY) + 0.5;
    ctx.moveTo(0, dy);
    ctx.lineTo(r.width, dy);
  }
  ctx.stroke();

  // optional center dots per cell
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  for (let row = 0; row < grid.ys.length - 1; row++) {
    for (let col = 0; col < grid.xs.length - 1; col++) {
      const x0 = Math.round(grid.xs[col] * scaleX);
      const x1 = Math.round(grid.xs[col + 1] * scaleX);
      const y0 = Math.round(grid.ys[row] * scaleY);
      const y1 = Math.round(grid.ys[row + 1] * scaleY);
      const cx = Math.round((x0 + x1) / 2);
      const cy = Math.round((y0 + y1) / 2);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function showOverlay() {
  createOverlayCanvas();
  if (__overlay) __overlay.style.display = "block";
  positionOverlay();
  if (__overlayGrid) drawOverlayGrid(__overlayGrid);
}

function hideOverlay() {
  if (__overlay) __overlay.style.display = "none";
}

function setOverlayTarget(imgEl) {
  __overlayTargetImg = imgEl;
  if (!imgEl) { hideOverlay(); return; }
  showOverlay();
}

export function isOverlayVisible() {
  return !!(__overlay && __overlay.style.display !== "none");
}

// -----------------------------
// File / Drag & Drop helpers for tuner
// -----------------------------
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (__overlayObjectURL) URL.revokeObjectURL(__overlayObjectURL);
    __overlayObjectURL = URL.createObjectURL(file);
    img.src = __overlayObjectURL;
  });
}

function createHiddenFileInput(accept = "image/*") {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.position = "fixed";
  input.style.left = "-10000px";
  input.style.top = "-10000px";
  document.body.appendChild(input);
  return input;
}

let __nbtDropHandlersAttached = false;
function attachDropHandlers(onFile) {
  if (__nbtDropHandlersAttached) return;
  __nbtDropHandlersAttached = true;

  const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

  const onDragOver = (e) => {
    prevent(e);
    document.body.classList.add("nbt-drop-active");
  };

  const onDragLeave = (e) => {
    prevent(e);
    document.body.classList.remove("nbt-drop-active");
  };

  const onDrop = async (e) => {
    prevent(e);
    document.body.classList.remove("nbt-drop-active");
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith("image/")) await onFile(f);
  };

  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("dragleave", onDragLeave, true);
  document.addEventListener("drop", onDrop, true);

  window.__nbtDetachDropHandlers = () => {
    document.removeEventListener("dragover", onDragOver, true);
    document.removeEventListener("dragleave", onDragLeave, true);
    document.removeEventListener("drop", onDrop, true);
    __nbtDropHandlersAttached = false;
  };
}

function detachDropHandlers() {
  if (window.__nbtDetachDropHandlers) {
    window.__nbtDetachDropHandlers();
    window.__nbtDetachDropHandlers = null;
  }
}

// -----------------------------
// Tuner UI
// -----------------------------
function ensureTunerStyles() {
  if (document.getElementById("nbt-grid-tuner-style")) return;
  const style = document.createElement("style");
  style.id = "nbt-grid-tuner-style";
  style.textContent = `
#nbt-grid-tuner {
  position: fixed; right: 16px; top: 16px; z-index: 999999;
  background: #1e1f22; color: #eee; border: 1px solid #333; border-radius: 10px;
  padding: 12px; width: 300px; font: 12px/1.4 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
#nbt-grid-tuner h3 { margin: 0 0 8px 0; font-size: 13px; }
#nbt-grid-tuner label { display: grid; grid-template-columns: 1fr 72px; gap: 6px; margin: 6px 0; align-items: center; }
#nbt-grid-tuner input {
  width: 72px; background:#111; color:#fff; border:1px solid #444; border-radius:6px; padding:4px 6px; text-align:right;
}
#nbt-grid-tuner .row { display:flex; gap:8px; margin-top:8px; }
#nbt-grid-tuner button {
  flex:1; background:#2a2a2a; color:#fff; border:1px solid #444; border-radius:8px; padding:6px 8px; cursor:pointer;
}
#nbt-grid-tuner button:hover { background:#333; }
#nbt-grid-tuner .hint { margin-top: 6px; opacity: .8; font-size: 11px; }
body.nbt-drop-active { outline: 2px dashed #0f8; outline-offset: -2px; }
`;
  document.head.appendChild(style);
}

function makeInput(id, labelText, value, step = "0.01") {
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement("input");
  input.id = id;
  input.type = "number";
  input.step = step;
  input.value = String(value);
  label.appendChild(input);
  return { label, input };
}

function buildTuner() {
  ensureTunerStyles();
  const cfg = getCfg();
  const el = document.createElement("div");
  el.id = "nbt-grid-tuner";

  const h = document.createElement("h3");
  h.textContent = "Grid Tuner (Alt+Shift+G)";
  el.appendChild(h);

  const fields = [
    makeInput("nbt-inset", "insetFrac", cfg.insetFrac),
    makeInput("nbt-minsep", "minPeakSep", cfg.minPeakSep, "1"),
    makeInput("nbt-nms", "nmsRadius", cfg.nmsRadius, "1"),
    makeInput("nbt-gmin", "gMinBoost", cfg.gMinBoost),
    makeInput("nbt-dom", "dom", cfg.dom),
  ];
  for (const { label } of fields) el.appendChild(label);

  // Row 1
  const row1 = document.createElement("div"); row1.className = "row";
  const applyBtn = document.createElement("button"); applyBtn.textContent = "Apply";
  const saveBtn = document.createElement("button"); saveBtn.textContent = "Save";
  const closeBtn = document.createElement("button"); closeBtn.textContent = "Close";
  row1.append(applyBtn, saveBtn, closeBtn);
  el.appendChild(row1);

  // Row 2
  const row2 = document.createElement("div"); row2.className = "row";
  const openFileBtn = document.createElement("button"); openFileBtn.textContent = "Open File";
  const pickBtn = document.createElement("button"); pickBtn.textContent = "Pick Image";
  const detectBtn = document.createElement("button"); detectBtn.textContent = "Detect";
  row2.append(openFileBtn, pickBtn, detectBtn);
  el.appendChild(row2);

  // Row 3
  const row3 = document.createElement("div"); row3.className = "row";
  const equalizeBtn = document.createElement("button"); equalizeBtn.textContent = "Equalize 5×5";
  const toggleOverlayBtn = document.createElement("button"); toggleOverlayBtn.textContent = "Show Overlay";
  const exportBtn = document.createElement("button"); exportBtn.textContent = "Export Fractions";
  row3.append(equalizeBtn, toggleOverlayBtn, exportBtn);
  el.appendChild(row3);

  // Row 4 — Remove Image
  const row4 = document.createElement("div"); row4.className = "row";
  const removeImgBtn = document.createElement("button"); removeImgBtn.textContent = "Remove Image";
  row4.append(removeImgBtn);
  el.appendChild(row4);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Tip: drag & drop an image anywhere while this panel is open.";
  el.appendChild(hint);

  // Behaviors
  applyBtn.onclick = () => {
    const next = {
      insetFrac: parseFloat(document.getElementById("nbt-inset").value),
      minPeakSep: parseInt(document.getElementById("nbt-minsep").value, 10),
      nmsRadius: parseInt(document.getElementById("nbt-nms").value, 10),
      gMinBoost: parseFloat(document.getElementById("nbt-gmin").value),
      dom: parseFloat(document.getElementById("nbt-dom").value),
    };
    window.NBT.grid = { ...window.NBT.grid, ...next };
    console.info("[NBT] Applied grid config:", window.NBT.grid);
    if (__overlayTargetImg && isOverlayVisible()) detectAndDrawForTarget();
  };

  saveBtn.onclick = () => {
    writeConfig(window.NBT.grid);
    console.info("[NBT] Saved grid config to localStorage:", window.NBT.grid);
  };

  const closePanel = () => {
    el.remove();
    detachDropHandlers();
    document.removeEventListener("click", clickOnce, { capture: true });
  };
  closeBtn.onclick = closePanel;

  // Open File
  openFileBtn.onclick = async () => {
    const input = createHiddenFileInput("image/*");
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) {
        const img = await loadImageFromFile(f);
        stylePickedImage(img);
        img.id = "nbt-picked-image";
        document.body.appendChild(img);
        setOverlayTarget(img);
        detectAndDrawForTarget();
      }
      input.remove();
    };
    input.click();
  };

  // Pick existing <img> on page
  let picking = false;
  pickBtn.onclick = () => {
    picking = !picking;
    pickBtn.textContent = picking ? "Click any image…" : "Pick Image";
    document.body.style.cursor = picking ? "crosshair" : "";
  };

  const clickOnce = (ev) => {
    if (!picking) return;
    if (ev.target && ev.target.tagName === "IMG") {
      setOverlayTarget(ev.target);
      console.info("[NBT] Overlay target image set.", ev.target);
      picking = false;
      pickBtn.textContent = "Pick Image";
      document.body.style.cursor = "";
      ev.preventDefault();
      ev.stopPropagation();
      detectAndDrawForTarget();
    }
  };
  document.addEventListener("click", clickOnce, { capture: true });

  // Drag & drop anywhere
  attachDropHandlers(async (file) => {
    const img = await loadImageFromFile(file);
    stylePickedImage(img);
    img.id = "nbt-dropped-image";
    document.body.appendChild(img);
    setOverlayTarget(img);
    detectAndDrawForTarget();
  });

  // Detect / Equalize / Toggle / Export / Remove
  detectBtn.onclick = () => detectAndDrawForTarget();

  equalizeBtn.onclick = () => {
    if (!__overlayGrid) return;
    const eq = equalizeGridTo5x5(__overlayGrid);
    __overlayGrid = eq;
    drawOverlayGrid(eq);
  };

  toggleOverlayBtn.onclick = () => {
    if (!__overlay) createOverlayCanvas();
    const visible = isOverlayVisible();
    if (visible) { hideOverlay(); toggleOverlayBtn.textContent = "Show Overlay"; }
    else { showOverlay(); toggleOverlayBtn.textContent = "Hide Overlay"; }
  };

  exportBtn.onclick = () => {
    if (!__overlayGrid) return;
    saveGridFractions(__overlayGrid);
    console.info("[NBT] Exported grid fractions to localStorage (nbt.gridFractions).");
  };

  removeImgBtn.onclick = () => {
    const el1 = document.getElementById("nbt-picked-image");
    const el2 = document.getElementById("nbt-dropped-image");
    if (el1 && el1.parentNode) el1.parentNode.removeChild(el1);
    if (el2 && el2.parentNode) el2.parentNode.removeChild(el2);
    setOverlayTarget(null);
    if (__overlayObjectURL) { URL.revokeObjectURL(__overlayObjectURL); __overlayObjectURL = null; }
  };

  return el;
}

function stylePickedImage(img) {
  img.style.maxWidth = "min(80vw, 1200px)";
  img.style.maxHeight = "80vh";
  img.style.position = "fixed";
  img.style.right = "16px";
  img.style.bottom = "16px";
  img.style.zIndex = "999997";
  img.style.boxShadow = "0 8px 24px rgba(0,0,0,.6)";
  img.style.borderRadius = "8px";
}

// Detect and draw for current overlay target
async function detectAndDrawForTarget() {
  if (!__overlayTargetImg) return;
  const grid = detectGrid(__overlayTargetImg);
  __overlayGrid = grid;
  drawOverlayGrid(grid);
}

// -----------------------------
// Public tuner entry points
// -----------------------------
function ensureHotkey() {
  if (window.__nbtHotkeyAttached) return;
  window.__nbtHotkeyAttached = true;
  // Keyboard toggle: Alt+Shift+G
  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && (e.key.toLowerCase() === "g")) {
      e.preventDefault();
      openGridTuner();
    }
  });
}

export function openGridTuner() {
  const existing = document.getElementById("nbt-grid-tuner");
  if (existing) { existing.remove(); return; }
  document.body.appendChild(buildTuner());
}

ensureTunerStyles();
ensureHotkey();

// Convenience for console
window.NBT = window.NBT || {};
window.NBT.openGridTuner = openGridTuner;
window.NBT.resetGridConfig = () => { writeConfig(getDefaultConfig()); window.NBT.grid = readConfig(); };
