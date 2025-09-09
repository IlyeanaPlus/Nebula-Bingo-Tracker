import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST = path.resolve(__dirname, "..", "dist");

// Only this loader is allowed to remain in the bundle:
const ALLOWED = ["ort-wasm-simd-threaded.jsep.mjs"];

// Delete any other ORT runtime artifacts
const patterns = [
  /ort-wasm.*\.wasm$/i,                 // any wasm
  /ort-wasm.*\.js$/i,                   // any js glue emitted by bundler
  /jsep.*\.mjs$/i,                      // any jsep mjs
  /worker.*\.js$/i,
  /proxy.*\.js$/i,
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
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
  const rel = f.replace(/\\/g, "/");
  const low = rel.toLowerCase();
  if (patterns.some((re) => re.test(low))) {
    if (!ALLOWED.some((a) => low.endsWith(a))) {
      try { fs.unlinkSync(f); removed.push(rel); }
      catch (e) { console.warn("prune-ort: could not remove", rel, e?.message || e); }
    }
  }
}

console.log(
  removed.length
    ? "prune-ort: removed artifacts:\n" + removed.join("\n")
    : "prune-ort: nothing to prune."
);
