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

/* ============================ TUNING ============================ */
const MATCH = {
  WEIGHTS: { a: 0.5, dx: 0.25, dy: 0.25 },
  ABS_THRESH: 28,             // accept if weighted score <= this (stricter -> lower)
  MIN_GAP: 3,                 // best must beat #2 by at least this many points
  PAD_FRAC: 0.12,             // shrink each detected cell by this fraction (avoid grid lines)
  FALLBACK_PADS: [0.05, 0.08, 0.12, 0.15], // used when grid detection fails
};
const DEFAULT_ROWS = 5;
const DEFAULT_COLS = 5;

/* ======================== small helpers ========================= */
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

/* ===================== grid detection helpers ==================== */
function toGrayImageData(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const cvs = document.createElement('canvas');
  cvs.width = w; cvs.height = h;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { w, h, g };
}
function projColsEdge({ w, h, g }) {
  const col = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w - 1; x++) col[x] += Math.abs(g[off + x + 1] - g[off + x]);
  }
  return col;
}
function projRowsEdge({ w, h, g }) {
  const row = new Float32Array(h);
  for (let y = 0; y < h - 1; y++) {
    const o1 = y * w, o2 = (y + 1) * w;
    for (let x = 0; x < w; x++) row[y] += Math.abs(g[o2 + x] - g[o1 + x]);
  }
  return row;
}
function smooth1D(arr, radius = 4) {
  const n = arr.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const L = Math.max(0, i - radius);
    const R = Math.min(n - 1, i + radius);
    let s = 0;
    for (let k = L; k <= R; k++) s += arr[k];
    out[i] = s / (R - L + 1);
  }
  return out;
}
function peakIndices(arr, count, minSep) {
  const idx = Array.from({ length: arr.length }, (_, i) => i);
  idx.sort((a, b) => arr[b] - arr[a]);
  const keep = [];
  outer: for (const i of idx) {
    for (const j of keep) if (Math.abs(i - j) < minSep) continue outer;
    keep.push(i);
    if (keep.length === count) break;
  }
  keep.sort((a, b) => a - b);
  return keep;
}
function detectGridLines(img, rows, cols) {
  const gi = toGrayImageData(img);
  const colProj = smooth1D(projColsEdge(gi), 4);
  const rowProj = smooth1D(projRowsEdge(gi), 4);
  const wantX = cols + 1;
  const wantY = rows + 1;
  const minSepX = Math.floor((gi.w / cols) * 0.6);
  const minSepY = Math.floor((gi.h / rows) * 0.6);
  const xs = peakIndices(colProj, wantX, Math.max(4, minSepX));
  const ys = peakIndices(rowProj, wantY, Math.max(4, minSepY));
  if (xs.length !== wantX || ys.length !== wantY) return null;
  const avgDx = (xs[xs.length - 1] - xs[0]) / cols;
  const avgDy = (ys[ys.length - 1] - ys[0]) / rows;
  if (!(avgDx > 8 && avgDy > 8)) return null;
  return { xs, ys, w: gi.w, h: gi.h };
}
function boxesFromLines(img, lines, rows, cols, padFrac = 0.06) {
  const boxes = [];
  for (let r = 0; r < rows; r++) {
    const y0 = lines.ys[r];
    const y1 = lines.ys[r + 1];
    for (let c = 0; c < cols; c++) {
      const x0 = lines.xs[c];
      const x1 = lines.xs[c + 1];
      const cw = Math.max(2, x1 - x0);
      const ch = Math.max(2, y1 - y0);
      const padX = Math.floor(cw * padFrac);
      const padY = Math.floor(ch * padFrac);
      boxes.push({
        x: x0 + padX,
        y: y0 + padY,
        w: Math.max(2, cw - 2 * padX),
        h: Math.max(2, ch - 2 * padY),
      });
    }
  }
  return boxes;
}

/* ============================ component ============================ */
export default function App() {
  // Library loaded from manifest
  const [library, setLibrary] = useState([]); // [{id,url,name}]

  // Indexing progress + status
  const [indexProg, setIndexProg] = useState({ stage: 'idle', done: 0, total: 0 });
  const [statusMsg, setStatusMsg] = useState('');

  // Hash caches (url -> bitString)
  const libARef  = useRef(new Map());
  const libDXRef = useRef(new Map());
  const libDYRef = useRef(new Map());

  // Fast bit arrays (url -> Int8Array)
  const aBitsRef  = useRef(new Map());
  const dxBitsRef = useRef(new Map());
  const dyBitsRef = useRef(new Map());

  // Cards
  const [cards, setCards] = useState([]);
  const [analyzing, setAnalyzing] = useState(new Set());

  // Debug overlay
  const [debug, setDebug] = useState(false);
  const [lastDebug, setLastDebug] = useState(null); // {url, lines:{xs,ys,w,h}}; revokes old URL

  /* ----------------------- persistence ----------------------- */
  function migrateTiles(tiles, rows, cols) {
    const total = (rows || DEFAULT_ROWS) * (cols || DEFAULT_COLS);
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
          rows: c.rows || DEFAULT_ROWS,
          cols: c.cols || DEFAULT_COLS,
          tiles: migrateTiles(c.tiles, c.rows || DEFAULT_ROWS, c.cols || DEFAULT_COLS),
        }));
        setCards(migrated);
      }
      const rawA = localStorage.getItem('lib:ahash');
      const rawDX = localStorage.getItem('lib:dhashx');
      const rawDY = localStorage.getItem('lib:dhashy');
      if (rawA)  libARef.current  = new Map(Object.entries(JSON.parse(rawA)));
      if (rawDX) libDXRef.current = new Map(Object.entries(JSON.parse(rawDX)));
      if (rawDY) libDYRef.current = new Map(Object.entries(JSON.parse(rawDY)));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('cards:v1', JSON.stringify({ cards })); } catch {}
  }, [cards]);

  /* ------------------- load library (manifest) ------------------- */
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

  /* ----------------------- hashing/indexing ---------------------- */
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
          const sa  = bitsToString(a);
          const sdx = bitsToString(dx);
          const sdy = bitsToString(dy);
          A.set(url, sa);   persistedA[url]  = sa;
          DX.set(url, sdx); persistedDX[url] = sdx;
          DY.set(url, sdy); persistedDY[url] = sdy;
        } catch {
          // ignore individual failures
        }
      }
      done++;
      setIndexProg({ stage: 'hashing', done, total: items.length });
      await new Promise((r) => setTimeout(r, 0));
    }

    try {
      localStorage.setItem('lib:ahash',  JSON.stringify(persistedA));
      localStorage.setItem('lib:dhashx', JSON.stringify(persistedDX));
      localStorage.setItem('lib:dhashy', JSON.stringify(persistedDY));
    } catch {}

    buildBitCaches();
    setIndexProg({ stage: 'idle', done: 0, total: 0 });
  }
  function buildBitCaches() {
    const AB = aBitsRef.current, DXB = dxBitsRef.current, DYB = dyBitsRef.current;
    for (const [url, str] of libARef.current)  if (!AB.has(url))  AB.set(url,  parseBits(str));
    for (const [url, str] of libDXRef.current) if (!DXB.has(url)) DXB.set(url, parseBits(str));
    for (const [url, str] of libDYRef.current) if (!DYB.has(url)) DYB.set(url, parseBits(str));
  }
  async function ensureLibraryHashes() {
    if (aBitsRef.current.size > 0) return;
    if (library.length === 0) return;
    await indexSprites(library);
  }

  /* ---------------------------- cards ---------------------------- */
  function addCard({ title = `Card ${cards.length + 1}`, rows = DEFAULT_ROWS, cols = DEFAULT_COLS, tiles } = {}) {
    const total = rows * cols;
    const filled =
      Array.isArray(tiles) && tiles.length === total
        ? migrateTiles(tiles, rows, cols)
        : Array(total).fill(null);
    setCards((prev) => [...prev, { id: uid(), title, rows, cols, tiles: filled }]);
  }
  function removeCard(id) { setCards((p) => p.filter((c) => c.id !== id)); }
  function renameCard(id, newTitle) { setCards((p) => p.map((c) => (c.id === id ? { ...c, title: newTitle } : c))); }
  function clearCard(id) {
    setCards((p) => p.map((c) => (c.id === id ? { ...c, tiles: Array(c.rows * c.cols).fill(null) } : c)));
  }
  function toggleCell(id, idx) {
    setCards((p) =>
      p.map((c) => {
        if (c.id !== id) return c;
        const tiles = c.tiles.slice();
        const t = tiles[idx];
        if (!t) return c;
        tiles[idx] = { url: t.url, checked: !t.checked };
        return { ...c, tiles };
      })
    );
  }

  /* -------------------- screenshot analysis --------------------- */
  async function analyzeScreenshotForCard(id, file) {
    setAnalyzing((s) => new Set([...s, id]));
    try {
      await ensureLibraryHashes();
      const img = await loadImageFromFile(file);

      const card = cards.find((c) => c.id === id);
      if (!card) return;
      const { rows, cols } = card;

      // prepare library bit arrays
      const list = library.map((it) => ({
        url: it.url,
        a: aBitsRef.current.get(it.url),
        dx: dxBitsRef.current.get(it.url),
        dy: dyBitsRef.current.get(it.url),
      })).filter((v) => v.a && v.dx && v.dy);
      if (list.length === 0) return;

      // Keep preview of uploaded image + lines if debugging
      if (lastDebug?.url) URL.revokeObjectURL(lastDebug.url);
      const previewURL = URL.createObjectURL(file);

      // 1) try grid-line detection
      let boxes = null;
      const lines = detectGridLines(img, rows, cols);
      if (lines) boxes = boxesFromLines(img, lines, rows, cols, MATCH.PAD_FRAC);

      if (debug) {
        console.log('DEBUG: lib sizes', {
          lib: library.length,
          aBits: aBitsRef.current.size,
          dxBits: dxBitsRef.current.size,
          dyBits: dyBitsRef.current.size,
          linesDetected: !!lines,
        });
        setLastDebug(lines ? { url: previewURL, lines, rows, cols } : { url: previewURL, lines: null, rows, cols });
      } else {
        URL.revokeObjectURL(previewURL);
      }

      // 2) fallback to margin/pad search if no lines
      if (!boxes) {
        const margins = [0.00, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12];
        let best = { score: Infinity, filled: null };
        for (const m of margins) {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          const x0 = Math.floor(m * w);
          const y0 = Math.floor(m * h);
          const ww = Math.max(4, Math.floor(w - 2 * x0));
          const hh = Math.max(4, Math.floor(h - 2 * y0));
          const cropped = cropToCanvas(img, x0, y0, ww, hh);
          for (const pad of MATCH.FALLBACK_PADS) {
            const res = matchGrid(cropped, rows, cols, list, pad, debug);
            if (res && res.score < best.score) best = res;
          }
        }
        if (best.filled) {
          setCards((p) => p.map((c) => (c.id === id ? { ...c, tiles: best.filled } : c)));
        }
        return;
      }

      // 3) with exact boxes, crop & match strictly
      const filled = Array(rows * cols).fill(null);
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        const cell = cropToCanvas(img, b.x, b.y, b.w, b.h);

        const a  = ahashFromImage(cell, 8);
        const dx = dhashFromImage(cell, 8, 'x');
        const dy = dhashFromImage(cell, 8, 'y');

        let bestUrl = null, bestScore = Infinity, second = Infinity;

        for (let k = 0; k < list.length; k++) {
          const cand = list[k];
          const dA = hammingDistanceBits(a,  cand.a);
          const dX = hammingDistanceBits(dx, cand.dx);
          const dY = hammingDistanceBits(dy, cand.dy);
          const score = MATCH.WEIGHTS.a * dA + MATCH.WEIGHTS.dx * dX + MATCH.WEIGHTS.dy * dY;

          if (score < bestScore) { second = bestScore; bestScore = score; bestUrl = cand.url; }
          else if (score < second) { second = score; }
        }

        if (debug) console.log(`cell ${i}: best=${bestScore.toFixed(1)} second=${second.toFixed(1)} url=${bestUrl}`);

        if (bestUrl && bestScore <= MATCH.ABS_THRESH && (second - bestScore) >= MATCH.MIN_GAP) {
          filled[i] = { url: bestUrl, checked: false };
        } else {
          filled[i] = null;
        }
      }

      setCards((p) => p.map((c) => (c.id === id ? { ...c, tiles: filled } : c)));
    } finally {
      setAnalyzing((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  // fallback matcher used when grid detection fails
  function matchGrid(cropped, rows, cols, libList, innerPadFrac = 0.0, debugLog = false) {
    const W = cropped.width, H = cropped.height;
    if (!W || !H) return null;

    const cellW = W / cols;
    const cellH = H / rows;
    const padX = Math.floor(cellW * innerPadFrac);
    const padY = Math.floor(cellH * innerPadFrac);

    const filled = Array(rows * cols).fill(null);
    let totalScore = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.max(0, Math.floor(c * cellW + padX));
        const y = Math.max(0, Math.floor(r * cellH + padY));
        const w = Math.max(2, Math.floor(cellW - 2 * padX));
        const h = Math.max(2, Math.floor(cellH - 2 * padY));
        const cell = cropToCanvas(cropped, x, y, w, h);

        const a  = ahashFromImage(cell, 8);
        const dx = dhashFromImage(cell, 8, 'x');
        const dy = dhashFromImage(cell, 8, 'y');

        let bestUrl = null, bestScore = Infinity, second = Infinity;

        for (let i = 0; i < libList.length; i++) {
          const cand = libList[i];
          const dA = hammingDistanceBits(a,  cand.a);
          const dX = hammingDistanceBits(dx, cand.dx);
          const dY = hammingDistanceBits(dy, cand.dy);
          const score = MATCH.WEIGHTS.a * dA + MATCH.WEIGHTS.dx * dX + MATCH.WEIGHTS.dy * dY;

          if (score < bestScore) { second = bestScore; bestScore = score; bestUrl = cand.url; }
          else if (score < second) { second = score; }
        }

        if (debugLog) console.log(`cell r${r}c${c}: best=${bestScore.toFixed(1)} second=${second.toFixed(1)}`);

        if (bestUrl && bestScore <= MATCH.ABS_THRESH && (second - bestScore) >= MATCH.MIN_GAP) {
          filled[r * cols + c] = { url: bestUrl, checked: false };
          totalScore += bestScore;
        } else {
          filled[r * cols + c] = null;
          totalScore += 25;
        }
      }
    }
    return { filled, score: totalScore };
  }

  /* ------------------------------ UI ------------------------------ */
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
        {/* Left tools */}
        <section style={styles.toolsPane}>
          <button style={styles.btnBlock} onClick={() => addCard({})}>New Card</button>

          {progressPct !== null && (
            <div style={styles.progressWrap} aria-label="indexing progress">
              <div style={{ ...styles.progressBar, width: `${progressPct}%` }} />
            </div>
          )}
          {!!statusMsg && <div style={styles.statusMsg}>{statusMsg}</div>}
          <div style={styles.smallInfo}>
            Sprites: {library.length}
          </div>

          <label style={styles.debugRow}>
            <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
            <span style={{ marginLeft: 6 }}>Debug logs & overlay</span>
          </label>
        </section>

        {/* Cards */}
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

      {/* Debug overlay */}
      {debug && lastDebug?.url && lastDebug.lines && (
        <div style={styles.overlay}>
          <div style={styles.overlayInner}>
            <img
              src={lastDebug.url}
              alt="debug"
              style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain' }}
            />
            {/* simple grid drawn on top */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {/* we draw nothing precise here since image scales; logs show exact pixels */}
            </div>
            <div style={styles.overlayNote}>
              Grid detected • xs: {lastDebug.lines.xs.length} • ys: {lastDebug.lines.ys.length}
            </div>
          </div>
        </div>
      )}
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
  debugRow: { display: 'flex', alignItems: 'center', fontSize: 13, color: '#ccc', marginTop: 6 },

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

  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(0,0,0,0.6)',
    zIndex: 50,
  },
  overlayInner: {
    position: 'relative',
    padding: 8,
    background: '#111',
    border: '1px solid #333',
    borderRadius: 12,
  },
  overlayNote: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    fontSize: 12,
    color: '#ccc',
    background: 'rgba(0,0,0,0.4)',
    padding: '2px 6px',
    borderRadius: 6,
  },
};
