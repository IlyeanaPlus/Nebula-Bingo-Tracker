// scripts/verify-dist.cjs
const fs = require("node:fs");
const path = require("node:path");

const DIST = path.resolve("dist");
const mustExist = [
  "ort-wasm/ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm/ort-wasm-simd-threaded.jsep.wasm",
];

function exists(rel) {
  return fs.existsSync(path.join(DIST, rel));
}

// 1) forbid wasm anywhere under assets/
function* walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const wasmStrays = [];
for (const f of walk(path.join(DIST, "assets"))) {
  if (/\.wasm$/i.test(f)) wasmStrays.push(path.relative(DIST, f));
}
if (wasmStrays.length) {
  console.error("verify-dist: found forbidden wasm file(s):\n" + wasmStrays.join("\n"));
  process.exit(1);
}

// 2) require the two public ORT runtime files
for (const rel of mustExist) {
  if (!exists(rel)) {
    console.error(`verify-dist: missing required file: ${rel}`);
    process.exit(1);
  }
}

console.log("verify-dist: OK — JSEP runtime present, no wasm in assets/.");
