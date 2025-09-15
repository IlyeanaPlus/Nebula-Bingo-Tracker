// tools/findUsedFiles.mjs
// Lists which project files are actually included in the bundle starting at src/main.jsx.
// Writes a summary to tools/used_files_report.txt

import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const SRC_DIRS = [
  path.join(projectRoot, "src"),
  path.join(projectRoot, "tools"),
];
const ENTRY = path.join(projectRoot, "src", "main.jsx");

// File types to audit (PNG excluded per request)
const EXTENSIONS = [
  ".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".sass",
  ".json", ".svg", /* ".png", */ ".jpg", ".jpeg", ".gif", ".webp",
  ".wasm", ".mjs", ".cjs"
];

// Globs to ignore
const IGNORE_PATTERNS = [
  "/.vite/", "/dist/", "/node_modules/",
  ".d.ts", ".map", ".lock", ".md",
  "/public/", // public assets are served, not bundled
];

function listAllFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const it of items) {
      const p = path.join(d, it.name);
      if (it.isDirectory()) {
        if (IGNORE_PATTERNS.some(s => p.includes(s))) continue;
        stack.push(p);
      } else {
        const ext = path.extname(p).toLowerCase();
        if (!EXTENSIONS.includes(ext)) continue;
        if (ext === ".png") continue; // hard exclude .png from report
        if (IGNORE_PATTERNS.some(s => p.includes(s))) continue;
        out.push(p);
      }
    }
  }
  return out;
}

function normalize(p) {
  return path.resolve(p).split(path.sep).join("/");
}

function filterOwnedInputs(inputsSet) {
  const owned = new Set();
  for (const p of inputsSet) {
    const abs = normalize(p);
    if (SRC_DIRS.some(dir => abs.startsWith(normalize(dir) + "/"))) {
      owned.add(abs);
    }
  }
  return owned;
}

async function main() {
  // Ensure tools dir exists
  try { fs.mkdirSync(path.join(projectRoot, "tools"), { recursive: true }); } catch {}

  // Dummy outdir is required if any loader would otherwise emit files.
  // We also switch asset loaders to "dataurl" so nothing actually needs to be written.
  const outdir = path.join(projectRoot, ".finder-tmp");

  console.log("[finder] Building with esbuild to collect module graph…");
  let result;
  try {
    result = await build({
      entryPoints: [ENTRY],
      bundle: true,
      metafile: true,
      format: "esm",
      platform: "browser",
      sourcemap: false,
      write: false,
      outdir, // satisfy esbuild when resolving asset outputs
      logLevel: "silent",
      define: {
        "import.meta.env.MODE": JSON.stringify("development"),
        "import.meta.env.BASE_URL": JSON.stringify("/"),
        "import.meta.env.PROD": "false",
        "import.meta.env.DEV": "true",
      },
      // Inline assets instead of using "file" loader (prevents the error)
      loader: {
        ".svg": "dataurl",
        ".png": "dataurl",
        ".jpg": "dataurl",
        ".jpeg": "dataurl",
        ".gif": "dataurl",
        ".webp": "dataurl",
        ".wasm": "dataurl",
      },
      external: [
        "/src/vendor/ort/*",
        "/ort/*",
      ],
    });
  } catch (e) {
    console.error("[finder] esbuild failed:", e?.message || e);
    process.exit(1);
  }

  const meta = result.metafile;
  const inputKeys = Object.keys(meta.inputs || {});
  const usedAbs = new Set(inputKeys.map(k => normalize(path.join(projectRoot, k))));
  const usedOwned = filterOwnedInputs(usedAbs);

  const allCandidates = new Set();
  for (const dir of SRC_DIRS) {
    for (const f of listAllFiles(dir)) {
      allCandidates.add(normalize(f));
    }
  }

  const used = [];
  const unused = [];
  for (const f of allCandidates) {
    if (usedOwned.has(f)) used.push(f); else unused.push(f);
  }

  used.sort(); unused.sort();

  const rel = p => path.relative(projectRoot, p).split(path.sep).join("/");
  const lines = [];
  lines.push(`# Used files report — ${new Date().toISOString()}`);
  lines.push(`Project: ${projectRoot}`);
  lines.push("");
  lines.push(`Entry: ${rel(ENTRY)}`);
  lines.push(`Total considered: ${allCandidates.size}`);
  lines.push(`Used in bundle:  ${used.length}`);
  lines.push(`Maybe unused:    ${unused.length}`);
  lines.push("");
  lines.push("== USED ==");
  for (const f of used) lines.push(rel(f));
  lines.push("");
  lines.push("== MAYBE UNUSED ==");
  for (const f of unused) lines.push(rel(f));
  lines.push("");

  const outPath = path.join(projectRoot, "tools", "used_files_report.txt");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log(`[finder] Done. Used: ${used.length}, Maybe-unused: ${unused.length}`);
  console.log(`[finder] Report written to: ${rel(outPath)}`);
  console.log(`[finder] PNGs excluded from scan & report.`);
}

main().catch(e => {
  console.error("[finder] Unexpected error:", e);
  process.exit(1);
});
