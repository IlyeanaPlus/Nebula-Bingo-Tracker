import React, { useEffect, useMemo, useState } from "react";

/**
 * Bingo Extractor – Drive + Cache only (progress + build-card)
 * - Google Drive public folder + API key
 * - Loads remote cache: sprite_ref_cache.json (if present)
 * - Import/Export local cache JSON
 * - Exclude shiny variants
 * - Progress bar for indexing
 * - Screenshots queue with “Build card” / “Build all”
 */

/* --------------------- tiny utils --------------------- */
const CACHE_KEY = "refHashCacheV2";
const now = () => performance.now();

function bitsToString(bits) { return bits.join(""); }
function stringToBits(s) { return s.split("").map(ch => (ch === "1" ? 1 : 0)); }
function loadCacheLS() { try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
function saveCacheLS(cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {} }

function tidyName(raw) {
  if (!raw) return "";
  let s = raw
    .replace(/\?.*$/, "")
    .replace(/[#?].*$/, "")
    .replace(/.*\//, "")
    .replace(/\.(png|jpg|jpeg|webp)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.split(" ").map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
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
function nameFromFilename(stemOrUrl) {
  const stem = String(stemOrUrl);
  let m1 = stem.match(/pokemon[_-](\d+)[_-]([a-z0-9\-]+)/i);
  if (m1) return tidyName(m1[2]);
  let m2 = stem.match(/(^|\/)(\d{1,4})[_-]([a-z0-9\-]+)\./i);
  if (m2) return tidyName(m2[3]);
  let m3 = stem.match(/([a-z0-9\-]+)\.(png|jpg|jpeg|webp)/i);
  if (m3) return tidyName(m3[1]);
  return tidyName(stem);
}
function isShinyName(stem) {
  if (!stem) return false;
  const s = String(stem).toLowerCase();
  return /\bshiny\b/.test(s);
}

/* --------------------- fetch helpers --------------------- */
function withTimeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}
async function getJSON(url, label, timeoutMs = 20000) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: t.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} while ${label}`);
    return await res.json();
  } finally { t.cancel(); }
}
async function getBlob(url, label, timeoutMs = 30000) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: t.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} while ${label}`);
    return await res.blob();
  } finally { t.cancel(); }
}

/* --------------------- image hashing --------------------- */
function ahashFromImage(img, size = 16) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true });
  c.width = size; c.height = size;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const bits = [];
  const gray = [];
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
    gray[p] = v; sum += v;
  }
  const avg = sum / gray.length;
  for (let i = 0; i < gray.length; i++) bits.push(gray[i] >= avg ? 1 : 0);
  return bits;
}
function hammingDistanceBits(a, b) {
  const n = Math.min(a.length, b.length);
  let d = 0; for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d + Math.max(a.length, b.length) - n;
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
function evenGridBoxes(imgW, imgH, rows, cols, inset=0, startX=0, startY=0, cellW, cellH, gapX=0, gapY=0) {
  const w = cellW ?? Math.floor((imgW - startX - (cols - 1) * gapX) / cols);
  const h = cellH ?? Math.floor((imgH - startY - (rows - 1) * gapY) / rows);
  const boxes = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = startX + c*(w+gapX) + inset;
    const y = startY + r*(h+gapY) + inset;
    boxes.push({ r, c, x, y, w: Math.max(1,w-2*inset), h: Math.max(1,h-2*inset) });
  }
  return boxes;
}
async function loadImageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, url };
}
async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, url };
}

/* --------------------- Drive helpers --------------------- */
async function listDriveImagesTop(folderId, apiKey, { includeSharedDrives=true, excludeShiny=false } = {}) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const files = [];
  let pageToken;
  do {
    let q = `'${folderId}' in parents and trashed=false and (mimeType contains 'image/')`;
    if (excludeShiny) q += " and not (name contains 'shiny' or name contains 'Shiny' or name contains 'SHINY')";
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id,name,mimeType,thumbnailLink)",
      pageSize: "1000",
      key: apiKey,
    });
    if (includeSharedDrives) {
      params.set("supportsAllDrives", "true");
      params.set("includeItemsFromAllDrives", "true");
    }
    if (pageToken) params.set("pageToken", pageToken);
    const json = await getJSON(`${base}?${params.toString()}`, "listing Drive");
    files.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  const filtered = excludeShiny ? files.filter(f => !isShinyName(f.name)) : files;
  return filtered.map(f => ({
    id: f.id,
    name: f.name,
    downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
    thumbUrl: f.thumbnailLink ? `${f.thumbnailLink}&key=${apiKey}` : null,
  }));
}
async function findDriveCacheJSON(folderId, apiKey, { includeSharedDrives=true } = {}) {
  const base = "https://www.googleapis.com/drive/v3/files";
  let q = `'${folderId}' in parents and trashed=false and name='sprite_ref_cache.json' and mimeType='application/json'`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name)",
    pageSize: "1",
    key: apiKey,
  });
  if (includeSharedDrives) {
    params.set("supportsAllDrives", "true");
    params.set("includeItemsFromAllDrives", "true");
  }
  const json = await getJSON(`${base}?${params.toString()}`, "looking for cache json");
  if (!json.files || !json.files.length) return null;
  const id = json.files[0].id;
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${apiKey}`;
  return url;
}

/* --------------------- App --------------------- */
export default function App() {
  // geometry & matching
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [inset, setInset] = useState(2);
  const [threshold, setThreshold] = useState(12);
  const [adv, setAdv] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [cellW, setCellW] = useState(0);
  const [cellH, setCellH] = useState(0);
  const [gapX, setGapX] = useState(0);
  const [gapY, setGapY] = useState(0);

  // drive controls
  const [driveFolderId, setDriveFolderId] = useState("1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB");
  const [driveApiKey, setDriveApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(() => !!localStorage.getItem("BE_API_KEY"));
  const [includeShared, setIncludeShared] = useState(true);
  const [excludeShiny, setExcludeShiny] = useState(true);

  // refs & cache
  const [refs, setRefs] = useState([]); // {name, url, hashBits}
  const [refCache, setRefCache] = useState(() => loadCacheLS()); // url -> {name,bits}
  function upsertCache(key, name, bits) {
    const next = { ...refCache, [key]: { name, bits: bitsToString(bits) } };
    setRefCache(next); saveCacheLS(next);
  }

  // indexing progress
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexed, setIndexed] = useState(0);
  const [toIndex, setToIndex] = useState(0);
  const [eta, setEta] = useState(0);
  const progress = useMemo(() => toIndex ? Math.round((indexed / toIndex) * 100) : 0, [indexed, toIndex]);

  // screenshots queue & cards
  const [queue, setQueue] = useState([]); // [{id,title,img,url}]
  const [cards, setCards] = useState([]);

  /* ----- init: URL params + remembered key ----- */
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const k = sp.get("key"); const f = sp.get("folder");
      if (k) setDriveApiKey(k);
      if (f) setDriveFolderId(f);
      if (!k) {
        const saved = localStorage.getItem("BE_API_KEY");
        if (saved) setDriveApiKey(saved);
      }
    } catch {}
  }, []);
  useEffect(() => { if (rememberKey && driveApiKey) localStorage.setItem("BE_API_KEY", driveApiKey); }, [rememberKey, driveApiKey]);
  useEffect(() => { if (!rememberKey) localStorage.removeItem("BE_API_KEY"); }, [rememberKey]);

  /* ----- export/import local cache ----- */
  function exportCacheJSON() {
    const blob = new Blob([JSON.stringify(refCache, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sprite_ref_cache.json"; a.click();
  }
  async function importCacheJSON(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setRefCache(parsed); saveCacheLS(parsed);
      // hydrate refs from imported cache (lazy: names from cache or filename)
      const hydrated = Object.entries(parsed).map(([key, val]) => ({
        name: val.name || tidyName(nameFromFilename(key)),
        url: key,
        hashBits: stringToBits(val.bits),
      }));
      setRefs(prev => [...prev, ...hydrated]);
    } catch { alert("Invalid cache JSON"); }
  }

  /* ----- Fetch & Index from Drive (top-level only) ----- */
  async function fetchAndIndex() {
    if (!driveFolderId || !driveApiKey) { alert("Enter Drive Folder ID and API Key."); return; }
    setIsIndexing(true); setIndexed(0); setToIndex(0); setEta(0);
    const t0 = now();
    try {
      // 1) Try to load remote cache JSON if present
      const remoteCacheUrl = await findDriveCacheJSON(driveFolderId, driveApiKey, { includeSharedDrives: includeShared });
      if (remoteCacheUrl) {
        try {
          const blob = await getBlob(remoteCacheUrl, "downloading sprite_ref_cache.json");
          const text = await blob.text();
          const parsed = JSON.parse(text);
          setRefCache(parsed); saveCacheLS(parsed);
          // prehydrate refs from this remote cache
          for (const [key, val] of Object.entries(parsed)) {
            if (!val || !val.bits) continue;
            setRefs(prev => [...prev, { name: val.name || tidyName(nameFromFilename(key)), url: key, hashBits: stringToBits(val.bits) }]);
          }
        } catch (e) {
          console.warn("Remote cache present but failed to parse → continuing without it.", e);
        }
      }

      // 2) List images (top-level)
      const files = await listDriveImagesTop(driveFolderId, driveApiKey, { includeSharedDrives: includeShared, excludeShiny });
      setToIndex(files.length);

      // 3) Iterate with thumbnail-first hashing (fallback to full)
      let done = 0;
      for (const f of files) {
        const key = f.downloadUrl;
        // skip if already present in refs (cache or earlier run)
        if (refCache[key]?.bits) {
          setRefs(prev => [...prev, { name: refCache[key].name || tidyName(f.name), url: key, hashBits: stringToBits(refCache[key].bits) }]);
          done++; setIndexed(done); setEta(Math.max(0, Math.round((now() - t0) / 1000 * (files.length - done) / Math.max(1, done))));
          continue;
        }
        try {
          let imgObj;
          if (f.thumbUrl) {
            // try hashing thumbnail first (fast)
            try {
              const tb = await getBlob(f.thumbUrl, `downloading thumbnail ${f.name}`, 15000);
              imgObj = await loadImageFromBlob(tb);
            } catch {
              const fb = await getBlob(key, `downloading image ${f.name}`, 30000);
              imgObj = await loadImageFromBlob(fb);
            }
          } else {
            const fb = await getBlob(key, `downloading image ${f.name}`, 30000);
            imgObj = await loadImageFromBlob(fb);
          }
          const bits = ahashFromImage(imgObj.img, 16);
          const name = tidyName(f.name || nameFromFilename(key));
          setRefs(prev => [...prev, { name, url: key, hashBits: bits }]);
          upsertCache(key, name, bits);
        } catch (e) {
          console.warn("Indexing failed for", f.name, e);
        } finally {
          done++; setIndexed(done);
          const secs = (now() - t0) / 1000;
          setEta(Math.max(0, Math.round(secs * (files.length - done) / Math.max(1, done))));
        }
      }
    } catch (e) {
      alert(`Drive fetch failed: ${e.message}\n\nTips:\n• Ensure API key is valid.\n• Folder must be shared publicly (Anyone with link – Viewer).\n• If your key uses HTTP referrers, run from an allowed origin (GitHub Pages / localhost).`);
    } finally {
      setIsIndexing(false);
    }
  }

  /* ----- Screenshots queue & card building ----- */
  async function onScreenshots(filesList) {
    const arr = Array.from(filesList || []);
    const items = [];
    for (const f of arr) {
      const { img, url } = await loadImageFromFile(f);
      items.push({ id: crypto.randomUUID(), title: f.name.replace(/\.[^.]+$/, ""), img, url });
    }
    setQueue(prev => [...prev, ...items]);
  }

  function buildCard(item) {
    const img = item.img;
    const boxes = evenGridBoxes(
      img.naturalWidth, img.naturalHeight,
      rows, cols, inset, startX, startY,
      cellW || undefined, cellH || undefined, gapX, gapY
    );
    const grid = [];
    for (const b of boxes) {
      const crop = cropToCanvas(img, b);
      const bits = ahashFromImage(crop, 16);
      let best = { name: "", dist: Infinity, refUrl: null };
      for (const r of refs) {
        const d = hammingDistanceBits(bits, r.hashBits);
        if (d < best.dist) best = { name: r.name, dist: d, refUrl: r.url };
      }
      const ok = best.dist <= threshold;
      grid.push({ name: ok ? best.name : "", dist: best.dist, refUrl: ok ? best.refUrl : null, checked: false });
    }
    setCards(prev => [...prev, { id: crypto.randomUUID(), title: item.title, img, url: item.url, rows, cols, grid }]);
    setQueue(prev => prev.filter(q => q.id !== item.id));
  }
  function buildAll() { queue.forEach(buildCard); }

  /* ----- helpers for export ----- */
  function copyTSV(card) {
    const lines = [];
    for (let r = 0; r < card.rows; r++) {
      const row = [];
      for (let c = 0; c < card.cols; c++) row.push(card.grid[r*card.cols + c].name || "");
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
        const v = (card.grid[r*card.cols + c].name || "").replace(/"/g, '""');
        row.push(`"${v}"`);
      }
      lines.push(row.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${card.title || "card"}.csv`; a.click();
  }
  function resetCard(cardId, mode="checks") {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      if (mode === "checks") return { ...c, grid: c.grid.map(cell => ({ ...cell, checked:false })) };
      if (mode === "all")   return { ...c, grid: c.grid.map(cell => ({ name:"", dist:cell.dist, refUrl:null, checked:false })) };
      return c;
    }));
  }
  function updateCellName(cardId, idx, value) {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const grid = [...c.grid]; grid[idx] = { ...grid[idx], name:value }; return { ...c, grid };
    }));
  }
  function toggleCheck(cardId, idx) {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const grid = [...c.grid]; grid[idx] = { ...grid[idx], checked:!grid[idx].checked }; return { ...c, grid };
    }));
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <div className="text-xl font-semibold">Bingo Extractor</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* 1) Reference sprites — Drive + Cache only */}
        <section className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">1) Reference sprites</h2>
          <p className="text-sm text-slate-600 mb-3">Source: <b>Google Drive (top-level only)</b>. Hashes are cached locally (Export/Import below). If a <code>sprite_ref_cache.json</code> exists in the folder, it will be loaded first.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className="border rounded px-2 py-1 text-sm" placeholder="Drive Folder ID" value={driveFolderId} onChange={(e)=>setDriveFolderId(e.target.value)} />
            <input className="border rounded px-2 py-1 text-sm" placeholder="Google API Key" value={driveApiKey} onChange={(e)=>setDriveApiKey(e.target.value)} />
            <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={fetchAndIndex} disabled={isIndexing}>
              {isIndexing ? "Indexing…" : "Fetch & Index"}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={includeShared} onChange={(e)=>setIncludeShared(e.target.checked)} /> include Shared Drives
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={excludeShiny} onChange={(e)=>setExcludeShiny(e.target.checked)} /> exclude shiny variants
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={rememberKey} onChange={(e)=>setRememberKey(e.target.checked)} /> remember API key (this browser)
            </label>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button className="text-xs px-2 py-1 rounded border" onClick={exportCacheJSON}>Export cache JSON</button>
            <label className="text-xs px-2 py-1 rounded border cursor-pointer">
              Import cache JSON
              <input type="file" accept="application/json" className="hidden" onChange={(e)=>importCacheJSON(e.target.files?.[0])}/>
            </label>
          </div>

          {isIndexing && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <div>Indexed {indexed} / {toIndex}</div>
                <div>{progress}% {eta ? `· ~${eta}s left` : ""}</div>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded">
                <div className="h-2 bg-emerald-500 rounded" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {refs.length > 0 && (
            <div className="mt-4">
              <div className="text-sm text-slate-600 mb-2">Preview (first 24 of {refs.length})</div>
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

        {/* 2) Controls */}
        <section className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">2) Controls</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><label className="block text-xs text-slate-600">Rows</label>
              <input className="w-full border rounded px-2 py-1" type="number" value={rows} min={1} onChange={(e)=>setRows(parseInt(e.target.value||"1"))} />
            </div>
            <div><label className="block text-xs text-slate-600">Cols</label>
              <input className="w-full border rounded px-2 py-1" type="number" value={cols} min={1} onChange={(e)=>setCols(parseInt(e.target.value||"1"))} />
            </div>
            <div><label className="block text-xs text-slate-600">Inset (px)</label>
              <input className="w-full border rounded px-2 py-1" type="number" value={inset} min={0} onChange={(e)=>setInset(parseInt(e.target.value||"0"))} />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Threshold (Hamming)</label>
              <input className="w-full" type="range" min={4} max={24} value={threshold} onChange={(e)=>setThreshold(parseInt(e.target.value))} />
              <div className="text-xs text-slate-600">{threshold}</div>
            </div>
          </div>
          <button className="mt-3 text-sm underline" onClick={()=>setAdv(v=>!v)}>{adv ? "Hide" : "Show"} advanced geometry</button>
          {adv && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-3">
              <div><label className="block text-xs text-slate-600">startX</label><input className="w-full border rounded px-2 py-1" type="number" value={startX} onChange={(e)=>setStartX(parseInt(e.target.value||"0"))} /></div>
              <div><label className="block text-xs text-slate-600">startY</label><input className="w-full border rounded px-2 py-1" type="number" value={startY} onChange={(e)=>setStartY(parseInt(e.target.value||"0"))} /></div>
              <div><label className="block text-xs text-slate-600">cellW</label><input className="w-full border rounded px-2 py-1" type="number" value={cellW} onChange={(e)=>setCellW(parseInt(e.target.value||"0"))} /></div>
              <div><label className="block text-xs text-slate-600">cellH</label><input className="w-full border rounded px-2 py-1" type="number" value={cellH} onChange={(e)=>setCellH(parseInt(e.target.value||"0"))} /></div>
              <div><label className="block text-xs text-slate-600">gapX</label><input className="w-full border rounded px-2 py-1" type="number" value={gapX} onChange={(e)=>setGapX(parseInt(e.target.value||"0"))} /></div>
              <div><label className="block text-xs text-slate-600">gapY</label><input className="w-full border rounded px-2 py-1" type="number" value={gapY} onChange={(e)=>setGapY(parseInt(e.target.value||"0"))} /></div>
            </div>
          )}
        </section>

        {/* 3) Screenshots queue */}
        <section className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">3) Screenshots</h2>
          <p className="text-sm text-slate-600 mb-3">Add one or more screenshots. Each will appear in the queue below. Click “Build card” to process.</p>
          <input type="file" multiple accept="image/*" onChange={(e)=>onScreenshots(e.target.files)} />
          {queue.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-slate-600">{queue.length} in queue</div>
                <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={buildAll}>Build all</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {queue.map(item => (
                  <div key={item.id} className="p-2 border rounded-lg bg-white">
                    <div className="h-24 flex items-center justify-center overflow-hidden border rounded">
                      <img src={item.url} alt={item.title} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="mt-1 text-xs truncate" title={item.title}>{item.title}</div>
                    <button className="mt-2 w-full px-2 py-1 text-sm rounded bg-emerald-100 hover:bg-emerald-200" onClick={()=>buildCard(item)}>Build card</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 4) Cards */}
        <section className="space-y-6">
          {cards.map((card) => (
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
          {cards.length === 0 && <div className="text-sm text-slate-500">No cards yet. Add a screenshot to the queue.</div>}
        </section>
      </main>
    </div>
  );
}
