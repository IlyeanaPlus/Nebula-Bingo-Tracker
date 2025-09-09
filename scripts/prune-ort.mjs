// scripts/prune-ort.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST = path.resolve(__dirname, "..", "dist");

// Whitelist — this file is allowed to stay
const ALLOWED = ["ort-wasm-simd-threaded.jsep.mjs"];

// Catch-all prune patterns (delete all other wasm/simd/thread/proxy artifacts)
const patterns = [
  /ort-wasm.*\.wasm$/i,
  /ort-wasm.*\.js$/i,
  /jsep.*\.mjs$/i,
  /worker.*\.js$/i,
  /proxy.*\.js$/i,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    entry.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error("prune-ort: dist/ not found — did build fail?");
  process.exit(1);
}

const files = walk(DIST);
let removed = [];

for (const f of files) {
  const rel = f.replace(/\\/g, "/").toLowerCase();
  if (patterns.some((re) => re.test(rel))) {
    if (!ALLOWED.some((a) => rel.endsWith(a))) {
      try {
        fs.unlinkSync(f);
        removed.push(rel);
      } catch (e) {
        console.warn("prune-ort: could not remove", rel, e?.message || e);
      }
    }
  }
}

if (removed.length) {
  console.log("prune-ort: removed artifacts:\n" + removed.join("\n"));
} else {
  console.log("prune-ort: nothing to prune.");
}
