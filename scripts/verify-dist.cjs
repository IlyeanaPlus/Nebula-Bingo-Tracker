// scripts/verify-dist.js
const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "..", "dist");
const forbidden = [
  "simd", "thread", "worker", "proxy"
]; // catches ort-wasm-simd.wasm, -threaded.wasm, workers, etc.

function walk(dir, hits = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, hits);
    else hits.push(p);
  }
  return hits;
}

if (!fs.existsSync(DIST)) {
  console.error("verify-dist: dist/ not found, did build fail?");
  process.exit(1);
}

const files = walk(DIST).map(p => p.replace(/\\/g, "/").toLowerCase());

// Ensure model is present
const hasModel = files.some(f => f.endsWith("/models/vision_model_int8.onnx"));
if (!hasModel) {
  console.error("verify-dist: Missing models/vision_model_int8.onnx in dist output.");
  process.exit(1);
}

// Ensure only plain wasm is present
const offenders = files.filter(f =>
  f.includes("ort-wasm") && forbidden.some(tok => f.includes(tok))
);
if (offenders.length) {
  console.error("verify-dist: Forbidden ORT artifacts detected:\n" + offenders.join("\n"));
  process.exit(1);
}

console.log("verify-dist: OK — only plain WASM + INT8 model present.");
