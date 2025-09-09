// scripts/verify-dist.cjs
const fs = require("node:fs");
const path = require("node:path");

const DIST = path.resolve("dist");
const ASSETS = path.join(DIST, "assets");

// In bundled mode, the JSEP loader .mjs is typically inlined into index-*.js.
// We only require that the sibling WASM was emitted.
// Allow either jsep.<hash>.wasm or jsep-<hash>.wasm
const JSEP_WASM_RX = /ort-wasm-simd-threaded\.jsep[-.][a-z0-9_-]+\.wasm$/i;


function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let jsepWasm = null;

for (const f of walk(ASSETS)) {
  if (JSEP_WASM_RX.test(f)) {
    jsepWasm = f;
    break;
  }
}

// 1) Require the JSEP wasm
if (!jsepWasm) {
  console.error("verify-dist (bundled): missing JSEP wasm (.wasm) in /assets/.");
  process.exit(1);
}

// 2) Sanity: file must be non-empty
const wasmSize = fs.statSync(jsepWasm).size;
if (wasmSize <= 0) {
  console.error(`verify-dist (bundled): invalid wasm size (${wasmSize} bytes)`);
  process.exit(1);
}

// 3) Optional: warn (not fail) if we don’t detect the name in main JS (loader likely inlined/minified)
let warned = false;
const indexJs = fs
  .readdirSync(ASSETS)
  .find((n) => /^index-.*\.js$/i.test(n));
if (indexJs) {
  const jsPath = path.join(ASSETS, indexJs);
  const js = fs.readFileSync(jsPath, "utf8");
  if (!/ort-wasm-simd-threaded\.jsep/i.test(js)) {
    warned = true;
    console.warn(
      "verify-dist (bundled): could not find explicit 'ort-wasm-simd-threaded.jsep' marker in index JS. " +
        "This is usually fine (loader code is inlined/minified)."
    );
  }
}

console.log(
  "verify-dist (bundled): OK\n  wasm:",
  path.relative(DIST, jsepWasm),
  `(${wasmSize} bytes)`,
  warned ? "\n  note: loader marker not found in JS (non-fatal)" : ""
);
