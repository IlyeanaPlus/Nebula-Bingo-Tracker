// tools/mirror_drive_sprites.mjs
// Read drive_cache and/or sprite_index_clip.json, download images, save under /public/sprites.
// Generates public/drive_cache_local.json (same shape, with local paths).
//
// Usage examples:
//   node tools/mirror_drive_sprites.mjs --from-cache public/drive_cache.json
//   node tools/mirror_drive_sprites.mjs --from-index public/sprite_index_clip.json
//   node tools/mirror_drive_sprites.mjs --from-cache public/drive_cache.json --from-index public/sprite_index_clip.json
//
// Notes:
// - Concurrency is limited to avoid 429s; includes basic backoff.
// - Keeps original extension (png/webp/jpg) from Content-Type.

import fs from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => {
  if (a.startsWith("--")) return [a.slice(2), arr[i + 1]];
  return [];
}).filter(Boolean));

const FROM_CACHE = args["from-cache"];
const FROM_INDEX = args["from-index"];
const OUT_CACHE = args["out"] || "public/drive_cache_local.json";
const SPRITES_DIR = "public/sprites";

if (!FROM_CACHE && !FROM_INDEX) {
  console.error("Usage: --from-cache <file> and/or --from-index <file>");
  process.exit(1);
}

function normalizeCacheShape(raw) {
  // Accepts dict {key:{name,src/url}} or array [{key,name,src/url}]
  const out = new Map();
  if (Array.isArray(raw)) {
    for (const e of raw) {
      const key = String(e.key || "").trim();
      if (!key) continue;
      out.set(key, {
        key,
        name: e.name || key,
        url: e.src || e.url || e.drive_cache || "",
      });
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, v] of Object.entries(raw)) {
      out.set(String(key), {
        key: String(key),
        name: (v && v.name) || String(key),
        url: (v && (v.src || v.url || v.drive_cache)) || "",
      });
    }
  }
  return out;
}

async function readJsonIf(p) {
  if (!p) return null;
  try {
    const txt = await fs.readFile(p, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function extFromContentType(ct) {
  if (!ct) return ".png";
  ct = ct.toLowerCase();
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("jpeg")) return ".jpg";
  if (ct.includes("jpg")) return ".jpg";
  if (ct.includes("png")) return ".png";
  if (ct.includes("bmp")) return ".bmp";
  return ".png";
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadWithRetry(url, attempt = 1) {
  const r = await fetch(url, { redirect: "follow" });
  if (r.status === 429 || r.status === 503) {
    const backoff = Math.min(2000 * attempt, 15000);
    console.warn(`[mirror] ${r.status} on ${url} — retrying in ${backoff}ms`);
    await sleep(backoff);
    return downloadWithRetry(url, attempt + 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const ct = r.headers.get("content-type") || "";
  return { buf, ct };
}

async function main() {
  await fs.mkdir(SPRITES_DIR, { recursive: true });

  const cacheRaw = await readJsonIf(FROM_CACHE);
  const idxRaw = await readJsonIf(FROM_INDEX);

  const byKey = new Map();

  if (cacheRaw) {
    for (const [k, v] of normalizeCacheShape(cacheRaw)) byKey.set(k, v);
  }
  if (idxRaw && Array.isArray(idxRaw.items)) {
    // hydrate missing URLs for keys present in index meta
    for (const it of idxRaw.items) {
      const key = String(it.key || "").trim();
      if (!key) continue;
      const name = it.name || key;
      const url = it.drive_cache || it.url || "";
      if (!byKey.has(key)) byKey.set(key, { key, name, url });
      else if (url && !byKey.get(key).url) byKey.get(key).url = url;
    }
  }

  const entries = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  console.log(`[mirror] preparing to mirror ${entries.length} sprites`);

  // simple concurrency pool
  const CONC = 6;
  let i = 0;
  const results = [];
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= entries.length) break;
      const e = entries[idx];
      const url = e.url;
      if (!url) {
        results.push({ key: e.key, name: e.name, local: "", ok: false, reason: "no-url" });
        continue;
      }
      try {
        const { buf, ct } = await downloadWithRetry(url);
        const ext = extFromContentType(ct);
        const file = path.join(SPRITES_DIR, `${e.key}${ext}`);
        await fs.writeFile(file, buf);
        results.push({ key: e.key, name: e.name, local: `/sprites/${e.key}${ext}`, ok: true });
      } catch (err) {
        console.warn(`[mirror] fail ${e.key}: ${err}`);
        results.push({ key: e.key, name: e.name, local: "", ok: false, reason: String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));

  // build local cache file (array shape)
  const local = results
    .filter(r => r.ok)
    .map(r => ({ key: r.key, name: r.name, src: r.local }));

  await fs.writeFile(OUT_CACHE, JSON.stringify(local, null, 2), "utf8");
  console.log(`✅ wrote ${local.length} local entries → ${OUT_CACHE}`);
  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.log(`⚠️ ${failed.length} failed; check logs. You can re-run to retry only missing.`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
