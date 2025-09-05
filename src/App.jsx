// src/App.jsx
import React, { useState, useEffect } from "react";

import ReferencePanel from "./components/ReferencePanel.jsx";
import Controls from "./components/Controls.jsx";
import Cards from "./components/Cards.jsx";

import { listDriveImagesTop } from "./services/drive.js";
import { loadImageFromURL, ahashFromImage, cropToCanvas, evenGridBoxes, hammingDistanceBits } from "./utils/image.js";
import { isShinyName, tidyName, nameFromFilename } from "./utils/names.js";
import { bitsToString, stringToBits, loadCacheLS, saveCacheLS } from "./utils/cache.js";

// ---------- small helpers ----------
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Parallel worker pool (limits concurrency)
async function pLimitMap(arr, limit, worker) {
  const out = new Array(arr.length);
  let i = 0, running = 0, done = 0;
  return await new Promise((resolve) => {
    const pump = () => {
      while (running < limit && i < arr.length) {
        const cur = i++;
        running++;
        Promise.resolve(worker(arr[cur], cur))
          .then((v) => { out[cur] = v; })
          .catch(() => {}) // ignore item failures
          .finally(() => { running--; done++; pump(); });
      }
      if (done >= arr.length) resolve(out);
    };
    pump();
  });
}

// Try hashing a Drive entry using thumbnail first (fast), fall back to full download.
async function hashFromDriveEntry(entry) {
  const tryUrls = [entry.thumbUrl, entry.downloadUrl].filter(Boolean);
  let lastErr = null;
  for (const u of tryUrls) {
    try {
      const { img, url, originUrl } = await loadImageFromURL(u);
      const bits = ahashFromImage(img, 16); // drop to 12 for more speed if accuracy stays good
      return { bits, url, originUrl: originUrl || u };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No usable URL for hashing");
}

export default function App() {
  // Reference index
  const [refs, setRefs] = useState([]); // {source,url,originUrl,name,hashBits}
  const [hashing, setHashing] = useState(false);
  const [progress, setProgress] = useState({ stage: "idle", total: 0, done: 0, msg: "" });

  // Matching controls
  const [threshold, setThreshold] = useState(12);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [inset, setInset] = useState(2);

  // Advanced geometry
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [cellW, setCellW] = useState(0);
  const [cellH, setCellH] = useState(0);
  const [gapX, setGapX] = useState(0);
  const [gapY, setGapY] = useState(0);

  // Drive settings
  const [driveFolderId, setDriveFolderId] = useState("1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB");
  const [driveApiKey, setDriveApiKey] = useState("");
  const [includeSharedDrives, setIncludeSharedDrives] = useState(true);
  const [excludeShiny, setExcludeShiny] = useState(true);
  const [rememberKey, setRememberKey] = useState(() => !!localStorage.getItem("BE_API_KEY"));

  // Cards + cache
  const [cards, setCards] = useState([]);
  const [refCache, setRefCache] = useState(() => loadCacheLS()); // key=url -> {name,bits}

  function addRef(r) { setRefs((prev) => [...prev, r]); }
  function upsertCache(key, name, bits) {
    const next = { ...refCache, [key]: { name, bits: bitsToString(bits) } };
    setRefCache(next); saveCacheLS(next);
  }

  // read API key/folder from URL or localStorage
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

  // ============ DRIVE FETCH (fast) ============
  async function handleDriveFetch() {
    if (!driveFolderId || !driveApiKey) {
      alert("Enter Drive Folder ID and API Key.");
      return;
    }
    setHashing(true);
    setProgress({ stage: "listing", total: 0, done: 0, msg: "Listing Drive…" });

    try {
      // Top-level only (no recursion) & server-side shiny filter in query
      const files = await listDriveImagesTop(driveFolderId, driveApiKey, {
        includeSharedDrives,
        excludeShiny,
      });

      if (!files.length) {
        alert("Drive listing returned 0 images. Check folder ID/sharing or shiny exclusion.");
        setHashing(false);
        setProgress({ stage: "idle", total: 0, done: 0, msg: "" });
        return;
      }

      // Fast path: use cache immediately
      const uncached = [];
      for (const f of files) {
        const key = f.downloadUrl;
        const cached = refCache[key];
        if (cached) {
          addRef({
            source: "drive",
            url: key,
            originUrl: key,
            name: cached.name || tidyName(f.name || nameFromFilename(f.name || key)),
            hashBits: stringToBits(cached.bits),
          });
        } else {
          uncached.push(f);
        }
      }

      // Process remaining with concurrency + thumbnail-first hashing
      const TOTAL = uncached.length;
      let done = 0;
      setProgress({ stage: "indexing", total: TOTAL, done, msg: "Hashing…" });

      const CONCURRENCY = 12; // tune 8–16 based on CPU/network
      await pLimitMap(uncached, CONCURRENCY, async (f) => {
        if (excludeShiny && isShinyName(f.name)) { done++; setProgress(p => ({ ...p, done })); return; }
        try {
          const { bits, url, originUrl } = await hashFromDriveEntry(f);
          const name = tidyName(f.name || nameFromFilename(f.name || f.downloadUrl));
          addRef({ source: "drive", url, originUrl, name, hashBits: bits });
          upsertCache(f.downloadUrl, name, bits); // persist in local cache
        } catch (e) {
          console.warn("Drive image failed:", f.name, e);
        } finally {
          done++;
          setProgress((p) => ({ ...p, done: clamp(done, 0, TOTAL) }));
        }
      });
    } catch (e) {
      console.error(e);
      alert([
        "Drive fetch failed:", e.message,
        "",
        "Common fixes:",
        "• Ensure the API key is valid and not expired.",
        "• If you set HTTP referrer restrictions, run this app from http(s)://localhost or your allowed domain (not file://).",
        "• Share the Drive folder as ‘Anyone with the link – Viewer’.",
      ].join("\n"));
    }

    setHashing(false);
    setProgress({ stage: "idle", total: 0, done: 0, msg: "" });
  }

  // ============ SCREENSHOT → CARDS ============
  async function handleScreenshotFiles(files) {
    const arr = Array.from(files || []);
    for (const f of arr) {
      const { img, url } = await (await import("./utils/image.js")).loadImageFromFile(f); // lazy load helper
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
      card.grid = card.grid.map((cell) => ({
        ...cell,
        name: cell.dist <= newThresh ? (cell.name || "") : "",
        refUrl: cell.dist <= newThresh ? cell.refUrl : null,
      }));
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
          // reference state
          refs={refs}
          hashing={hashing}
          progress={progress}
          excludeShiny={excludeShiny} setExcludeShiny={setExcludeShiny}
          // drive controls
          driveFolderId={driveFolderId} setDriveFolderId={setDriveFolderId}
          driveApiKey={driveApiKey} setDriveApiKey={setDriveApiKey}
          includeSharedDrives={includeSharedDrives} setIncludeSharedDrives={setIncludeSharedDrives}
          rememberKey={rememberKey} setRememberKey={setRememberKey}
          // actions
          handleDriveFetch={handleDriveFetch}
          // cache import/export
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

        <Controls
          rows={rows} setRows={setRows}
          cols={cols} setCols={setCols}
          inset={inset} setInset={setInset}
          threshold={threshold} onThresholdChange={(v)=>{ const nv = clamp(v, 4, 24); setThreshold(nv); cards.forEach((_,i)=>recomputeThreshold(i, nv)); }}
        />

        <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">3) Screenshots</h2>
          <p className="text-sm text-slate-600 mb-3">Add one or more screenshots. Each becomes a card below.</p>
          <input type="file" multiple accept="image/*" onChange={(e)=>{
            const files = e.target.files;
            const arr = Array.from(files || []);
            (async () => { await handleScreenshotFiles(arr); })();
          }} />
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
