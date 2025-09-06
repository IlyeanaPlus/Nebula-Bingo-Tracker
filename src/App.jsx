// src/App.jsx
import React, { useEffect, useState } from "react";

import ReferencePanel from './components/ReferencePanel.jsx';
import Controls from './components/Controls.jsx';
import Cards from './components/Cards.jsx';

import { listDriveImagesFast, tryLoadDriveCacheJSON } from './services/drive.js';
import { getBlob } from './utils/net.js';
import { loadImageFromFile, loadImageFromURL, ahashFromImage, cropToCanvas, evenGridBoxes, hammingDistanceBits } from './utils/image.js';
import { isShinyName, tidyName, nameFromFilename } from './utils/names.js';
import { bitsToString, stringToBits, loadCacheLS, saveCacheLS } from './utils/cache.js';

export default function App() {
  const [refs, setRefs] = useState([]);
  const [hashing, setHashing] = useState(false);

  const [threshold, setThreshold] = useState(12);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [inset, setInset] = useState(2);

  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [cellW, setCellW] = useState(0);
  const [cellH, setCellH] = useState(0);
  const [gapX, setGapX] = useState(0);
  const [gapY, setGapY] = useState(0);

  const [driveFolderId, setDriveFolderId] = useState("1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB");
  const [driveApiKey, setDriveApiKey] = useState("");
  const [includeSharedDrives, setIncludeSharedDrives] = useState(true);
  const [excludeShiny, setExcludeShiny] = useState(true);
  const [rememberKey, setRememberKey] = useState(() => !!localStorage.getItem("BE_API_KEY"));

  // speed / progress
  const [useThumbnails, setUseThumbnails] = useState(true);
  const [concurrency, setConcurrency] = useState(16);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const [cards, setCards] = useState([]);
  const [refCache, setRefCache] = useState(() => loadCacheLS());

  function addRef(r) { setRefs((prev) => [...prev, r]); }
  function upsertCache(key, name, bits) {
    const next = { ...refCache, [key]: { name, bits: bitsToString(bits) } };
    setRefCache(next); saveCacheLS(next);
  }

  // preload key/folder from URL / localStorage
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const k = sp.get("key"); const f = sp.get("folder");
      if (k) setDriveApiKey(k); if (f) setDriveFolderId(f);
      if (!k) { const saved = localStorage.getItem("BE_API_KEY"); if (saved) setDriveApiKey(saved); }
    } catch {}
  }, []);
  useEffect(() => { if (rememberKey && driveApiKey) localStorage.setItem("BE_API_KEY", driveApiKey); }, [rememberKey, driveApiKey]);
  useEffect(() => { if (!rememberKey) localStorage.removeItem("BE_API_KEY"); }, [rememberKey]);

  // ----- helpers -----
  function driveCacheKey(f) {
    return `drive:${f.id}:${f.md5 || ''}`;
  }
  async function parallelMap(items, worker, { limit = 16 } = {}) {
    let i = 0;
    const runners = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        await worker(items[idx], idx);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    });
    await Promise.all(runners);
  }

  // ===== Drive Fetch & Index (fast) =====
  async function handleDriveFetch() {
    if (!driveFolderId || !driveApiKey) { alert("Enter Drive Folder ID and API Key."); return; }
    setHashing(true);
    try {
      const files = await listDriveImagesFast(driveFolderId, driveApiKey, { includeSharedDrives, excludeShiny });

      // cached vs missing
      const missing = [];
      for (const f of files) {
        const key = driveCacheKey(f);
        const cached = refCache[key];
        const pretty = tidyName(f.name);
        if (cached?.bits) {
          addRef({ source: "drive", url: f.downloadUrl, originUrl: f.downloadUrl, name: cached.name || pretty, hashBits: stringToBits(cached.bits) });
        } else {
          missing.push({ ...f, cacheKey: key, prettyName: pretty });
        }
      }

      // hash missing in parallel using thumbnail
      setProgress({ done: 0, total: missing.length });
      await parallelMap(
        missing,
        async (f) => {
          try {
            const src = (useThumbnails && f.thumbUrl) ? f.thumbUrl : f.downloadUrl;
            const { img, url } = await loadImageFromURL(src);
            const bits = ahashFromImage(img, 16);
            addRef({ source: "drive", url, originUrl: f.downloadUrl, name: f.prettyName, hashBits: bits });
            upsertCache(f.cacheKey, f.prettyName, bits);
          } catch (e) {
            console.warn("Drive image failed:", f.name, e);
          }
        },
        { limit: concurrency }
      );

      if (!files.length) alert("Drive listing returned 0 images. Check folder ID/sharing or shiny exclusion.");
    } catch (e) {
      console.error(e);
      alert("Drive fetch failed: " + e.message);
    }
    setHashing(false);
  }

  // ===== Drive cache.json (read-only) =====
  async function onLoadDriveCache() {
    if (!driveFolderId || !driveApiKey) { alert("Enter Drive Folder ID and API Key."); return; }
    try {
      const json = await tryLoadDriveCacheJSON(driveFolderId, driveApiKey, { includeSharedDrives });
      if (!json) { alert("No sprite_ref_cache.json found at folder root."); return; }
      // merge
      const merged = { ...refCache, ...json };
      setRefCache(merged); saveCacheLS(merged);
      // push to refs for immediate use
      for (const [key, val] of Object.entries(json)) {
        if (!val?.bits) continue;
        addRef({ source: "cache", url: key, originUrl: key, name: val.name || nameFromFilename(key), hashBits: stringToBits(val.bits) });
      }
      alert("Loaded cache.json from Drive.");
    } catch (e) {
      alert("Failed to load cache.json from Drive: " + e.message);
    }
  }

  // ===== Screenshots -> Cards =====
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
    setThreshold(newThresh);
    setCards((prev) => {
      const next = [...prev]; const card = next[cardIdx]; if (!card) return prev;
      card.grid = card.grid.map((cell) => ({ ...cell, name: cell.dist <= newThresh ? (cell.name || "") : "", refUrl: cell.dist <= newThresh ? cell.refUrl : null }));
      return next;
    });
  }
  function copyTSV(card) { /* unchanged */ 
    const lines = []; for (let r = 0; r < card.rows; r++) { const row = []; for (let c = 0; c < card.cols; c++) row.push(card.grid[r * card.cols + c].name || ""); lines.push(row.join("\t")); }
    navigator.clipboard.writeText(lines.join("\n")); alert("Copied TSV to clipboard.");
  }
  function downloadCSV(card) { /* unchanged */
    const lines = []; for (let r = 0; r < card.rows; r++) { const row = []; for (let c = 0; c < card.cols; c++) { const v = (card.grid[r * card.cols + c].name || "").replace(/"/g, '""'); row.push(`"${v}"`);} lines.push(row.join(",")); }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${card.title || "card"}.csv`; a.click();
  }
  function resetCard(cardId, mode = "checks") {
    setCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      if (mode === "checks") return { ...c, grid: c.grid.map((cell) => ({ ...cell, checked: false })) };
      if (mode === "all") return { ...c, grid: c.grid.map((cell) => ({ name: "", dist: cell.dist, refUrl: null, checked: false })) };
      return c;
    }));
  }
  function removeCard(cardId) { setCards((prev) => prev.filter((c) => c.id !== cardId)); }  // NEW
  function updateCellName(cardId, idx, value) {
    setCards((prev) => prev.map((c) => { if (c.id !== cardId) return c; const grid = [...c.grid]; grid[idx] = { ...grid[idx], name: value }; return { ...c, grid }; }));
  }
  function toggleCheck(cardId, idx) {
    setCards((prev) => prev.map((c) => { if (c.id !== cardId) return c; const grid = [...c.grid]; grid[idx] = { ...grid[idx], checked: !grid[idx].checked }; return { ...c, grid }; }));
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
        <ReferencePanel
          refs={refs}
          hashing={hashing}
          // Drive
          driveFolderId={driveFolderId} setDriveFolderId={setDriveFolderId}
          driveApiKey={driveApiKey} setDriveApiKey={setDriveApiKey}
          includeSharedDrives={includeSharedDrives} setIncludeSharedDrives={setIncludeSharedDrives}
          excludeShiny={excludeShiny} setExcludeShiny={setExcludeShiny}
          rememberKey={rememberKey} setRememberKey={setRememberKey}
          // speed/ux
          useThumbnails={useThumbnails} setUseThumbnails={setUseThumbnails}
          concurrency={concurrency} setConcurrency={setConcurrency}
          progress={progress}
          // actions
          handleDriveFetch={handleDriveFetch}
          exportCacheJSON={()=>{
            const blob = new Blob([JSON.stringify(refCache, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sprite_ref_cache.json"; a.click();
          }}
          importCacheJSON={(file)=>{
            if (!file) return; file.text().then((text)=>{
              try {
                const parsed = JSON.parse(text);
                setRefCache(parsed); saveCacheLS(parsed);
                for (const [key, val] of Object.entries(parsed)) {
                  if (!val?.bits) continue;
                  addRef({ source: "cache", url: key, originUrl: key, name: val.name || nameFromFilename(key), hashBits: stringToBits(val.bits) });
                }
              } catch { alert("Invalid cache JSON"); }
            });
          }}
          onLoadDriveCache={onLoadDriveCache}
        />

        <Controls
          rows={rows} setRows={setRows}
          cols={cols} setCols={setCols}
          inset={inset} setInset={setInset}
          threshold={threshold} onThresholdChange={(v)=>{ setThreshold(v); cards.forEach((_,i)=>recomputeThreshold(i, v)); }}
        />

        <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">3) Screenshots</h2>
          <p className="text-sm text-slate-600 mb-3">Add one or more screenshots. Each becomes a card below.</p>
          <input type="file" multiple accept="image/*" onChange={(e)=>handleScreenshotFiles(e.target.files)} />
        </section>

        <Cards
          cards={cards}
          copyTSV={copyTSV}
          downloadCSV={downloadCSV}
          resetCard={resetCard}
          removeCard={removeCard}     // NEW
          updateCellName={updateCellName}
          toggleCheck={toggleCheck}
        />
      </main>
    </div>
  );
}
