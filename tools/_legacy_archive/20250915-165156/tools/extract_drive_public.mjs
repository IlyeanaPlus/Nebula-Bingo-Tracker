// tools/extract_drive_public.mjs
// Build a clean drive_cache.json from a PUBLIC Google Drive folder.
// Prefers the official Drive API if GOOGLE_API_KEY is set.
// Fallback: best-effort HTML scrape (public folder page).
//
// Usage:
//   node tools/extract_drive_public.mjs --folder <FOLDER_ID> --out public/drive_cache.json
//
// Env:
//   GOOGLE_API_KEY=...   (optional but strongly recommended)

import fs from "node:fs/promises";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => {
  if (a.startsWith("--")) return [a.slice(2), arr[i + 1]];
  return [];
}).filter(Boolean));

const FOLDER_ID = args.folder;
const OUT = args.out || "public/drive_cache.json";
if (!FOLDER_ID) {
  console.error("Missing --folder <FOLDER_ID>");
  process.exit(1);
}

const API_KEY = process.env.GOOGLE_API_KEY;

async function usingApi(folderId, apiKey) {
  let pageToken = "";
  const items = [];
  while (true) {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    const q = `'${folderId}' in parents and trashed=false`;
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType)");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("key", apiKey);

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Drive API error ${r.status}`);
    const j = await r.json();
    for (const f of j.files || []) {
      // Build a stable view link; Drive will serve the image.
      const url = `https://drive.google.com/uc?id=${f.id}&export=view`;
      items.push({ key: keyFromName(f.name), name: prettyName(f.name), url, id: f.id });
    }
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return items;
}

function keyFromName(name) {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  return base.toLowerCase().replace(/\s+/g, "_");
}
function prettyName(name) {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ").trim();
}

async function scrapeHtml(folderId) {
  // Best-effort HTML scrape (no API key). This is brittle but works for many public folders.
  const url = `https://drive.google.com/drive/folders/${folderId}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch error ${r.status}`);
  const html = await r.text();

  // Look for file IDs & names inside init data blobs.
  const items = [];
  const idNamePairs = new Map();

  // Regex approach: find occurrences of ["<id>","<name>",...]
  const re = /\["([a-zA-Z0-9_-]{10,})","([^"]+?)",\d+,\d+,\d+,\d+/g;
  for (const m of html.matchAll(re)) {
    const id = m[1];
    const name = m[2];
    // Filter out non-files (heuristic); keep images only by extension
    if (/\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(name)) {
      idNamePairs.set(id, name);
    }
  }
  for (const [id, name] of idNamePairs.entries()) {
    const url = `https://drive.google.com/uc?id=${id}&export=view`;
    items.push({ key: keyFromName(name), name: prettyName(name), url, id });
  }
  return items;
}

(async () => {
  let items = [];
  try {
    if (API_KEY) {
      console.log("[extract] using Drive API");
      items = await usingApi(FOLDER_ID, API_KEY);
    } else {
      console.log("[extract] no GOOGLE_API_KEY; scraping HTML");
      items = await scrapeHtml(FOLDER_ID);
    }
  } catch (e) {
    console.error("[extract] failed:", e);
    process.exit(1);
  }

  // De-duplicate by key (last wins)
  const byKey = {};
  for (const it of items) byKey[it.key] = it;
  const list = Object.keys(byKey).sort().map(k => ({
    key: k,
    name: byKey[k].name,
    src: byKey[k].url,      // normalized field name
    id: byKey[k].id || "",
  }));

  await fs.mkdir("public", { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(list, null, 2), "utf8");
  console.log(`✅ wrote ${list.length} entries → ${OUT}`);
})();
