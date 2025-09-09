// scripts/verify-dist.cjs
const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "..", "dist");
const REQUIRED_REL = "ort-wasm/ort-wasm-simd-threaded.jsep.mjs";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error("verify-dist: dist/ not found — did build fail?");
  process.exit(1);
}

const filesAbs = walk(DIST);
const files = filesAbs.map((p) => p.replace(/\\/g, "/").toLowerCase());

// 1) Required JSEP loader must exist exactly at dist/ort-wasm/...
if (!files.some((f) => f.endsWith(REQUIRED_REL))) {
  console.error("verify-dist: missing required runtime:", REQUIRED_REL);
  process.exit(1);
}

// 2) No .wasm anywhere
const wasmStrays = files.filter((f) => f.endsWith(".wasm"));
if (wasmStrays.length) {
  console.error("verify-dist: found forbidden .wasm file(s):\n" + wasmStrays.join("\n"));
  process.exit(1);
}

// 3) No other JSEP loaders/glue besides the required one
const otherJsep = files.filter(
  (f) => /jsep\.mjs$/.test(f) && !f.endsWith(REQUIRED_REL)
);
if (otherJsep.length) {
  console.error(
    "verify-dist: unexpected JSEP loader(s) present:\n" + otherJsep.join("\n")
  );
  process.exit(1);
}

console.log("verify-dist: OK — only the whitelisted JSEP loader is present, no .wasm files.");
