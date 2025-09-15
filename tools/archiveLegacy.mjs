// tools/archiveLegacy.mjs
// Archive or move "legacy" files listed in tools/legacy_list.txt into tools/_legacy_archive/<stamp>/...
// Usage:
//   node tools/archiveLegacy.mjs                # copy to archive (default, safest)
//   node tools/archiveLegacy.mjs --mode=move    # move files (FS move)
//   node tools/archiveLegacy.mjs --mode=git-mv  # git mv files (requires git in PATH)
//   node tools/archiveLegacy.mjs --dry          # dry run
//   node tools/archiveLegacy.mjs --list=path/to/list.txt
//   node tools/archiveLegacy.mjs --force        # allow protected paths

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function arg(flag, def=null){
  const hit = process.argv.find(a=>a.startsWith(flag));
  if(!hit) return def;
  const eq = hit.indexOf("=");
  return eq>0 ? hit.slice(eq+1) : true;
}
const mode = String(arg("--mode","copy")).toLowerCase(); // copy | move | git-mv
const dry  = !!arg("--dry", false);
const listPath = path.resolve(projectRoot, String(arg("--list", "tools/legacy_list.txt")));
const force = !!arg("--force", false);

// Paths that we strongly discourage moving
const PROTECT = new Set([
  "src/main.jsx","src/main.tsx","index.html",".env",".env.local",
  "vite.config.ts","vite.config.js","package.json","package-lock.json","pnpm-lock.yaml","yarn.lock"
]);

function stamp(){
  const d = new Date();
  const z = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
const archiveRoot = path.join(projectRoot, "tools", "_legacy_archive", stamp());

function readList(p) {
  const raw = fs.readFileSync(p, "utf8");
  return raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#"));
}

function withinRepo(absPath) {
  const norm = path.resolve(absPath);
  return norm.startsWith(projectRoot + path.sep);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function copyFilePreserve(relPath) {
  const src = path.join(projectRoot, relPath);
  const dst = path.join(archiveRoot, relPath);
  await ensureDir(path.dirname(dst));
  await fsp.copyFile(src, dst);
}

async function moveFileFS(relPath) {
  const src = path.join(projectRoot, relPath);
  const dst = path.join(archiveRoot, relPath);
  await ensureDir(path.dirname(dst));
  await fsp.rename(src, dst);
}

function moveFileGit(relPath) {
  const src = relPath; // git expects repo-relative
  const dst = path.relative(projectRoot, path.join(archiveRoot, relPath)).split(path.sep).join("/");
  fs.mkdirSync(path.dirname(path.join(projectRoot, dst)), { recursive: true });
  const res = spawnSync("git", ["mv", "-v", src, dst], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (res.status !== 0) throw new Error(`git mv failed for ${relPath}`);
}

async function writeManifest(processed, skipped, errors) {
  await ensureDir(archiveRoot);
  const manifest = {
    projectRoot,
    mode, dry, listPath,
    archiveRoot,
    when: new Date().toISOString(),
    processed,
    skipped,
    errors
  };
  await fsp.writeFile(path.join(archiveRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  const lines = [
    `Legacy archive manifest — ${manifest.when}`,
    `Mode: ${mode}${dry ? " (DRY RUN)" : ""}`,
    `List: ${path.relative(projectRoot, listPath)}`,
    `Archive root: ${path.relative(projectRoot, archiveRoot)}`,
    "",
    `Processed (${processed.length}):`,
    ...processed.map(x=>" - "+x),
    "",
    `Skipped (${skipped.length}):`,
    ...skipped.map(x=>" - "+x),
    "",
    `Errors (${errors.length}):`,
    ...errors.map(x=>" - "+x),
    ""
  ];
  await fsp.writeFile(path.join(archiveRoot, "manifest.txt"), lines.join("\n"), "utf8");
}

async function main() {
  if (!fs.existsSync(listPath)) {
    console.error(`[archiveLegacy] List not found: ${path.relative(projectRoot, listPath)}`);
    process.exit(1);
  }
  const rels = readList(listPath);
  if (!rels.length) {
    console.log("[archiveLegacy] Nothing to do (empty list).");
    return;
  }

  const processed = [];
  const skipped = [];
  const errors = [];

  console.log(`[archiveLegacy] Mode=${mode}${dry?" (dry)":""}`);
  console.log(`[archiveLegacy] Items in list: ${rels.length}`);

  // Create archive root (so dry-run still leaves a manifest location)
  await ensureDir(archiveRoot);

  for (const rel of rels) {
    const relNorm = rel.replace(/^[.\/\\]+/, "").split(path.sep).join(path.sep);
    const abs = path.join(projectRoot, relNorm);

    try {
      if (!withinRepo(abs)) { skipped.push(`${rel} (outside repo)`); continue; }
      if (!fs.existsSync(abs)) { skipped.push(`${rel} (missing)`); continue; }
      if (PROTECT.has(relNorm) && !force) { skipped.push(`${rel} (protected; use --force)`); continue; }
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) { skipped.push(`${rel} (is directory)`); continue; }

      if (dry) {
        processed.push(`${rel} (would ${mode} to archive)`);
        continue;
      }

      if (mode === "copy") {
        await copyFilePreserve(relNorm);
      } else if (mode === "move") {
        await moveFileFS(relNorm);
      } else if (mode === "git-mv") {
        moveFileGit(relNorm);
      } else {
        throw new Error(`Unknown mode: ${mode}`);
      }

      processed.push(relNorm);
    } catch (e) {
      errors.push(`${rel}: ${e.message || e}`);
    }
  }

  // Prune empty dirs after plain FS "move"
  if (!dry && mode === "move") {
    const pruneRoots = [path.join(projectRoot,"src"), path.join(projectRoot,"tools")];
    for (const root of pruneRoots) {
      const prune = (dir) => {
        if (!fs.existsSync(dir)) return;
        const stat = fs.statSync(dir);
        if (!stat.isDirectory()) return;           // <-- FIX: only descend into directories
        const entries = fs.readdirSync(dir);
        for (const name of entries) prune(path.join(dir, name));
        // try remove if empty
        try { fs.rmdirSync(dir); } catch {}
      };
      prune(root);
    }
  }

  await writeManifest(processed, skipped, errors);

  console.log(`[archiveLegacy] Done. Processed: ${processed.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`);
  console.log(`[archiveLegacy] Archive at: ${path.relative(projectRoot, archiveRoot)}`);
  if (errors.length) process.exitCode = 2;
}

main().catch(e => { console.error("[archiveLegacy] Unexpected error:", e); process.exit(1); });
