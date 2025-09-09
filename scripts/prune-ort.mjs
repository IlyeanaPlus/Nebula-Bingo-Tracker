// scripts/prune-ort.mjs
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const LEGACY_PUBLIC_DIR = path.join(DIST, "ort-wasm");

function rmrf(p) {
  if (!fs.existsSync(p)) return false;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
  else fs.unlinkSync(p);
  return true;
}

const removed = [];
if (rmrf(LEGACY_PUBLIC_DIR)) removed.push(LEGACY_PUBLIC_DIR);

if (removed.length) {
  console.log("prune-ort (bundled mode): removed legacy artifacts:");
  for (const f of removed) console.log("  " + f);
} else {
  console.log("prune-ort (bundled mode): nothing to remove.");
}
