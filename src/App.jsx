import React, { useEffect, useRef, useState } from 'react';
import BingoCard from './components/BingoCard.jsx';
import { tryLoadDriveCacheJSON } from './services/drive.js';
import {
  loadImageFromURL,
  loadImageFromFile,
  ahashFromImage,
  dhashFromImage,
  cropToCanvas,
  hammingDistanceBits,
} from './utils/image.js';

/* ----------------------------- helpers ----------------------------- */

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
const bitsToString = (bits) => bits.join('');
const parseBits = (s) => {
  const arr = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s[i] === '1' ? 1 : 0;
  return arr;
};

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
  // Loaded from manifest
  const [library, setLibrary] = useState([]); // [{id,url,name}]
  const [indexProg, setIndexProg] = useState({ stage: 'idle', done: 0, total: 0 });
  const [statusMsg, setStatusMsg] = useState('');

  // Hash caches (url -> bitString)
  const libARef = useRef(new Map());
  const libDXRef = useRef(new Map());
  const libDYRef = useRef(new Map());

  // Fast bit arrays (url -> Int8Array)
  const aBitsRef = useRef(new Map());
  const dxBitsRef = useRef(new Map());
  const dyBitsRef = useRef(new Map());

  // Cards
  const [cards, setCards] = useState([]); // tiles: {url, checked} | null
  const [analyzing, setAnalyzing] = useState(new Set());

  /* --------------------------- persistence --------------------------- */

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
      const rawA = localStorage.getItem('lib:ahash');
      const rawDX = localStorage.getItem('lib:dhashx');
      const rawDY = localStorage.getItem('lib:dhashy');
      if (rawA) libARef.current = new Map(Object.entries(JSON.parse(rawA)));
      if (rawDX) libDXRef.current = new Map(Object.entries(JSON.parse(rawDX)));
      if (rawDY) libDYRef.current = new Map(Object.entries(JSON.parse(rawDY)));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('cards:v1', JSON.stringify({ cards })); } catch {}
  }, [cards]);

  /* ----------------------- load library from cache ------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await tryLoadDriveCacheJSON();
        const arr = normalizeDriveList(cached);
        const items = toLibraryItems(arr);
        if (!cancelled) {
          setLibrary(items);
          setStatusMsg(
            items.length
              ? `Loaded ${items.length} sprites from manifest.`
              : 'No sprites found in /public/drive_cache.json.'
          );
          if (items.length) await indexSprites(items);
        }
      } catch {
        if (!cancelled) setStatusMsg('Could not load sprite manifest.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* -------------------------- hashing/indexing ----------------------- */

  async function indexSprites(items) {
    const A = libARef.current, DX = libDXRef.current, DY = libDYRef.current;
    const persistedA = Object.fromEntries(A);
    const persistedDX = Object.fromEntries(DX);
    const persistedDY = Object.fromEntries(DY);

    setIndexProg({ stage: 'hashing', done: 0, total: items.length });
    let done = 0;

    for (const it of items) {
      const url = it.url;
      if (!A.has(url) || !DX.has(url) || !DY.has(url)) {
        try {
          const img = await loadImageFromURL(url);
          const a = ahashFromImage(img, 8);
          const dx = dhashFromImage(img, 8, 'x');
          const dy = dhashFromImage(img, 8, 'y');
          const sa = bitsToString(a);
          const sdx = bitsToString(dx);
          const sdy = bitsToString(dy);
          A.set(url, sa); persistedA[url] = sa;
          DX.set(url, sdx); persistedDX[url] = sdx;
          DY.set(url, sdy); persistedDY[url] = sdy;
        } catch {
          // ignore failures for individual URLs
        }
      }
      done++;
      setIndexProg({ stage: 'hashing', done, total: items.length });
      await new Promise((r) => setTimeout(r, 0));
    }

    try {
      localStorage.setItem('lib:ahash', JSON.stringify(persistedA));
      localStorage.setItem('lib:dhashx', JSON.stringify(persistedDX));
      localStorage.setItem('lib:dhashy', JSON.stringify(persistedDY));
    } catch {}

    // Build fast Int8 caches
    buildBitCaches();
    setIndexProg({ stage: 'idle', done: 0, total: 0 });
  }

  function buildBitCaches() {
    const AB = aBitsRef.current, DXB = dxBitsRef.current, DYB = dyBitsRef.current;
    for (const [url, str] of libARef.current) if (!AB.has(url)) AB.set(url, parseBits(str));
    for (const [url, str] of libDXRef.current) if (!DXB.has(url)) DXB.set(url, parseBits(str));
    for (const [url, str] of libDYRef.current) if (!DYB.has(url)) DYB.set(url, parseBits(str));
  }

  async function ensureLibraryHashes() {
    if (aBitsRef.current.size > 0) return;
    if (library.length === 0) return;
    await indexSprites(library);
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
        if (!t) return c;
        tiles[idx] = { url: t.url, checked: !t.checked };
        return { ...c, tiles };
      })
    );
  }

  /* ----------------------- screenshot analysis ---------------------- */

  async function analyzeScreenshotForCard(id, file) {
    setAnalyzing((s) => new Set([...s, id]));
    try {
      await ensureLibraryHashes();
      const img = await loadImageFromFile(file);

      const card = cards.find((c) => c.id === id);
      if (!card) return;
      const { rows, cols } = card;

      // Prepare library list with bit arrays (skip missing)
      const list = library.map((it) => ({
        url: it.url,
        a: aBitsRef.current.get(it.url),
        dx: dxBitsRef.current.get(it.url),
        dy: dyBitsRef.current.get(it.url),
      })).filter((v) => v.a && v.dx && v.dy);

      if (list.length === 0) return;

      const margins = [0.00, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12];
      const innerPads = [0.02, 0.05, 0.08]; // try a few inner paddings

      let best = { score: Infinity, filled: null };

      for (const m of margins) {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const x0 = Math.floor(m * w);
        const y0 = Math.floor(m * h);
        const ww = Math.max(4, Math.floor(w - 2 * x0));
        const hh = Math.max(4, Math.floor(h - 2 * y0));
        const cropped = cropToCanvas(img, x0, y0, ww, hh);

        for (const pad of innerPads) {
          const result = matchGrid(cropped, rows, cols, list, pad);
          if (result && result.score < best.score) best = result;
        }
      }

      if (best.filled) {
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, tiles: best.filled } : c)));
      }
    } finally {
      setAnalyzing((s) => {
        const n = new Set(s); n.delete(id); return n;
      });
    }
  }

  /**
   * Split a cropped canvas into rows/cols, hash each cell with aHash+dHashX+dHashY,
   * and pick the library sprite minimizing the weighted distance.
   * Uses strict acceptance: both absolute threshold and margin over #2.
   */
  function matchGrid(cropped, rows, cols, libList, innerPadFrac = 0.0) {
    const W = cropped.width, H = cropped.height;
    if (!W || !H) return null;

    const cellW = W / cols;
    const cellH = H / rows;
    const padX = Math.floor(cellW * innerPadFrac);
    const padY = Math.floor(cellH * innerPadFrac);

    const filled = Array(rows * cols).fill(null);
    let totalScore = 0;

    // Tunables
    const WEIGHTS = { a: 0.5, dx: 0.25, dy: 0.25 };
    const ABS_THRESH = 22;     // combined distance must be <= this (0..64)
    const MIN_GAP = 4;         // best must beat #2 by at least this

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.max(0, Math.floor(c * cellW + padX));
        const y = Math.max(0, Math.floor(r * cellH + padY));
        const w = Math.max(2, Math.floor(cellW - 2 * padX));
        const h = Math.max(2, Math.floor(cellH - 2 * padY));
        const cell = cropToCanvas(cropped, x, y, w, h);

        const a = ahashFromImage(cell, 8);
        const dx = dhashFromImage(cell, 8, 'x');
        const dy = dhashFromImage(cell, 8, 'y');

        let bestUrl = null;
        let bestScore = Infinity;
        let second = Infinity;

        for (let i = 0; i < libList.length; i++) {
          const cand = libList[i];
          const dA  = hammingDistanceBits(a,  cand.a);
          const dX  = hammingDistanceBits(dx, cand.dx);
          const dY  = hammingDistanceBits(dy, cand.dy);
          const score = WEIGHTS.a * dA + WEIGHTS.dx * dX + WEIGHTS.dy * dY;

          if (score < bestScore) {
            second = bestScore;
            bestScore = score;
            bestUrl = cand.url;
          } else if (score < second) {
            second = score;
          }
        }

        // Strict acceptance: absolute threshold AND margin to #2
        if (bestUrl && bestScore <= ABS_THRESH && (second - bestScore) >= MIN_GAP) {
          filled[r * cols + c] = { url: bestUrl, checked: false };
          totalScore += bestScore;
        } else {
          filled[r * cols + c] = null;
          totalScore += 25; // penalty
        }
      }
    }

    return { filled, score: totalScore };
  }

  /* ------------------------------- UI -------------------------------- */

  const progressPct = (() => {
    const { stage, done, total } = indexProg;
    if (stage === 'idle' || total === 0) return null;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  })();

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Nebula Bingo Tracker</h1>
      </header>

      <main style={styles.main}>
        <section style={styles.toolsPane}>
          <button style={styles.btnBlock} onClick={() => addCard({})}>New Card</button>

          {progressPct !== null && (
            <div style={styles.progressWrap} aria-label="indexing progress">
              <div style={{ ...styles.progressBar, width: `${progressPct}%` }} />
            </div>
          )}
          {!!statusMsg && <div style={styles.statusMsg}>{statusMsg}</div>}
          <div style={styles.smallInfo}>Sprites: {library.length}</div>
        </section>

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
                  onRename={(id, t) => renameCard(id, t)}
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
  statusMsg: { color: '#9bb4ff', fontSize: 12 },
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
