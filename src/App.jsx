// App.jsx
import React, { useEffect, useState } from "react";
import ReferencePanel from "./components/ReferencePanel.jsx";
import Controls from "./components/Controls.jsx";
import Cards from "./components/Cards.jsx";

import { listDriveImagesDeep, loadDriveCacheJSONDeep } from "./services/drive.js";
import { loadImageFromURL, ahashFromImage, cropToCanvas, evenGridBoxes, hammingDistanceBits } from "./utils/image.js";
import { isShinyName, tidyName, nameFromFilename } from "./utils/names.js";
import { bitsToString, stringToBits, loadCacheLS, saveCacheLS } from "./utils/cache.js";

export default function App() {
  const [refs, setRefs] = useState([]);
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

  const [driveFolderId, setDriveFolderId] = useState("1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB");
  const [driveApiKey, setDriveApiKey] = useState("");
  const [includeSharedDrives, setIncludeSharedDrives] = useState(true);
  const [excludeShiny, setExcludeShiny] = useState(true);
  const [rememberKey, setRememberKey] = useState(() => !!localStorage.getItem("BE_API_KEY"));
  const [autoLoadDriveCache, setAutoLoadDriveCache] = useState(true);

  const [cards, setCards] = useState([]);
  const [refCache, setRefCache] = useState(() => loadCacheLS());
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  function addRef(r) { setRefs((prev) => [...prev, r]); }
  function upsertCache(key, name, bits) {
    const next = { ...refCache, [key]: { name, bits: bitsToString(bits) } };
    setRefCache(next); saveCacheLS(next);
  }

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

  async function handleDriveFetch() {
    if (!driveFolderId || !driveApiKey) { alert("Enter Drive Folder ID and API Key."); return; }
    setHashing(true);
    setProgress({ done: 0, total: 0 });
    try {
      // 1) Try to load cache.json from Drive (deep)
      if (autoLoadDriveCache) {
        const hit = await loadDriveCacheJSONDeep(driveFolderId, driveApiKey, { includeSharedDrives, recurse: true });
        if (hit?.json && typeof hit.json === "object") {
          // merge into local cache and populate refs immediately
          const merged = { ...refCache, ...hit.json };
          setRefCache(merged); saveCacheLS(merged);
          for (const [key, val] of Object.entries(hit.json)) {
            if (!val || !val.bits) continue;
            addRef({ source: "cache", url: key, originUrl: key, name: val.name || nameFromFilename(key), hashBits: stringToBits(val.bits) });
          }
        }
      }

      // 2) List images (deep)
      let totalCount = 0;
      const files = await listDriveImagesDeep(driveFolderId, driveApiKey, {
        includeSharedDrives,
        excludeShiny,
        recurse: true,
        max: Infinity,
        onProgress: (ev) => {
          if (ev.type === "file") {
            totalCount = ev.count;
            setProgress((p) => ({ done: p.done, total: totalCount }));
          }
        }
      });
      if (!files.length) alert("Drive listing returned 0 images. Check folder ID/sharing or adjust shiny exclusion.");

      // 3) Index: reuse cache when available, otherwise hash
      let done = 0;
      setProgress({ done, total: files.length });
      for (const f of files) {
        if (excludeShiny && isShinyName(f.name)) { done++; setProgress({ done, total: files.length }); continue; }
        const key = f.downloadUrl; const cached = refCache[key];
        if (cached) {
          addRef({ source: "drive", url: key, originUrl: key, name: cached.name, hashBits: stringToBits(cached.bits) });
          done++; setProgress({ done, total: files.length });
          continue;
        }
        try {
          const { img, url, originUrl } = await loadImageFromURL(f.downloadUrl);
          const bits = ahashFromImage(img, 16);
          const name = tidyName(f.name || nameFromFilename(f.name || f.downloadUrl));
          addRef({ source: "drive", url, originUrl, name, hashBits: bits });
          upsertCache(originUrl || url, name, bits);
        } catch (e) {
          console.warn("Drive image failed:", f.name, e);
        } finally {
          done++; setProgress({ done, total: files.length });
        }
      }
    } catch (e) {
      console.error(e);
      alert([
        "Drive fetch failed:", e.message,
        "\nCommon fixes:",
        "• Ensure the API key is valid and not expired.",
        "• If you set HTTP referrer restrictions, run this app from http://localhost or your allowed domain (not file://).",
        "• Restrict the key to the Drive API only (optional but recommended).",
        "• Share the Drive folder as ‘Anyone with the link – Viewer’.",
      ].join("\n"));
    }
    setHashing(false);
  }

  // Screenshots → cards
  async function handleScreenshotFiles(files) {
    const arr = Array.from(files || []);
    for (const f of arr) {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();

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
          hashing={hashing}
          refsCount={refs.length}
          excludeShiny={excludeShiny} setExcludeShiny={setExcludeShiny}
          driveFolderId={driveFolderId} setDriveFolderId={setDriveFolderId}
          driveApiKey={driveApiKey} setDriveApiKey={setDriveApiKey}
          includeSharedDrives={includeSharedDrives} setIncludeSharedDrives={setIncludeSharedDrives}
          rememberKey={rememberKey} setRememberKey={setRememberKey}
          autoLoadDriveCache={autoLoadDriveCache} setAutoLoadDriveCache={setAutoLoadDriveCache}
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
          progress={progress}
        />

        <Controls
          rows={rows} setRows={setRows}
          cols={cols} setCols={setCols}
          inset={inset} setInset={setInset}
          threshold={threshold} onThresholdChange={(v)=>{ setThreshold(v); cards.forEach((_,i)=>recomputeThreshold(i, v)); }}
          advanced={advanced} setAdvanced={setAdvanced}
          startX={startX} setStartX={setStartX}
          startY={startY} setStartY={setStartY}
          cellW={cellW} setCellW={setCellW}
          cellH={cellH} setCellH={setCellH}
          gapX={gapX} setGapX={setGapX}
          gapY={gapY} setGapY={setGapY}
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
          updateCellName={updateCellName}
          toggleCheck={toggleCheck}
        />
      </main>
    </div>
  );
}
