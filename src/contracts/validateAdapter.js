// src/contracts/validateAdapter.js
// Dev-only adapter validator to catch name/shape drift.
// Import and call from BingoCard.jsx before rendering.

const PREFIX = "[AdapterValidator]";

export function validateBingoCardViewProps(p) {
  if (!p || typeof p !== "object") {
    warn("props", "must be an object");
    return;
  }
  mustType(p, "title", "string");
  mustType(p, "renaming", "boolean");
  mustFn(p, "onRenameStart");
  mustFn(p, "onTitleChange");
  mustFn(p, "onRenameSubmit");
  mustFn(p, "onRemove");
  mustType(p, "analyzing", "boolean");
  mustNum(p, "progress");
  mustArrayLen(p, "cells", 25, true); // allow null entries
  mustArrayLen(p, "checked", 25);
  mustFn(p, "onToggleCell");
  mustFn(p, "onPickImage");
  // fileInput can be any element-like value
  if (!("fileInput" in p)) warn("fileInput", "missing (hidden input element)");
  mustType(p, "analyzedOnce", "boolean");

  // Inspect cells
  if (Array.isArray(p.cells)) {
    p.cells.forEach((cell, i) => {
      if (cell == null) return;
      if (typeof cell !== "object") {
        warn(`cells[${i}]`, "must be object or null");
        return;
      }
      const hasImg = !!(cell.spriteUrl || cell.matchUrl || cell.url || (cell.ref && cell.ref.url));
      const ok = hasImg || cell.noMatch === true || cell.empty === true;
      if (!ok) warn(`cells[${i}]`, "needs spriteUrl/url/ref.url or { noMatch:true }");
    });
  }
}

export function validateGridTunerModalProps(p) {
  if (!p || typeof p !== "object") {
    warn("tuner props", "must be an object");
    return;
  }
  // image or imageSrc optional
  mustFractions(p, "fractions");
  // handlers
  mustFn(p, "onChange");
  mustFn(p, "onConfirm");
  mustFn(p, "onCancel");
  // initialFractions optional
  if ("initialFractions" in p) mustFractions(p, "initialFractions");
}

function mustFractions(obj, key) {
  const f = obj[key];
  if (!f || typeof f !== "object") return warn(key, "Fractions required");
  ["left","top","width","height"].forEach(k => {
    if (typeof f[k] !== "number") warn(`${key}.${k}`, "must be number 0..1");
    else if (f[k] < 0 || f[k] > 1) warn(`${key}.${k}`, "out of range 0..1");
  });
}

function mustType(obj, key, type) {
  if (typeof obj[key] !== type) warn(key, `must be ${type}`);
}

function mustNum(obj, key) {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) warn(key, "must be number");
}

function mustFn(obj, key) {
  if (typeof obj[key] !== "function") warn(key, "must be function");
}

function mustArrayLen(obj, key, len, allowNulls=false) {
  const v = obj[key];
  if (!Array.isArray(v)) return warn(key, `must be array[${len}]`);
  if (v.length !== len) warn(key, `must have length ${len} (got ${v.length})`);
  if (!allowNulls) {
    const bad = v.findIndex(x => x == null);
    if (bad !== -1) warn(`${key}[${bad}]`, "null/undefined not allowed");
  }
}

function warn(path, msg) {
  // eslint-disable-next-line no-console
  console.warn(`${PREFIX} ${path}: ${msg}`);
}
