// src/App.jsx
import React, { useState, useEffect } from "react";

import ReferencePanel from './components/ReferencePanel.jsx';
import Cards from './components/Cards.jsx';

import { listDriveImagesTop, fetchDriveCacheJSON } from './services/drive.js';
import { loadImageFromFile, loadImageFromURL, ahashFromImage, cropToCanvas, evenGridBoxes, hammingDistanceBits } from './utils/image.js';
import { isShinyName, tidyName, nameFromFilename } from './utils/names.js';
import { bitsToString, stringToBits, loadCacheLS, saveCacheLS } from './utils/cache.js';

export default function App() {
  const [refs, setRefs] = useState([]);            // {source,url,originUrl,name,hashBits,thumbUrl?}
  const [hashing, setHashing] = useState(false);
  const [progress, setProgress] = useState({ stage: "idle", total: 0, done: 0, msg: "" });

  // Matching controls
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

  // Drive / cache settings
  const [driveFolderId, setDriveFolderId] = useState("1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB");
  const [driveApiKey, setDriveApiKey] = useState("");
  const [includeSharedDrives, setIncludeSharedDrives] = useState(true);
  const [excludeShiny, setExcludeShiny] = useState(true);
  const [rememberKey, setRememberKey] = useState(() => !!localStorage.getItem("BE_API_KEY"));

  // Cards + queued screenshots + local cache
  const [cards, setCards] = useState([]);
  const [queued, setQueued] = useState([]);        // {id,title,img,url}
  const [refCache, setRefCache] = useState(() => loadCacheLS());

  function addRef(r) { setRefs((prev) => [...prev, r]); }
  function upsertCache(key, name, bits) {
    const next = { ...refCache, [key]: { name, bits: bitsToString(bits) } };
    setRefCache(next); saveCacheLS(next);
  }

  // Load key/folder from URL or saved key
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

  // ---------- Drive cache loader ----------
  async function handleDriveLoadCache() {
    if (!driveFolderId || !driveApiKey) { alert("Enter Drive Folder ID and API Key."); return; }
    setHashing(true);
    setProgress({ stage: "cache", total: 1, done: 0, msg: "Checking for sprite_ref_cache.json…" });
    try {
      const { cache } = await fetchDriveCacheJSON(driveFolderId, driveApiKey, { includeSharedDrives });
      if (!cache) {
        alert("No sprite_ref_cache.json found in this folder.");
      } else {
        // Merge into local cache + refs
        const merged = { ...refCache, ...cache };
        setRefCache(merged); saveCacheLS(merged);
        let added = 0;
        for (const [key, val] of Object.entries(cache)) {
          if (!val || !val.bits) continue;
          addRef({
            source: "cache",
            url: key, originUrl: key,
            name: val.name || nameFromFilename(key),
            hashBits: stringToBits(val.bits)
          });
          added++;
        }
        alert(`Loaded cache: ${added} refs from Drive cache JSON.`);
      }
    } catch (e) {
      console.error(e);
      alert("Cache load failed: " + e.message);
    } finally {
      setProgress({ stage: "idle", total: 0, done: 0, msg: "" });
      setHashing(false);
    }
  }

  // ---------- Drive Fetch & Index (fast path: hash thumbnails if available) ----------
  async function handleDriveFetch() {
    if (!driveFolderId || !driveApiKey) { alert("Enter Drive Folder ID and API Key."); return; }
    setHashing(true);
    try {
      setProgress({ stage: "list", total: 0, done: 0, msg: "Listing Drive…" });
      const files = await listDriveImagesTop(driveFolderId, driveApiKey, { includeSharedDrives, excludeShiny });
      if (!files.length) alert("Drive listing returned 0 images. Check folder ID/sharing or adjust shiny exclusion.");

      setProgress({ stage: "hash", total: files.length, done: 0, msg: "Hashing references…" });
      let done = 0;

      // Small concurrency to keep UI responsive
      const limit = 8;
      const queue = [...files];
      const workers = Array.from({ length: limit }, async () => {
        while (queue.length) {
          const f = queue.shift();
          try {
            const key = f.downloadUrl;
            const cached = refCache[key];
            if (cached) {
              addRef({ source: "drive", url: key, originUrl: key, name: cached.name, hashBits: stringToBits(cached.bits), thumbUrl: f.thumbUrl });
            } else {
              // hash thumbnail first if available (MUCH faster)
              if (f.thumbUrl) {
                const { img } = await loadImageFromURL(f.thumbUrl);
                const bits = ahashFromImage(img, 16);
                const name = tidyName(f.name || nameFromFilename(f.name || key));
                addRef({ source: "drive", url: key, originUrl: key, name, hashBits: bits, thumbUrl: f.thumbUrl });
                upsertCache(key, name, bits);
              } else {
                const { img } = await loadImageFromURL(key);
                const bits = ahashFromImage(img, 16);
                const name = tidyName(f.name || nameFromFilename(f.name || key));
                addRef({ source: "drive", url: key, originUrl: key, name, hashBits: bits });
                upsertCache(key, name, bits);
              }
            }
          } catch (e) {
            console.warn("Drive image failed:", f?.name, e);
          } finally {
            done++; setProgress(p => ({ ...p, done }));
          }
        }
      });

      await Promise.all(workers);
    } catch (e) {
      console.error(e);
      alert([
        "Drive fetch failed:", e.message,
        "\nCommon fixes:",
        "• Ensure the API key is valid and not expired.",
        "• If you set HTTP referrer restrictions, run this app from http://localhost or your allowed domain (not file://).",
        "• Share the Drive folder as ‘Anyone with the link – Viewer’.",
      ].join("\n"));
    } finally {
      setHashing(false);
      setProgress({ stage: "idle", total: 0, done: 0, msg: "" });
    }
  }

  // ---------- Screenshot queue + Build buttons ----------
  async function queueScreenshotFiles(files) {
    const arr = Array.from(files || []);
    for (const f of arr) {
      const { img, url } = await loadImageFromFile(f);
      const title = f.name.replace(/\.[^.]+$/, "");
      setQueued(prev => [...prev, { id: crypto.randomUUID(), title, img, url }]);
    }
  }
  function removeQueued(id) {
    setQueued(prev => prev.filter(q => q.id !== id));
  }
  function buildCardFromQueued(q) {
    if (!refs.length) { alert("No reference sprites are indexed yet. Load Drive cache or Fetch & Index first."); return; }
    const img = q.img;
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
    setCards(prev => [...prev, { id: crypto.randomUUID(), title: q.title, img, url: q.url, rows, cols, grid }]);
  }
  function buildQueued(id) { const q = queued.find(x => x.id === id); if (!q) return; buildCardFromQueued(q); removeQueued(id); }
  function buildAllQueued() { const list = [...queued]; for (const q of list) buildCardFromQueued(q); setQueued([]); }

  // ---------- Threshold recompute ----------
  function recomputeThreshold(cardIdx, newThresh) {
    setThreshold(newThresh);
    setCards((prev) => {
      const next = [...prev]; const card = next[cardIdx]; if (!card) return prev;
      card.grid = card.grid.map((cell) => ({ ...cell, name: cell.dist <= newThresh ? (cell.name || "") : "", refUrl: cell.dist <= newThresh ? cell.refUrl : null }));
      return next;
    });
  }

  // ---------- Helpers: TSV/CSV/Reset/Update/Toggle ----------
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
          progress={progress}
          excludeShiny={excludeShiny} setExcludeShiny={setExcludeShiny}
          driveFolderId={driveFolderId} setDriveFolderId={setDriveFolderId}
          driveApiKey={driveApiKey} setDriveApiKey={setDriveApiKey}
          includeSharedDrives={includeSharedDrives} setIncludeSharedDrives={setIncludeSharedDrives}
          rememberKey={rememberKey} setRememberKey={setRememberKey}
          handleDriveLoadCache={handleDriveLoadCache}
          handleDriveFetch={handleDriveFetch}
          exportCacheJSON={()=>{
            const blob = new Blob([JSON.stringify(refCache, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sprite_ref_cache.json"; a.click();
          }}
          importCacheJSON={(file)=>{
            if (!file) return;
            file.text().then((text)=>{
              try {
                const parsed = JSON.parse(text);
                setRefCache(parsed); saveCacheLS(parsed);
                for (const [key, val] of Object.entries(parsed)) {
                  if (!val || !val.bits) continue;
                  addRef({ source: "cache", url: key, originUrl: key, name: val.name || nameFromFilename(key), hashBits: stringToBits(val.bits) });
                }
              } catch { alert("Invalid cache JSON"); }
            });
          }}
        />

        {/* Controls */}
        <section id="controls" className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">2) Controls</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><label className="block text-xs text-slate-600">Rows</label><input className="w-full border rounded px-2 py-1" type="number" value={rows} min={1} onChange={(e)=>setRows(parseInt(e.target.value||"1"))} /></div>
            <div><label className="block text-xs text-slate-600">Cols</label><input className="w-full border rounded px-2 py-1" type="number" value={cols} min={1} onChange={(e)=>setCols(parseInt(e.target.value||"1"))} /></div>
            <div><label className="block text-xs text-slate-600">Inset (px)</label><input className="w-full border rounded px-2 py-1" type="number" value={inset} min={0} onChange={(e)=>setInset(parseInt(e.target.value||"0"))} /></div>
            <div>
              <label className="block text-xs text-slate-600">Threshold (Hamming)</label>
              <input className="w-full" type="range" min={4} max={24} value={threshold} onChange={(e)=>{ const v=parseInt(e.target.value); setThreshold(v); cards.forEach((_,i)=>recomputeThreshold(i,v)); }} />
              <div className="text-xs text-slate-600">{threshold}</div>
            </div>
          </div>
        </section>

        {/* Screenshots – queue then build */}
        <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">3) Screenshots</h2>
          <p className="text-sm text-slate-600 mb-3">Add screenshots to the queue. Adjust geometry / threshold, then click <b>Build card</b>.</p>
          <input type="file" multiple accept="image/*" onChange={(e)=>{ const files = e.target.files; if (files?.length) queueScreenshotFiles(files); e.target.value = ""; }} />

          {queued.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="text-sm text-slate-600">Queued: {queued.length}</div>
                <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={buildAllQueued}>Build all queued</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {queued.map(q => (
                  <div key={q.id} className="p-2 border rounded-xl bg-white">
                    <div className="flex items-center gap-2">
                      <img src={q.url} alt="" className="w-16 h-16 object-contain border rounded"/>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" title={q.title}>{q.title}</div>
                        <div className="text-xs text-slate-500">({rows}×{cols}, inset {inset}px)</div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button className="px-3 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-sm" onClick={()=>buildQueued(q.id)}>Build card</button>
                      <button className="px-3 py-1 rounded bg-rose-100 hover:bg-rose-200 text-sm" onClick={()=>removeQueued(q.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <Cards
          cards={cards}
          copyTSV={copyTSV}
          downloadCSV={downloadCSV}
          resetCard={resetCard}
          updateCellName={updateCellName}
          toggleCheck={toggleCheck}
        />
      </main>
    </div>
  );
}
