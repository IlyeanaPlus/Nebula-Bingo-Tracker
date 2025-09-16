// scripts/check-legacy-imports.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const EXTS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const BANNED = [
  "utils/computeCrops25",
  "utils/initIndex",
  "utils/sprites_legacy",
  "utils/matchers_shape",
  "utils/matchers_alt",
  // Old clip helpers (keep clipSession.js)
  "utils/clip.js",
  "utils/clipLegacy",
];

const WILDCARDS = [
  /utils\/computeCrops25(\.|["'])/,
  /utils\/initIndex(\.|["'])/,
  /utils\/sprites_legacy/,
  /utils\/matchers_(shape|alt)/,
  /utils\/clip(?:(?!Session)\w*)\.js/ // matches clip.js, clipLegacy.js, etc. but not clipSession.js
];

const hits = [];

function scanFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    // plain paths
    for (const b of BANNED) {
      if (line.includes(`"${b}"`) || line.includes(`'${b}'`)) {
        hits.push({ file, line: i + 1, text: line.trim(), why: `Import of ${b}` });
      }
    }
    // wildcard patterns
    for (const re of WILDCARDS) {
      if (re.test(line)) {
        hits.push({ file, line: i + 1, text: line.trim(), why: `Matches ${re}` });
      }
    }
  });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (EXTS.has(path.extname(p))) scanFile(p);
  }
}

if (!fs.existsSync(ROOT)) {
  console.error(`No src/ directory at ${ROOT}`);
  process.exit(2);
}

walk(ROOT);

if (hits.length) {
  console.error("\nLegacy imports found:");
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}\n    ${h.text}\n    → ${h.why}\n`);
  }
  process.exit(1);
} else {
  console.log("✓ No legacy imports detected.");
}
