// src/utils/image.js
// Nebula Bingo Tracker v2 — grid detection with in-browser tuner (Ctrl+Alt+G)
// 2025-09-06 tuned defaults + live config UI

// -----------------------------
// Config (live-tunable)
// -----------------------------
const CONFIG_KEY = "nbt.gridConfig";

function getDefaultConfig() {
  return {
    // Green mask
    gMinBoost: 1.05,   // require G > gAvg * gMinBoost
    dom: 1.25,         // require G > dom * R and G > dom * B

    // Peak detection
    minPeakSep: 10,    // tighter than before to catch thin lines
    nmsRadius: 4,

    // Cropping
    insetFrac: 0.06,   // smaller inset for tighter crops
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
  // Expose under window.NBT.grid for console tweaks
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

  let gSum = 0, rbSum = 0, px = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    gSum += data[i + 1];
    rbSum += (data[i] + data[i + 2]) / 2;
  }
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
      let row = y * w;
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
    if (proj[i] > proj[i - 1] && proj[i] > proj[i + 1]) {
      raw.push({ x: i, val: proj[i] });
    }
  }
  // Non-max suppression
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

  const xs = findPeaks(projX, cfg.nmsRadius);
  const ys = findPeaks(projY, cfg.nmsRadius);

  // Optionally drop peaks that are too close (post-filter)
  const filtered = (arr) => {
    const out = [];
    for (const v of arr) {
      if (out.length === 0 || v - out[out.length - 1] >= cfg.minPeakSep) out.push(v);
    }
    return out;
  };

  return { xs: filtered(xs), ys: filtered(ys), w, h };
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
// Minimal in-browser tuner
// -----------------------------
function ensureTunerStyles() {
  if (document.getElementById("nbt-grid-tuner-style")) return;
  const style = document.createElement("style");
  style.id = "nbt-grid-tuner-style";
  style.textContent = `
#nbt-grid-tuner {
  position: fixed; right: 16px; top: 16px; z-index: 999999;
  background: #1e1f22; color: #eee; border: 1px solid #333; border-radius: 10px;
  padding: 12px; width: 280px; font: 12px/1.4 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
#nbt-grid-tuner h3 { margin: 0 0 8px 0; font-size: 13px; }
#nbt-grid-tuner label { display: grid; grid-template-columns: 1fr 64px; gap: 6px; margin: 6px 0; align-items: center; }
#nbt-grid-tuner input {
  width: 64px; background:#111; color:#fff; border:1px solid #444; border-radius:6px; padding:4px 6px; text-align:right;
}
#nbt-grid-tuner .row { display:flex; gap:8px; margin-top:8px; }
#nbt-grid-tuner button {
  flex:1; background:#2a2a2a; color:#fff; border:1px solid #444; border-radius:8px; padding:6px 8px; cursor:pointer;
}
#nbt-grid-tuner button:hover { background:#333; }
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
  h.textContent = "Grid Tuner (Ctrl+Alt+G)";
  el.appendChild(h);

  const fields = [
    makeInput("nbt-inset", "insetFrac", cfg.insetFrac),
    makeInput("nbt-minsep", "minPeakSep", cfg.minPeakSep, "1"),
    makeInput("nbt-nms", "nmsRadius", cfg.nmsRadius, "1"),
    makeInput("nbt-gmin", "gMinBoost", cfg.gMinBoost),
    makeInput("nbt-dom", "dom", cfg.dom),
  ];
  for (const { label } of fields) el.appendChild(label);

  const row = document.createElement("div"); row.className = "row";
  const applyBtn = document.createElement("button"); applyBtn.textContent = "Apply";
  const saveBtn = document.createElement("button"); saveBtn.textContent = "Save";
  const closeBtn = document.createElement("button"); closeBtn.textContent = "Close";
  row.append(applyBtn, saveBtn, closeBtn);
  el.appendChild(row);

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
  };

  saveBtn.onclick = () => {
    writeConfig(window.NBT.grid);
    console.info("[NBT] Saved grid config to localStorage:", window.NBT.grid);
  };

  closeBtn.onclick = () => el.remove();

  return el;
}

export function openGridTuner() {
  const existing = document.getElementById("nbt-grid-tuner");
  if (existing) { existing.remove(); return; }
  document.body.appendChild(buildTuner());
}

// Keyboard toggle: Ctrl+Alt+G
(function attachHotkeyOnce() {
  if (window.__nbtHotkeyAttached) return;
  window.__nbtHotkeyAttached = true;
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.altKey && (e.key.toLowerCase() === "g")) {
      e.preventDefault();
      openGridTuner();
    }
  });
})();

// Also expose under window for console usage:
//   window.NBT.grid.insetFrac = 0.05;  // then re-run Fill
window.NBT = window.NBT || {};
window.NBT.openGridTuner = openGridTuner;
window.NBT.resetGridConfig = () => { writeConfig(getDefaultConfig()); window.NBT.grid = readConfig(); };
