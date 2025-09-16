// Usage: node scripts/lift_v2_to_v4.mjs [inPath] [outPath] [base]
// - inPath:  defaults to ./public/sprite_index_clip.json
// - outPath: defaults to ./public/sprite_index_clip.json  (overwrite in place)
// - base:    URL base, defaults to "/"  (set to "/your/subpath/" if you deploy under a subpath)

import fs from "node:fs";
import path from "node:path";

const inPath  = process.argv[2] || "./public/sprite_index_clip.json";
const outPath = process.argv[3] || inPath;
const baseArg = process.argv[4] || "/";

const base = baseArg.endsWith("/") ? baseArg : baseArg + "/";

const raw = fs.readFileSync(inPath, "utf8");
const j = JSON.parse(raw);

// Helpers
const strip = (s) => String(s || "").replace(/^\/+/, "");
const joinBase = (rel) => base + strip(rel);
const fromB64F32 = (b64) => {
  const bin = Buffer.from(String(b64 || ""), "base64");
  return new Float32Array(bin.buffer, bin.byteOffset, Math.floor(bin.byteLength / 4));
};
const toB64F32 = (f32) => {
  const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
  return buf.toString("base64");
};
const l2norm = (arr, start, end) => {
  let s = 0;
  for (let i = start; i < end; i++) s += arr[i] * arr[i];
  s = Math.sqrt(s) || 1;
  for (let i = start; i < end; i++) arr[i] /= s;
};

// Detect shapes
const looksLikeV4 = j?.version === 4 && Array.isArray(j.items) && j.vectors_b64;
const looksLikeV3 = j?.version === 3 && (Array.isArray(j.meta) || Array.isArray(j.items)) && j.vectors_b64;
const looksLikeV2 = !j?.version && Array.isArray(j.items) && j.items.length && ("vector_b64" in j.items[0]);

if (looksLikeV4) {
  console.log("Already v4 — nothing to do.");
  process.exit(0);
}

if (looksLikeV3) {
  console.error("Input looks like v3. Use the v3→v4 lift instead.");
  process.exit(2);
}

if (!looksLikeV2) {
  throw new Error("Input does not look like v2 (expected items[] with per-item vector_b64).");
}

const itemsIn = j.items;
const count = itemsIn.length;

// Infer dim from first vector
const v0 = fromB64F32(itemsIn[0].vector_b64);
const dim = v0.length;
if (!dim || dim % 4 !== 0) {
  console.warn(`Unusual dim=${dim}. Continuing…`);
}

// Build one packed Float32Array
const packed = new Float32Array(count * dim);

// Copy and (optionally) normalize
let anyUnnormalized = false;
for (let i = 0; i < count; i++) {
  const v = fromB64F32(itemsIn[i].vector_b64);
  if (v.length !== dim) {
    throw new Error(`Dim mismatch at item ${i}: expected ${dim}, got ${v.length}`);
  }
  packed.set(v, i * dim);

  // Heuristic: check if close to unit norm
  let s = 0;
  for (let k = 0; k < dim; k++) { const x = v[k]; s += x * x; }
  const norm = Math.sqrt(s);
  if (Math.abs(norm - 1) > 1e-3) anyUnnormalized = true;
}

// Normalize rows if needed
if (anyUnnormalized) {
  for (let i = 0; i < count; i++) l2norm(packed, i * dim, (i + 1) * dim);
}

// Convert per-item metadata → v4 items
const itemsOut = itemsIn.map((m, idx) => {
  // v2 often has { sprite } or { path }; synthesize path/url
  const relPath = m.path || (m.sprite ? `sprites/${strip(m.sprite)}` : undefined);
  const url = relPath ? joinBase(relPath) : undefined;

  return {
    idx,
    key: m.key,
    dex: m.dex,
    slug: m.slug,
    name: m.name,
    path: relPath,
    url,
    shape64_b64: m.shape64_b64, // keep if present
  };
});

// Emit v4
const out = {
  version: 4,
  dim,
  count,
  normalized: true, // after normalization pass above
  vectors_b64: toB64F32(packed),
  items: itemsOut,
};

fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`✔ Lifted v2 → v4
- dim: ${dim}
- count: ${count}
- normalized: true
- written: ${path.resolve(outPath)}
- base used for urls: ${base}`);
