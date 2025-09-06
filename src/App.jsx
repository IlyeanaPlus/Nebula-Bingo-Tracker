import React, { useEffect, useRef, useState } from 'react';
import BingoCard from './components/BingoCard.jsx';
import {
  tryLoadDriveCacheJSON,
  listDriveImagesFast,
  getConfiguredDriveInfo,
} from './services/drive.js';
import {
  loadImageFromURL,
  loadImageFromFile,
  ahashFromImage,
  cropToCanvas,
  hammingDistanceBits,
} from './utils/image.js';

/* ----------------------------- helpers ----------------------------- */

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
const bitsToString = (bits) => bits.join('');
const stringToBits = (s) => Array.from(s, (ch) => (ch === '1' ? 1 : 0));

function extractUrl(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.url ?? item.webContentLink ?? item.thumbnailLink ?? item.webViewLink ?? '';
}
function toLibraryItems(arr) {
  return (arr ?? [])
    .map((it) => {
      const url = extractUrl(it);
      if (!url) return null;
      return { id: it.id ?? uid(), url, name: it.name ?? it.title ?? 'image' };
    })
    .filter(Boolean);
}
function normalizeDriveList(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  return list.images ?? list.files ?? list.items ?? list.list ?? [];
}

/* ------------------------------ app ------------------------------- */

export default function App() {
  // Internal sprite library (not rendered as a grid)
  const [library, setLibrary] = useState([]); // [{id,url,name}]

  // Progress + status
  const [getSpritesProg, setGetSpritesProg] = useState({ stage: 'idle', done: 0, total: 0 });
  const [driveMsg, setDriveMsg] = useState('');

  // Library aHashes cache (url -> bitString). useRef to avoid rerenders
  const libHashesRef = useRef(new Map());
  // Cache for parsed bit arrays to speed up matching (url -> Int8 array of 0/1)
  const libBitsRef = useRef(new Map());

  // Cards
  const [cards, setCards] = useState([]); // [{id,title,rows,cols,tiles:[{url,checked}|null]}]
  const [analyzing, setAnalyzing] = useState(new Set()); // Set<cardId>

  /* --------------------------- persistence --------------------------- */

  // migrate old saves where tile was 'string url' -> {url,checked:false}
  function migrateTiles(tiles, rows, cols) {
    const total = (rows || 5) * (cols || 5);
    const arr = Array.isArray(tiles) ? tiles.slice(0, total) : [];
    const out = Array(total).fill(null);
    for (let i = 0; i < total; i++) {
      const t = arr[i];
      if (!t) { out[i] = null; continue; }
      if (typeof t === 'string') out[i] = { url: t, checked: false };
      else if (t && typeof t === 'object') out[i] = { url: t.url || '', checked: !!t.checked };
      else out[i] = null;
    }
    return out;
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('cards:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        const saved = Array.isArray(parsed.cards) ? parsed.cards : [];
        const migrated = saved.map((c) => ({
          id: c.id || uid(),
          title: c.title || 'Card',
          rows: c.rows || 5,
          cols: c.cols || 5,
          tiles: migrateTiles(c.tiles, c.rows || 5, c.cols || 5),
        }));
        setCards(migrated);
      }
      const rawHashes = localStorage.getItem('lib:ahash');
      if (rawHashes) libHashesRef.current = new Map(Object.entries(JSON.parse(rawHashes)));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('cards:v1', JSON.stringify({ cards })); } catch {}
  }, [cards]);

  /* ----------------------- initial library load ---------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await tryLoadDriveCacheJSON();
        if (!cancelled && cached) {
          const arr = normalizeDriveList(cached);
          const items = toLibraryItems(arr);
          if (items.length) {
            setLibrary(items);
            return;
          }
        }
      } catch {}
      try {
        const arr = normalizeDriveList(await listDriveImagesFast());
        if (!cancelled) setLibrary(toLibraryItems(arr));
      } catch {
        if (!cancelled) setDriveMsg('Drive not available yet. You can still use local screenshots.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ------------------------- get sprites flow ------------------------ */

  async function getSprites() {
    setDriveMsg('');
    setGetSpritesProg({ stage: 'fetching', done: 0, total: 0 });

    try {
      const arr = normalizeDriveList(await listDriveImagesFast());
      const items = toLibraryItems(arr);
      setLibrary(items);
      setDriveMsg(`Fetched ${items.length} sprites (shinies excluded).`);

      // Hash with progress
      setGetSpritesProg({ stage: 'hashing', done: 0, total: items.length });
      const hashes = libHashesRef.current;
      const persisted = Object.fromEntries(hashes);
      let done = 0;

      for (const it of items) {
        if (!hashes.has(it.url)) {
          try {
            const img = await loadImageFromURL(it.url);
            const bits = ahashFromImage(img, 8);
            const bitStr = bitsToString(bits);
            hashes.set(it.url, bitStr);
            persisted[it.url] = bitStr;
          } catch {}
        }
        done++;
        setGetSpritesProg({ stage: 'hashing', done, total: items.length });
        await new Promise((r) => setTimeout(r, 0));
      }
      try { localStorage.setItem('lib:ahash', JSON.stringify(persisted)); } catch {}

      // Build libBits cache (url -> Int8Array of bits) for faster matching
      buildLibBitsCache();

      setGetSpritesProg({ stage: 'done', done: items.length, total: items.length });
      setTimeout(() => setGetSpritesProg({ stage: 'idle', done: 0, total: 0 }), 1000);
    } catch (e) {
      console.error('[GetSprites] failed:', e);
      setDriveMsg('Get Sprites failed. Verify Drive API key/folder & public access.');
      setGetSpritesProg({ stage: 'idle', done: 0, total: 0 });
    }
  }

  function buildLibBitsCache() {
    const hashes = libHashesRef.current;
    const bitsCache = libBitsRef.current;
    for (const [url, bitStr] of hashes.entries()) {
      if (!bitsCache.has(url)) {
        const arr = new Int8Array(bitStr.length);
        for (let i = 0; i < bitStr.length; i++) arr[i] = bitStr[i] === '1' ? 1 : 0;
        bitsCache.set(url, arr);
      }
    }
  }

  async function ensureLibraryHashes() {
    const items = library;
    const hashes = libHashesRef.current;
    const persisted = Object.fromEntries(hashes);
    let missing = 0;
    for (const it of items) if (!hashes.has(it.url)) missing++;
    if (missing === 0) { buildLibBitsCache(); return; }

    setGetSpritesProg({ stage: 'hashing', done: 0, total: items.length });
    let done = 0;
    for (const it of items) {
      if (!hashes.has(it.url)) {
        try {
          const img = await loadImageFromURL(it.url);
          const bits = ahashFromImage(img, 8);
          const bitStr = bitsToString(bits);
          hashes.set(it.url, bitStr);
          persisted[it.url] = bitStr;
        } catch {}
      }
      done++;
      setGetSpritesProg({ stage: 'hashing', done, total: items.length });
      await new Promise((r) => setTimeout(r, 0));
    }
    try { localStorage.setItem('lib:ahash', JSON.stringify(persisted)); } catch {}
    buildLibBitsCache();
    setGetSpritesProg({ stage: 'idle', done: 0, total: 0 });
  }

  /* ------------------------------ cards ------------------------------ */

  function addCard({ title = `Card ${cards.length + 1}`, rows = 5, cols = 5, tiles } = {}) {
    const total = rows * cols;
    const filled =
      Array.isArray(tiles) && tiles.length === total
        ? migrateTiles(tiles, rows, cols)
        : Array(total).fill(null);
    const id = uid();
    setCards((prev) => [...prev, { id, title, rows, cols, tiles: filled }]);
  }

  function removeCard(id) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  function renameCard(id, newTitle) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)));
  }

  function clearCard(id) {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, tiles: Array(c.rows * c.cols).fill(null) } : c
      )
    );
  }

  function toggleCell(id, idx) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const tiles = c.tiles.slice();
        const t = tiles[idx];
        if (!t) return c; // nothing to toggle
        tiles[idx] = { url: t.url, checked: !t.checked };
        return { ...c, tiles };
      })
    );
  }

  /* ----------------------- screenshot analysis ---------------------- */
  /**
   * Enhanced "Fill Card":
   *  - Accepts a whole screenshot (not perfectly cropped)
   *  - Tries multiple auto-crops (margin search)
   *  - For the best crop, divides into rows/cols and matches each cell against library
   *  - Fills relevant cells with best-match sprites (skips if distance > threshold)
   */

  async function analyzeScreenshotForCard(id, file) {
    setAnalyzing((s) => new Set([...s, id]));
    try {
      await ensureLibraryHashes();
      const img = await loadImageFromFile(file);

      const card = cards.find((c) => c.id === id);
      if (!card) return;
      const { rows, cols } = card;

      // Precompute library bit arrays for speed
      const libBits = libBitsRef.current;
      const libList = library
        .map((it) => {
          const bits = libBits.get(it.url);
          return bits ? { url: it.url, bits } : null;
        })
        .filter(Boolean);

      if (libList.length === 0) return;

      // Search some margin percentages to auto-crop the card area
      const margins = [0.00, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.18];
      const innerPad = 0.02; // small inner padding per cell (to avoid borders)

      let best = { score: Infinity, filled: null };

      for (const m of margins) {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const x0 = Math.floor(m * w);
        const y0 = Math.floor(m * h);
        const ww = Math.max(4, Math.floor(w - 2 * x0));
        const hh = Math.max(4, Math.floor(h - 2 * y0));
        const cropped = cropToCanvas(img, x0, y0, ww, hh);

        const result = matchGrid(cropped, rows, cols, libList, innerPad);
        if (result && result.score < best.score) best = result;
      }

      if (best.filled) {
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, tiles: best.filled } : c)));
      }
    } finally {
      setAnalyzing((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  /**
   * Split a cropped canvas into rows/cols (with inner padding),
   * aHash each cell, match against library, return { filled, score }.
   * score = sum of best distances (lower is better).
   */
  function matchGrid(cropped, rows, cols, libList, innerPadFrac = 0.0) {
    const W = cropped.width, H = cropped.height;
    if (!W || !H) return null;

    const cellW = W / cols;
    const cellH = H / rows;
    const padX = Math.floor(cellW * innerPadFrac);
    const padY = Math.floor(cellH * innerPadFrac);

    const filled = Array(rows * cols).fill(null);
    let totalDist = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.max(0, Math.floor(c * cellW + padX));
        const y = Math.max(0, Math.floor(r * cellH + padY));
        const w = Math.max(2, Math.floor(cellW - 2 * padX));
        const h = Math.max(2, Math.floor(cellH - 2 * padY));
        const cellCanvas = cropToCanvas(cropped, x, y, w, h);

        const cellBits = ahashFromImage(cellCanvas, 8); // 64-bit
        let bestUrl = null;
        let bestDist = Infinity;

        for (let i = 0; i < libList.length; i++) {
          const cand = libList[i];
          // Compare against cached bit arrays (fast)
          const d = hammingDistanceBits(cellBits, cand.bits);
          if (d < bestDist) {
            bestDist = d;
            bestUrl = cand.url;
          }
        }

        // Threshold: if too far from any known sprite, leave empty.
        // 64-bit aHash → distances < 12 are usually close; tweak if needed.
        if (bestUrl && bestDist <= 12) {
          filled[r * cols + c] = { url: bestUrl, checked: false };
          totalDist += bestDist;
        } else {
          filled[r * cols + c] = null;
          totalDist += 20; // small penalty for unmatched
        }
      }
    }

    return { filled, score: totalDist };
  }

  /* ------------------------------- UI -------------------------------- */

  const progressPct = (() => {
    const { stage, done, total } = getSpritesProg;
    if (stage === 'idle' || total === 0) return null;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  })();

  return (
    <div style={styles.page}>
      {/* Header: title only */}
      <header style={styles.header}>
        <h1 style={styles.h1}>Nebula Bingo Tracker</h1>
      </header>

      <main style={styles.main}>
        {/* Left: vertical tools (Get Sprites on top, New Card below) */}
        <section style={styles.toolsPane}>
          <button style={styles.btnBlock} onClick={getSprites}>Get Sprites</button>
          <button style={styles.btnBlock} onClick={() => addCard({})}>New Card</button>

          {progressPct !== null && (
            <div style={styles.progressWrap} aria-label="progress">
              <div style={{ ...styles.progressBar, width: `${progressPct}%` }} />
            </div>
          )}
          {!!driveMsg && <div style={styles.driveMsg}>{driveMsg}</div>}
          <div style={styles.smallInfo}>
            Folder: {getConfiguredDriveInfo().folderId?.slice(0, 8) || '(none)'}… • Sprites: {library.length}
          </div>
        </section>

        {/* Right: cards */}
        <section style={styles.cardsPane}>
          <div style={styles.cardsGrid}>
            {cards.map((card) => (
              <div key={card.id} style={styles.cardWrap}>
                <BingoCard
                  id={card.id}
                  title={card.title}
                  rows={card.rows}
                  cols={card.cols}
                  tiles={card.tiles}
                  analyzing={analyzing.has(card.id)}
                  onRename={renameCard}
                  onUploadScreenshot={analyzeScreenshotForCard}
                  onClear={clearCard}
                  onRemove={removeCard}
                  onToggleCell={toggleCell}
                />
              </div>
            ))}
          </div>
          {cards.length === 0 && <div style={styles.emptyCards}>Create a card to get started.</div>}
        </section>
      </main>
    </div>
  );
}

/* ------------------------------ styles ----------------------------- */

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f0f10',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #222',
  },
  h1: { fontSize: '1.15rem', margin: 0, fontWeight: 700 },

  main: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    flex: 1,
    minHeight: 0,
  },

  toolsPane: {
    borderRight: '1px solid #222',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  btnBlock: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    background: '#2b2b2b',
    color: '#fff',
    border: '1px solid #3a3a3a',
    padding: '10px 12px',
    borderRadius: '12px',
    cursor: 'pointer',
  },
  progressWrap: {
    width: '100%',
    height: 8,
    background: '#1b1b1b',
    border: '1px solid #2a2a2a',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: { height: '100%', background: '#4e7cff' },
  driveMsg: { color: '#9bb4ff', fontSize: 12 },
  smallInfo: { color: '#aaa', fontSize: 12 },

  cardsPane: { padding: '12px', minWidth: 0 },
  cardsGrid: {
    display: 'grid',
    gap: '12px',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  },
  cardWrap: {
    borderRadius: '18px',
    border: '1px solid #2a2a2a',
    background: '#141414',
  },
  emptyCards: { color: '#aaa', padding: '12px' },
};
