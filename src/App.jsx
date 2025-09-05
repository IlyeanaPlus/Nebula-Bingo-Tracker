import React, { useState, useEffect } from "react";

/**
 * Bingo Extractor – single‑file client app (Drive + Cache enabled)
 *
 * Fixes & diagnostics for "TypeError: NetworkError when attempting to fetch resource":
 *  - Adds a full Diagnostics panel (checks API key validity, referrer/origin, folder listing, image download)
 *  - Better error messages with HTTP status + body text
 *  - Paged Drive listing (handles 300+ files)
 *  - Optional Shared Drives support
 *  - Timeouts + abort for fetches
 *  - Helper self‑tests (tidyName/nameFromFilename)
 *
 * Sources for reference sprites:
 *  1) Local uploads (PNG/JPG)
 *  2) Public Google Drive folder (API key + Folder ID)
 *  3) Remote URL list (one per line)
 *  4) Import/Export local cache JSON (avoid re-hashing)
 *
 * All processing is client-side. Google Drive uses the public Drive v3 API with an API key and a
 * folder shared to "Anyone with the link".
 */

// ---------- Utilities ----------
function tidyName(raw) {
  if (!raw) return "";
  let s = raw
    .replace(/\?.*$/, "")
    .replace(/[#?].*$/, "")
    .replace(/.*\//, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.(png|jpg|jpeg|webp)$/i, "")
    .trim();
  s = s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  const fixes = {
    "Mr Mime": "Mr. Mime",
    "Mime Jr": "Mime Jr.",
    "Type Null": "Type: Null",
    "Ho Oh": "Ho-Oh",
    "Porygon Z": "Porygon-Z",
    "Jangmo O": "Jangmo-o",
    "Hakamo O": "Hakamo-o",
    "Kommo O": "Kommo-o",
    "Nidoran F": "Nidoran♀",
    "Nidoran M": "Nidoran♂",
  };
  return fixes[s] || s;
}

function nameFromFilename(fileOrUrl) {
  const stem = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl.name || "";
  let m1 = stem.match(/pokemon[_-](\d+)[_-]([a-z0-9\-]+)/i);
  if (m1) return tidyName(m1[2]);
  let m2 = stem.match(/^(\d{1,4})[_-]([a-z0-9\-]+)\./i);
  if (m2) return tidyName(m2[2]);
  let m3 = stem.match(/^([a-z0-9\-]+).*\./i);
  if (m3) return tidyName(m3[1]);
  return tidyName(stem);
}

// ---------- Robust fetch helpers ----------
function withTimeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

async function getJSON(url, label, { timeoutMs = 15000 } = {}) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: t.signal });
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch {}
      throw new Error(`HTTP ${res.status} ${res.statusText} while ${label}.\nURL: ${url}\nBody: ${body?.slice(0, 500)}`);
    }
    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`Timeout while ${label}`);
    throw new Error(`Network/CORS error while ${label}: ${err.message}`);
  } finally {
    t.cancel();
  }
}

async function getBlob(url, label, { timeoutMs = 20000 } = {}) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: t.signal });
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch {}
      throw new Error(`HTTP ${res.status} ${res.statusText} while ${label}.\nURL: ${url}\nBody: ${body?.slice(0, 500)}`);
    }
    return await res.blob();
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`Timeout while ${label}`);
    throw new Error(`Network/CORS error while ${label}: ${err.message}`);
  } finally {
    t.cancel();
  }
}

// ---------- Canvas + Image helpers ----------
async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, url, originUrl: null };
}

async function loadImageFromURL(originUrl) {
  // Fetch as blob to avoid CORS-tainted canvas. Drive API supports CORS on alt=media.
  const blob = await getBlob(originUrl, "downloading image from Drive");
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, url, originUrl };
}

function ahashFromImage(img, size = 16) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true });
  c.width = size; c.height = size;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let gray = new Array(size * size), sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    gray[p] = v; sum += v;
  }
  const avg = sum / gray.length;
  return gray.map((v) => (v >= avg ? 1 : 0));
}

function hammingDistanceBits(aBits, bBits) {
  const n = Math.min(aBits.length, bBits.length);
  let d = 0; for (let i = 0; i < n; i++) if (aBits[i] !== bBits[i]) d++;
  return d + Math.max(aBits.length, bBits.length) - n;
}

function cropToCanvas(srcImg, box) {
  const { x, y, w, h } = box;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(srcImg, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

function evenGridBoxes(imgW, imgH, rows, cols, inset = 0, startX = 0, startY = 0, cellW, cellH, gapX = 0, gapY = 0) {
  const w = cellW ?? Math.floor((imgW - startX - (cols - 1) * gapX) / cols);
  const h = cellH ?? Math.floor((imgH - startY - (rows - 1) * gapY) / rows);
  const boxes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (w + gapX) + inset;
      const y = startY + r * (h + gapY) + inset;
      const bw = Math.max(1, w - 2 * inset);
      const bh = Math.max(1, h - 2 * inset);
      boxes.push({ r, c, x, y, w: bw, h: bh });
    }
  }
  return boxes;
}

// ---------- Local ref-hash cache (import/export) ----------
const CACHE_KEY = "refHashCacheV1";
function bitsToString(bits) { return bits.join(""); }
function stringToBits(s) { return s.split("").map((ch) => (ch === "1" ? 1 : 0)); }
function loadCacheLS() { try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
function saveCacheLS(cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// ---------- Google Drive (public) helpers ----------
async function listDriveImages(folderId, apiKey, { includeSharedDrives = true } = {}) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const files = [];
  let pageToken = undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false and (mimeType contains 'image/')`,
      fields: "nextPageToken, files(id,name,mimeType)",
      pageSize: "1000",
      key: apiKey,
    });
    if (includeSharedDrives) {
      params.set("supportsAllDrives", "true");
      params.set("includeItemsFromAllDrives", "true");
    }
    if (pageToken) params.set("pageToken", pageToken);
    const url = `${base}?${params.toString()}`;
    const json = await getJSON(url, "listing Drive files");
    files.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
  }));
}

// ---------- Component ----------
export default function App() {
  const [refs, setRefs] = useState([]); // {source,url,originUrl,name,hashBits}
  const [hashing, setHashing] = useState(false);
  const [threshold, setThreshold] = useState(12);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [inset, setInset] = useState(2);
  const [advanced, setAdvanced] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [cellW, setCellW] = useState(0);
  const [cellH, setCellH] = useState(0);
  const [gapX, setGapX] = useState(0);
  const [gapY, setGapY] = useState(0);

  // Sources
  const [driveFolderId, setDriveFolderId] = useState("1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB");
  const [driveApiKey, setDriveApiKey] = useState("");
  const [urlList, setUrlList] = useState("");
  const [includeSharedDrives, setIncludeSharedDrives] = useState(true);
  const [rememberKey, setRememberKey] = useState(() => !!localStorage.getItem('BE_API_KEY'));

  // Diagnostics
  const [diag, setDiag] = useState({ running: false, logs: [] });
  function logDiag(line) { setDiag((d) => ({ running: d.running, logs: d.logs.concat([`➤ ${new Date().toLocaleTimeString()} — ${line}`]) })); }

  // Cards
  const [cards, setCards] = useState([]);

  // Cache (url -> {name,bits})
  const [refCache, setRefCache] = useState(() => loadCacheLS());

  function addRef(refObj) { setRefs((prev) => [...prev, refObj]); }
  function upsertCache(key, name, bits) {
    const next = { ...refCache, [key]: { name, bits: bitsToString(bits) } };
    setRefCache(next); saveCacheLS(next);
  }
  // Load key/folder from URL or localStorage on first mount
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const k = sp.get('key');
      const f = sp.get('folder');
      if (k) setDriveApiKey(k);
      if (f) setDriveFolderId(f);
      if (!k) {
        const saved = localStorage.getItem('BE_API_KEY');
        if (saved) setDriveApiKey(saved);
      }
    } catch {}
  }, []);

  // Persist API key iff user opted in
  useEffect(() => {
    if (rememberKey && driveApiKey) localStorage.setItem('BE_API_KEY', driveApiKey);
  }, [rememberKey, driveApiKey]);

  useEffect(() => {
    if (!rememberKey) localStorage.removeItem('BE_API_KEY');
  }, [rememberKey]);

  // A) Local uploads
  async function handleRefFiles(files) {
    const arr = Array.from(files || []); if (!arr.length) return; setHashing(true);
    for (const f of arr) {
      try { const { img, url, originUrl } = await loadImageFromFile(f);
        const bits = ahashFromImage(img, 16); const name = tidyName(nameFromFilename(f));
        addRef({ source: "upload", url, originUrl, name, hashBits: bits });
        upsertCache(originUrl || url, name, bits);
      } catch (e) { console.error("hash ref error", e); }
    }
    setHashing(false);
  }

  // B) Google Drive (public)
  async function handleDriveFetch() {
    if (!driveFolderId || !driveApiKey) { alert("Enter Drive Folder ID and API Key."); return; }
    setHashing(true);
    try {
      const files = await listDriveImages(driveFolderId, driveApiKey, { includeSharedDrives });
      if (!files.length) {
        alert("Drive listing succeeded but returned 0 images. Check folder ID and sharing (Anyone with link: Viewer).");
      }
      for (const f of files) {
        const key = f.downloadUrl; const cached = refCache[key];
        if (cached) { addRef({ source: "drive", url: key, originUrl: key, name: cached.name, hashBits: stringToBits(cached.bits) }); continue; }
        try {
          const { img, url, originUrl } = await loadImageFromURL(f.downloadUrl);
          const bits = ahashFromImage(img, 16);
          const name = tidyName(f.name || nameFromFilename(f.name || f.downloadUrl));
          addRef({ source: "drive", url, originUrl, name, hashBits: bits });
          upsertCache(originUrl || url, name, bits);
        } catch (e) {
          console.warn("Drive image failed:", f.name, e);
        }
      }
    } catch (e) {
      console.error(e);
      alert(
        [
          "Drive fetch failed:",
          e.message,
          "\nCommon fixes:",
          "• Ensure the API key is valid and not expired.",
          "• If you set HTTP referrer restrictions, run this app from http://localhost or your allowed domain (not file://).",
          "• Restrict the key to the Drive API only (optional but recommended).",
          "• Share the Drive folder as ‘Anyone with the link – Viewer’.",
        ].join("\n")
      );
    }
    setHashing(false);
  }

  // C) URL list
  async function handleUrlListFetch() {
    const lines = urlList.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return; setHashing(true);
    for (const u of lines) {
      const key = u; const cached = refCache[key];
      if (cached) { addRef({ source: "url", url: key, originUrl: key, name: cached.name, hashBits: stringToBits(cached.bits) }); continue; }
      try { const { img, url, originUrl } = await loadImageFromURL(u);
        const bits = ahashFromImage(img, 16); const name = tidyName(nameFromFilename(u));
        addRef({ source: "url", url, originUrl, name, hashBits: bits });
        upsertCache(originUrl || url, name, bits);
      } catch (e) { console.warn("URL failed:", u, e); }
    }
    setHashing(false);
  }

  // Cache import/export
  function exportCacheJSON() {
    const blob = new Blob([JSON.stringify(refCache, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sprite_ref_cache.json"; a.click();
  }
  async function importCacheJSON(file) {
    if (!file) return; const text = await file.text();
    try { const parsed = JSON.parse(text); setRefCache(parsed); saveCacheLS(parsed);
      for (const [key, val] of Object.entries(parsed)) {
        if (!val || !val.bits) continue;
        addRef({ source: "cache", url: key, originUrl: key, name: val.name || nameFromFilename(key), hashBits: stringToBits(val.bits) });
      }
    } catch { alert("Invalid cache JSON"); }
  }

  // Screenshots → cards
  async function handleScreenshotFiles(files) {
    const arr = Array.from(files || []);
    for (const f of arr) {
      const { img, url } = await loadImageFromFile(f);
      const imgW = img.naturalWidth, imgH = img.naturalHeight;
      const boxes = evenGridBoxes(imgW, imgH, rows, cols, inset, startX, startY, cellW || undefined, cellH || undefined, gapX, gapY);
      const grid = [];
      for (const b of boxes) {
        const crop = cropToCanvas(img, b);
        const bits = ahashFromImage(crop, 16);
        let best = { name: "", dist: Infinity, refUrl: null };
        for (const rRef of refs) {
          const d = hammingDistanceBits(bits, rRef.hashBits);
          if (d < best.dist) best = { name: rRef.name, dist: d, refUrl: rRef.url };
        }
        const ok = best.dist <= threshold;
        grid.push({ name: ok ? best.name : "", dist: best.dist, refUrl: ok ? best.refUrl : null, checked: false });
      }
      const title = f.name.replace(/\.[^.]+$/, "");
      setCards((prev) => [...prev, { id: crypto.randomUUID(), title, img, url, rows, cols, grid }]);
    }
  }

  function recomputeThreshold(cardIdx, newThresh) {
    setCards((prev) => {
      const next = [...prev]; const card = next[cardIdx]; if (!card) return prev;
      card.grid = card.grid.map((cell) => ({ ...cell, name: cell.dist <= newThresh ? (cell.name || "") : "", refUrl: cell.dist <= newThresh ? cell.refUrl : null }));
      return next;
    });
  }

  function copyTSV(card) {
    const lines = [];
    for (let r = 0; r < card.rows; r++) {
      const row = [];
      for (let c = 0; c < card.cols; c++) row.push(card.grid[r * card.cols + c].name || "");
      lines.push(row.join("\t"));
    }
    navigator.clipboard.writeText(lines.join("\n"));
    alert("Copied TSV to clipboard.");
  }

  function downloadCSV(card) {
    const lines = [];
    for (let r = 0; r < card.rows; r++) {
      const row = [];
      for (let c = 0; c < card.cols; c++) {
        const v = (card.grid[r * card.cols + c].name || "").replace(/"/g, '""');
        row.push(`"${v}"`);
      }
      lines.push(row.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${card.title || "card"}.csv`; a.click();
  }

  function resetCard(cardId, mode = "checks") {
    setCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      if (mode === "checks") return { ...c, grid: c.grid.map((cell) => ({ ...cell, checked: false })) };
      if (mode === "all") return { ...c, grid: c.grid.map((cell) => ({ name: "", dist: cell.dist, refUrl: null, checked: false })) };
      return c;
    }));
  }

  function updateCellName(cardId, idx, value) {
    setCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c; const grid = [...c.grid]; grid[idx] = { ...grid[idx], name: value }; return { ...c, grid };
    }));
  }

  function toggleCheck(cardId, idx) {
    setCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c; const grid = [...c.grid]; grid[idx] = { ...grid[idx], checked: !grid[idx].checked }; return { ...c, grid };
    }));
  }

  // ---------- Diagnostics ----------
  async function runDiagnostics() {
    setDiag({ running: true, logs: [] });
    try {
      logDiag(`Origin: ${window.location.origin}`);
      if (window.location.protocol === "file:") {
        logDiag("Warning: Running from file:// — HTTP referrer restrictions will block API key. Use http://localhost instead.");
      }
      if (!driveApiKey) {
        logDiag("No API key set. Set a key with Drive API enabled (and ideally restrict to your domain).");
        return;
      }
      // 1) Key sanity via Drive discovery doc
      const discUrl = `https://www.googleapis.com/discovery/v1/apis/drive/v3/rest?key=${encodeURIComponent(driveApiKey)}`;
      await getJSON(discUrl, "validating API key (discovery)");
      logDiag("API key looks valid (discovery OK).");

      // 2) Listing URL preview (1 page)
      const base = "https://www.googleapis.com/drive/v3/files";
      const p = new URLSearchParams({
        q: `'${driveFolderId}' in parents and trashed=false and (mimeType contains 'image/')`,
        fields: "nextPageToken, files(id,name,mimeType)",
        supportsAllDrives: includeSharedDrives ? "true" : "false",
        includeItemsFromAllDrives: includeSharedDrives ? "true" : "false",
        pageSize: "5",
        key: driveApiKey,
      });
      const listUrl = `${base}?${p.toString()}`;
      logDiag(`Listing test URL: ${listUrl}`);
      const listJson = await getJSON(listUrl, "listing test files");
      const count = (listJson.files || []).length;
      logDiag(`List success. Returned ${count} file(s).`);
      if (!count) {
        logDiag("Returned 0 files. The folder ID may be wrong or not shared publicly (Anyone with link: Viewer).");
        return;
      }
      // 3) Try downloading first file as blob
      const first = listJson.files[0];
      const dl = `https://www.googleapis.com/drive/v3/files/${first.id}?alt=media&key=${encodeURIComponent(driveApiKey)}`;
      logDiag(`Download test URL: ${dl}`);
      await getBlob(dl, "downloading first image test");
      logDiag("Download test OK. CORS/network looks good. You should be able to Fetch & Index now.");
    } catch (e) {
      logDiag(`❌ Diagnostic error: ${e.message}`);
      logDiag("Tips: If you restricted the API key by HTTP referrers, make sure this app's origin (e.g., http://localhost) is allowed. Also confirm the Drive folder sharing is public.");
    } finally {
      setDiag((d) => ({ running: false, logs: d.logs }));
    }
  }

  function runHelperTests() {
    const cases = [
      { in: "001-bulbasaur.png", expect: "Bulbasaur" },
      { in: "pokemon_122_mr-mime.png", expect: "Mr. Mime" },
      { in: "mime_jr.jpg", expect: "Mime Jr." },
      { in: "type_null.webp", expect: "Type: Null" },
      { in: "porygon-z.png", expect: "Porygon-Z" },
      { in: "jangmo-o.png", expect: "Jangmo-o" },
      { in: "nidoran-f.png", expect: "Nidoran♀" },
      { in: "pokemon_025_pikachu.png", expect: "Pikachu" },
    ];
    const results = cases.map((c) => ({ ...c, actual: tidyName(nameFromFilename(c.in)) }));
    const lines = results.map((r) => `${r.in} → ${r.actual} ${r.actual === r.expect ? "✅" : `❌ (expected ${r.expect})`}`);
    alert(["Helper tests:", ...lines].join("\n"));
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-semibold">Bingo Extractor</div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <a className="underline" href="#controls">Controls</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Reference sprites */}
        <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">1) Reference sprites</h2>
          <p className="text-sm text-slate-600 mb-3">Choose: Upload, Google Drive (public), URL list, or import a saved cache JSON. Hashes are cached locally so the next load is instant.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* A) Local uploads */}
            <div>
              <h3 className="font-medium mb-1">A) Upload images</h3>
              <div className="flex items-center gap-3 flex-wrap">
                <input type="file" multiple accept="image/*" onChange={(e) => handleRefFiles(e.target.files)} />
                {hashing ? (
                  <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">Hashing…</span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">Indexed: {refs.length}</span>
                )}
                <button className="text-xs px-2 py-1 rounded border" onClick={exportCacheJSON}>Export cache JSON</button>
                <label className="text-xs px-2 py-1 rounded border cursor-pointer">
                  Import cache JSON
                  <input type="file" accept="application/json" className="hidden" onChange={(e)=>importCacheJSON(e.target.files?.[0])} />
                </label>
              </div>
            </div>

            {/* B) Google Drive (public) */}
            <div>
              <h3 className="font-medium mb-1">B) Google Drive (public)</h3>
              <p className="text-xs text-slate-600 mb-2">Needs a Drive API key and a folder shared as “Anyone with link: Viewer”.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input className="border rounded px-2 py-1 text-sm" placeholder="Drive Folder ID" value={driveFolderId} onChange={(e)=>setDriveFolderId(e.target.value)} />
                <input className="border rounded px-2 py-1 text-sm" placeholder="Google API Key" value={driveApiKey} onChange={(e)=>setDriveApiKey(e.target.value)} />
                <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={handleDriveFetch}>Fetch & Index</button>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={includeSharedDrives} onChange={(e)=>setIncludeSharedDrives(e.target.checked)} /> include Shared Drives
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={rememberKey} onChange={(e)=>setRememberKey(e.target.checked)} /> remember API key (this browser)
                </label>
                <span className="opacity-70">Max page size = 1000; paging handled automatically.</span>
              </div>
            </div>

            {/* C) Remote URL list */}
            <div className="lg:col-span-2">
              <h3 className="font-medium mb-1">C) Remote URL list</h3>
              <textarea className="w-full border rounded p-2 text-sm min-h-[90px]" placeholder="One image URL per line…" value={urlList} onChange={(e)=>setUrlList(e.target.value)} />
              <div className="mt-2"><button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={handleUrlListFetch}>Fetch & Index</button></div>
            </div>
          </div>

          {refs.length > 0 && (
            <div className="mt-4">
              <div className="text-sm text-slate-600 mb-2">Preview (first 24 of {refs.length} refs)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-48 overflow-y-auto">
                {refs.slice(0, 24).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 border rounded-lg">
                    <img src={r.url} alt={r.name} className="w-10 h-10 object-contain" />
                    <div className="text-xs truncate" title={r.name}>{r.name}</div>
                  </div>
                ))}
                {refs.length > 24 && <div className="text-xs text-slate-500">+{refs.length - 24} more…</div>}
              </div>
            </div>
          )}
        </section>

        {/* Controls */}
        <section id="controls" className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">2) Controls</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-600">Rows</label>
              <input className="w-full border rounded px-2 py-1" type="number" value={rows} min={1} onChange={(e)=>setRows(parseInt(e.target.value||"1"))} />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Cols</label>
              <input className="w-full border rounded px-2 py-1" type="number" value={cols} min={1} onChange={(e)=>setCols(parseInt(e.target.value||"1"))} />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Inset (px)</label>
              <input className="w-full border rounded px-2 py-1" type="number" value={inset} min={0} onChange={(e)=>setInset(parseInt(e.target.value||"0"))} />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Threshold (Hamming)</label>
              <input className="w-full" type="range" min={4} max={24} value={threshold} onChange={(e)=>{const v=parseInt(e.target.value); setThreshold(v); cards.forEach((_,i)=>recomputeThreshold(i,v));}} />
              <div className="text-xs text-slate-600">{threshold}</div>
            </div>
          </div>
          <button className="mt-3 text-sm underline" onClick={()=>setAdvanced(v=>!v)}>{advanced?"Hide":"Show"} advanced geometry</button>
          {advanced && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-slate-600">startX</label>
                <input className="w-full border rounded px-2 py-1" type="number" value={startX} onChange={(e)=>setStartX(parseInt(e.target.value||"0"))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600">startY</label>
                <input className="w-full border rounded px-2 py-1" type="number" value={startY} onChange={(e)=>setStartY(parseInt(e.target.value||"0"))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600">cellW</label>
                <input className="w-full border rounded px-2 py-1" type="number" value={cellW} onChange={(e)=>setCellW(parseInt(e.target.value||"0"))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600">cellH</label>
                <input className="w-full border rounded px-2 py-1" type="number" value={cellH} onChange={(e)=>setCellH(parseInt(e.target.value||"0"))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600">gapX</label>
                <input className="w-full border rounded px-2 py-1" type="number" value={gapX} onChange={(e)=>setGapX(parseInt(e.target.value||"0"))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600">gapY</label>
                <input className="w-full border rounded px-2 py-1" type="number" value={gapY} onChange={(e)=>setGapY(parseInt(e.target.value||"0"))} />
              </div>
            </div>
          )}
        </section>

        {/* Diagnostics */}
        <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">3) Diagnostics</h2>
          <p className="text-sm text-slate-600 mb-3">If Drive fetch fails, run this. It checks your API key, lists a few files, and tries to download one image with detailed errors.</p>
          <div className="flex items-center gap-2 mb-2">
            <button disabled={diag.running} className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50" onClick={runDiagnostics}>{diag.running ? "Running…" : "Run diagnostics"}</button>
            <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={runHelperTests}>Run helper tests</button>
            <span className="text-xs text-slate-500">Tip: if your API key has HTTP referrer restrictions, run this app from http://localhost or an allowed domain (not file://).</span>
          </div>
          <pre className="text-xs bg-slate-50 border rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap">{diag.logs.join("\n") || "(No logs yet)"}</pre>
        </section>

        {/* Hosting / Deployment */}
        <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">4) Hosting / Deployment</h2>
          <p className="text-sm text-slate-600 mb-3">You can host this on GitHub Pages, Netlify, or Vercel. If your API key is referrer‑restricted, add the live origin(s) below.</p>
          <HostHelper />
        </section>

        {/* Screenshots */}
        <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">5) Screenshots</h2>
          <p className="text-sm text-slate-600 mb-3">Add one or more screenshots. Each becomes a card below.</p>
          <input type="file" multiple accept="image/*" onChange={(e)=>handleScreenshotFiles(e.target.files)} />
        </section>

        {/* Cards */}
        <section className="space-y-6">
          {cards.map((card, idx) => (
            <div key={card.id} className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="text-base font-semibold">Card: {card.title}</div>
                <div className="ml-auto flex gap-2">
                  <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={()=>copyTSV(card)}>Copy TSV</button>
                  <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={()=>downloadCSV(card)}>Download CSV</button>
                  <button className="px-3 py-1 rounded bg-amber-100 hover:bg-amber-200" onClick={()=>resetCard(card.id, "checks")}>Reset checks</button>
                  <button className="px-3 py-1 rounded bg-rose-100 hover:bg-rose-200" onClick={()=>resetCard(card.id, "all")}>Clear names</button>
                </div>
              </div>

              <div className="grid" style={{ gridTemplateColumns: `repeat(${card.cols}, minmax(0, 1fr))`, gap: "8px" }}>
                {card.grid.map((cell, i) => {
                  const r = Math.floor(i / card.cols) + 1; const c = (i % card.cols) + 1;
                  return (
                    <div key={i} className={`p-2 rounded-2xl border ${cell.checked ? "bg-green-200 border-green-300" : "bg-white border-slate-200"}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-12 shrink-0 border rounded-lg bg-white flex items-center justify-center overflow-hidden">
                          {cell.refUrl ? (<img src={cell.refUrl} className="max-w-full max-h-full object-contain"/>) : (<span className="text-[10px] text-slate-400">no match</span>)}
                        </div>
                        <div className="flex-1">
                          <input className="w-full text-sm border rounded px-2 py-1" value={cell.name} placeholder="(name)" onChange={(e)=>updateCellName(card.id, i, e.target.value)} />
                          <div className="text-[10px] text-slate-500">r{r}c{c} · dist {Number.isFinite(cell.dist) ? cell.dist : "-"}</div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={cell.checked} onChange={()=>toggleCheck(card.id, i)} />
                          <span>done</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {cards.length === 0 && (<div className="text-sm text-slate-500">No cards yet. Upload a screenshot to create one.</div>)}
        </section>
      </main>
    </div>
  );
}

// ---------- Hosting helper component ----------
function HostHelper() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = typeof window !== 'undefined' ? window.location.pathname.replace(/\/index\.html$/, '') : '';
  const baseSeg = (() => {
    const parts = path.split('/').filter(Boolean);
    return parts.length ? '/' + parts[0] : '';
    })();
  const suggestions = Array.from(new Set([
    origin ? `${origin}/*` : '',
    origin && baseSeg ? `${origin}${baseSeg}/*` : '',
  ].filter(Boolean)));

  function copyText(t) { navigator.clipboard.writeText(t); }

  return (
    <div className="text-sm">
      <div className="mb-2"><span className="text-slate-500">Current origin:</span> <code className="px-1 py-0.5 bg-slate-100 rounded">{origin || '(unknown)'}</code></div>
      <div className="mb-2 text-slate-500">Add these to your API key's <em>Website restrictions</em> (HTTP referrers):</div>
      <ul className="mb-3 list-disc pl-5">
        {suggestions.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <code className="px-1 py-0.5 bg-slate-100 rounded break-all">{s}</code>
            <button className="px-2 py-0.5 border rounded" onClick={() => copyText(s)}>Copy</button>
          </li>
        ))}
      </ul>
      <div className="text-xs text-slate-500">For GitHub project pages your site is <code>https://USERNAME.github.io/REPO/</code>. Include both <code>https://USERNAME.github.io/*</code> and <code>https://USERNAME.github.io/REPO/*</code> to be safe.</div>
    </div>
  );
}

/*
============================================================
📦 DEPLOYMENT FILES (GitHub Pages via Actions)
Copy these into your repo as-shown. They are tailored to:
REPO: IlyeanaPlus/Nebula-Bingo-Tracker
SITE: https://ilyeanaplus.github.io/Nebula-Bingo-Tracker/
============================================================

1) vite.config.js  (create at repo root)
------------------------------------------------------------
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: base must match your repo name for GitHub Pages
  base: '/Nebula-Bingo-Tracker/',
})


2) .github/workflows/pages.yml  (create folders if needed)
------------------------------------------------------------
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm install
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4


3) index.html – add Tailwind CDN in <head>
------------------------------------------------------------
<!-- Paste this inside <head> in your Vite index.html -->
<script src="https://cdn.tailwindcss.com"></script>


4) Optional: README-DEPLOY.md  (create at root)
------------------------------------------------------------
# Deploying Bingo Extractor to GitHub Pages

## First-time
1. Scaffold app (once):
   ```bash
   npm create vite@latest . -- --template react
   npm install
   ```
2. Replace `src/App.jsx` with the code from the canvas (this file).
3. Create `vite.config.js` and `.github/workflows/pages.yml` exactly as above.
4. Edit `index.html` and add Tailwind CDN to `<head>` as above.
5. Commit & push:
   ```bash
   git add .
   git commit -m "vite scaffold + pages workflow"
   git push -u origin main
   ```
6. In GitHub → **Settings → Pages → Build and deployment** set **Source = GitHub Actions**.
7. Visit: https://ilyeanaplus.github.io/Nebula-Bingo-Tracker/

## After deploy
- In the app, paste your Google **API key** and tick **remember API key** if desired.
- If you restrict the key by **HTTP referrers**, add:
  - `https://ilyeanaplus.github.io/*`
  - `https://ilyeanaplus.github.io/Nebula-Bingo-Tracker/*`
- If fetching fails, open **Diagnostics** in the app for precise errors.

## Shareable link with prefilled params
```
https://ilyeanaplus.github.io/Nebula-Bingo-Tracker/?key=YOUR_API_KEY&folder=1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB
```

============================================================
*/

