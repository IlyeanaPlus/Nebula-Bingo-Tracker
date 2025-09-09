// scripts/prune-ort.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST = path.resolve(__dirname, "..", "dist");

// Only this file is allowed to remain
const ALLOWED_REL = "ort-wasm/ort-wasm-simd-threaded.jsep.mjs";

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
const removed = [];

for (const abs of files) {
  const rel = abs.replace(/\\/g, "/").toLowerCase();

  // Delete ALL .wasm files, no exceptions
  if (rel.endsWith(".wasm")) {
    try { fs.unlinkSync(abs); removed.push(rel); } catch {}
    continue;
  }

  // Delete any other jsep/glue/worker/proxy artifacts EXCEPT our whitelisted loader
  const isAllowed = rel.endsWith(ALLOWED_REL);
  if (!isAllowed && /jsep\.mjs$|worker.*\.js$|proxy.*\.js$|ort-wasm.*\.js$/i.test(rel)) {
    try { fs.unlinkSync(abs); removed.push(rel); } catch {}
  }
}

console.log(
  removed.length
    ? "prune-ort: removed artifacts:\n" + removed.join("\n")
    : "prune-ort: nothing to prune."
);
