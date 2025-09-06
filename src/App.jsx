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

  // Cards
  const [cards, setCards] = useState([]); // [{id,title,rows,cols,tiles:[{url,checked}|null]}]
  const [analyzing, setAnalyzing] = useState(new Set()); // Set<cardId>

  /* --------------------------- persistence --------------------------- */

  // migrate old saves where tile was 'string url' -> {url,checked:false}
  function migrateTiles(tiles, rows, cols) {
    const total = rows * cols;
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

      setGetSpritesProg({ stage: 'done', done: items.length, total: items.length });
      setTimeout(() => setGetSpritesProg({ stage: 'idle', done: 0, total: 0 }), 1000);
    } catch (e) {
      console.error('[GetSprites] failed:', e);
      setDriveMsg('Get Sprites failed. Verify Drive API key/folder & public access.');
      setGetSpritesProg({ stage: 'idle', done: 0, total: 0 });
    }
  }

  async function ensureLibraryHashes() {
    const items = library;
    const hashes = libHashesRef.current;
    const persisted = Object.fromEntries(hashes);
    let missing = 0;
    for (const it of items) if (!hashes.has(it.url)) missing++;
    if (missing === 0) return;

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

  async function analyzeScreenshotForCard(id, file) {
    setAnalyzing((s) => new Set([...s, id]));
    try {
      await ensureLibraryHashes();
      const img = await loadImageFromFile(file);

      const card = cards.find((c) => c.id === id);
      if (!card) return;
      const { rows, cols } = card;

      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const cellW = width / cols;
      const cellH = height / rows;

      const nextTiles = Array(rows * cols).fill(null);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = Math.floor(c * cellW);
          const y = Math.floor(r * cellH);
          const w = Math.floor(cellW);
          const h = Math.floor(cellH);
          const cellCanvas = cropToCanvas(img, x, y, w, h);

          const cellBits = ahashFromImage(cellCanvas, 8);

          let bestUrl = null;
          let bestDist = Infinity;
          for (const it of library) {
            const bitStr = libHashesRef.current.get(it.url);
            if (!bitStr) continue;
            const refBits = stringToBits(bitStr);
            const d = hammingDistanceBits(cellBits, refBits);
            if (d < bestDist) {
              bestDist = d;
              bestUrl = it.url;
            }
          }

          if (bestUrl) nextTiles[r * cols + c] = { url: bestUrl, checked: false };
        }
      }

      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, tiles: nextTiles } : c)));
    } finally {
      setAnalyzing((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
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
        {/* Left: tools */}
        <section style={styles.toolsPane}>
          <div style={styles.toolbarRow}>
            <button style={styles.btn} onClick={getSprites}>Get Sprites</button>
            <button style={styles.btn} onClick={() => addCard({})}>New Card</button>
          </div>
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
  toolbarRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  btn: {
    background: '#2b2b2b',
    color: '#fff',
    border: '1px solid #3a3a3a',
    padding: '8px 12px',
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
