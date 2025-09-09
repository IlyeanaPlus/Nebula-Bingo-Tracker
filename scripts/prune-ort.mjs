// scripts/prune-ort.mjs
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");

// delete ONLY wasm that landed in /assets (hashed bundles)
function* walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const removed = [];
for (const f of walk(DIST)) {
  const rel = path.relative(DIST, f).replace(/\\/g, "/");
  if (rel.startsWith("assets/") && /\.wasm$/i.test(rel)) {
    fs.unlinkSync(f);
    removed.push(path.resolve(f));
  }
}

if (removed.length) {
  console.log("prune-ort: removed artifacts:");
  for (const f of removed) console.log(f);
} else {
  console.log("prune-ort: nothing to remove");
}
