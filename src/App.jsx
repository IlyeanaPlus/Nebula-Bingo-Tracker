import React, { useState, useEffect } from "react";

import ReferencePanel from './components/ReferencePanel.jsx';
import Controls from './components/Controls.jsx';
import Diagnostics from './components/Diagnostics.jsx';
import Cards from './components/Cards.jsx';

import { listDriveImagesDeep, findFileInFolderPublic, downloadTextPublic } from './services/drive.js';
import { ensureOAuthToken, uploadOrUpdateJSON } from './services/drive_oauth.js';
import { getJSON, getBlob } from './utils/net.js';
import { loadImageFromFile, loadImageFromURL, ahashFromImage, cropToCanvas, evenGridBoxes, hammingDistanceBits } from './utils/image.js';
import { isShinyName, tidyName, nameFromFilename } from './utils/names.js';
import { bitsToString, stringToBits, loadCacheLS, saveCacheLS } from './utils/cache.js';

// Simple concurrency pool
async function mapPool(limit, items, worker) {
  const results = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export default function App() {
  const [refs, setRefs] = useState([]);
  const [hashing, setHashing] = useState(false);
  const [progress, setProgress] = useState(null); // {phase,total,done}

  // Matching/grid controls
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

  // Diagnostics & cards
  const [diag, setDiag] = useState({ running: false, logs: [] });
  const [cards, setCards] = useState([]);
  const [refCache, setRefCache] = useState(() => loadCacheLS()); // url -> {name,bits}

  // Drive-backed cache (write requires OAuth)
  const [oauthClientId, setOauthClientId] = useState(localStorage.getItem("BE_OAUTH_CID") || "");
  const [rememberCID, setRememberCID] = useState(!!localStorage.getItem("BE_OAUTH_CID"));
  const CACHE_FILENAME = "sprite_ref_cache.json";

  // NEW: autoload toggle + one-shot guard
  const [autoLoadCache, setAutoLoadCache] = useState(localStorage.getItem("BE_AUTO_CACHE") !== "0"); // default ON
  const cacheAutoloadedRef = React.useRef(false);

  function addRef(r) { setRefs((prev) => [...prev, r]); }
  function upsertCache(key, name, bits) {
    const next = { ...refCache, [key]: { name, bits: bitsToString(bits) } };
    setRefCache(next); saveCacheLS(next);
  }

  // Prefill API key/folder
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
  useEffect(() => {
    if (rememberCID && oauthClientId) localStorage.setItem("BE_OAUTH_CID", oauthClientId);
    if (!rememberCID) localStorage.removeItem("BE_OAUTH_CID");
  }, [oauthClientId, rememberCID]);
  useEffect(() => {
    localStorage.setItem("BE_AUTO_CACHE", autoLoadCache ? "1" : "0");
  }, [autoLoadCache]);

  // NEW: Auto-load cache.json from Drive on startup (public read via API key)
  useEffect(() => {
    if (cacheAutoloadedRef.current) return;
    if (!autoLoadCache) return;
    if (!driveFolderId || !driveApiKey) return;

    (async () => {
      try {
        const f = await findFileInFolderPublic(
          driveFolderId,
          driveApiKey,
          CACHE_FILENAME,
          includeSharedDrives
        );
        if (!f) { cacheAutoloadedRef.current = true; return; }

        const txt = await downloadTextPublic(f.id, driveApiKey);
        const parsed = JSON.parse(txt);

        // Save to localStorage cache for future sessions
        setRefCache(parsed);
        saveCacheLS(parsed);

        // Hydrate current session refs so matching works immediately
        let added = 0;
        for (const [key, val] of Object.entries(parsed)) {
          if (!val?.bits) continue;
          addRef({ source: "cache", url: key, originUrl: key, name: val.name || nameFromFilename(key), hashBits: stringToBits(val.bits) });
          added++;
        }
        console.log(`Auto-loaded ${added} refs from ${CACHE_FILENAME}.`);
      } catch (e) {
        console.warn("Auto-load of cache.json failed:", e);
      } finally {
        cacheAutoloadedRef.current = true;
      }
    })();
  }, [autoLoadCache, driveFolderId, driveApiKey, includeSharedDrives]);

  // DRIVE: fetch + hash (with cache reuse + progress)
  async function handleDriveFetch() {
    if (!driveFolderId || !driveApiKey) { alert("Enter Drive Folder ID and API Key."); return; }
    setHashing(true);
    setProgress({ phase: "Listing Drive…", total: 0, done: 0 });
    try {
      const files = await listDriveImagesDeep(driveFolderId, driveApiKey, {
        includeSharedDrives,
        excludeShiny,
        recurse: true,
        max: Infinity,
      });

      if (!files.length) {
        alert("Drive listing returned 0 images. Check folder ID/sharing or shiny exclusion.");
        setProgress(null);
        setHashing(false);
        return;
      }

      const seen = new Set(refs.map(r => r.url));
      const toHash = [];
      let restored = 0;

      for (const f of files) {
        if (excludeShiny && isShinyName(f.name)) continue;
        const key = f.downloadUrl;
        if (seen.has(key)) continue;

        const cached = refCache[key];
        if (cached && cached.bits) {
          addRef({
            source: "drive",
            url: key,
            originUrl: key,
            name: cached.name || tidyName(f.name || nameFromFilename(f.name || key)),
            hashBits: stringToBits(cached.bits),
          });
          seen.add(key);
          restored++;
        } else {
          toHash.push({ key, name: f.name });
          seen.add(key);
        }
      }

      setProgress({ phase: "Hashing images…", total: toHash.length, done: 0 });

      await mapPool(8, toHash, async ({ key, name }) => {
        try {
          const { img, url, originUrl } = await loadImageFromURL(key);
          const bits = ahashFromImage(img, 16);
          const pretty = tidyName(name || nameFromFilename(name || key));
          addRef({ source: "drive", url, originUrl, name: pretty, hashBits: bits });
          upsertCache(originUrl || url, pretty, bits);
        } catch (e) {
          console.warn("Drive image failed:", name || key, e);
        } finally {
          setProgress(p => p ? { ...p, done: p.done + 1 } : p);
        }
      });

      setProgress({ phase: "Done", total: toHash.length, done: toHash.length });
      console.log(`Drive indexing complete. restored from cache: ${restored}, newly hashed: ${toHash.length}`);
    } catch (e) {
      console.error(e);
      alert([
        "Drive fetch failed:", e.message,
        "",
        "Common fixes:",
        "• Ensure the API key is valid and not expired.",
        "• If you set HTTP referrer restrictions, run this app from http://localhost or your allowed domain (not file://).",
        "• Share the Drive folder as ‘Anyone with the link – Viewer’.",
      ].join("\n"));
    }
    setHashing(false);
    setTimeout(() => setProgress(null), 800);
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

  // Diagnostics
  async function runDiagnostics() {
    setDiag({ running: true, logs: [] });
    try {
      setDiag((d) => ({...d, logs: d.logs.concat([`➤ ${new Date().toLocaleTimeString()} — Origin: ${window.location.origin}`])}));
      if (window.location.protocol === "file:") setDiag((d) => ({...d, logs: d.logs.concat(["Warning: running from file:// may break API key referrer restrictions."])}));
      if (!driveApiKey) { setDiag((d)=>({...d, logs: d.logs.concat(["No API key set."])})); return; }
      const discUrl = `https://www.googleapis.com/discovery/v1/apis/drive/v3/rest?key=${encodeURIComponent(driveApiKey)}`;
      await getJSON(discUrl, "validating API key (discovery)");
      setDiag((d) => ({...d, logs: d.logs.concat(["API key OK (discovery)."])}));
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
      setDiag((d) => ({...d, logs: d.logs.concat([`Listing test URL: ${listUrl}`])}));
      const listJson = await getJSON(listUrl, "listing test files");
      const count = (listJson.files || []).length;
      setDiag((d) => ({...d, logs: d.logs.concat([`List success. Returned ${count} file(s).`])}));
      if (!count) { setDiag((d)=>({...d, logs: d.logs.concat(["0 files — wrong folder ID or not shared publicly."])})); return; }
      const first = listJson.files[0];
      const dl = `https://www.googleapis.com/drive/v3/files/${first.id}?alt=media&key=${encodeURIComponent(driveApiKey)}`;
      setDiag((d) => ({...d, logs: d.logs.concat([`Download test URL: ${dl}`])}));
      await getBlob(dl, "downloading first image test");
      setDiag((d) => ({...d, logs: d.logs.concat(["Download test OK."])}));
    } catch (e) {
      setDiag((d) => ({...d, logs: d.logs.concat([`❌ Diagnostic error: ${e.message}`])}));
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
        <ReferencePanel
          refs={refs}
          hashing={hashing}
          excludeShiny={excludeShiny} setExcludeShiny={setExcludeShiny}
          driveFolderId={driveFolderId} setDriveFolderId={setDriveFolderId}
          driveApiKey={driveApiKey} setDriveApiKey={setDriveApiKey}
          includeSharedDrives={includeSharedDrives} setIncludeSharedDrives={setIncludeSharedDrives}
          rememberKey={rememberKey} setRememberKey={setRememberKey}
          handleDriveFetch={handleDriveFetch}
          progress={progress}
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

          oauthClientId={oauthClientId} setOauthClientId={setOauthClientId}
          rememberCID={rememberCID} setRememberCID={setRememberCID}
          loadCacheFromDrive={loadCacheFromDrive}
          saveCacheToDrive={saveCacheToDrive}
          // NEW:
          autoLoadCache={autoLoadCache} setAutoLoadCache={setAutoLoadCache}
        />

        <Controls
          rows={rows} setRows={setRows}
          cols={cols} setCols={setCols}
          inset={inset} setInset={setInset}
          threshold={threshold} onThresholdChange={(v)=>{ setThreshold(v); cards.forEach((_,i)=>recomputeThreshold(i, v)); }}
        />

        <Diagnostics diag={diag} runDiagnostics={runDiagnostics} runHelperTests={runHelperTests} />

        <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-2">4) Screenshots</h2>
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
