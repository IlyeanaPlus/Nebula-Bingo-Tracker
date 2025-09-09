// scripts/verify-dist.cjs
const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "..", "dist");

// Must exist in build output
const REQUIRED = ["ort-wasm-simd-threaded.jsep.mjs"];

// Disallowed unless whitelisted
const forbidden = ["simd", "thread", "worker", "proxy", "wasm", "jsep"];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    entry.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error("verify-dist: dist/ not found — did build fail?");
  process.exit(1);
}

const files = walk(DIST).map((p) => p.replace(/\\/g, "/").toLowerCase());

// Check required file is present
for (const req of REQUIRED) {
  if (!files.some((f) => f.endsWith(req))) {
    console.error("verify-dist: missing required file:", req);
    process.exit(1);
  }
}

// Block strays (unless explicitly whitelisted)
const offenders = files.filter(
  (f) =>
    forbidden.some((tok) => f.includes(tok)) &&
    !REQUIRED.some((req) => f.endsWith(req))
);

if (offenders.length) {
  console.error("verify-dist: forbidden ORT artifacts detected:\n" + offenders.join("\n"));
  process.exit(1);
}

console.log("verify-dist: OK — only allowed JSEP loader present.");
