// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import BingoCard from './components/BingoCard.jsx';
import { tryLoadDriveCacheJSON, listDriveImagesFast } from './services/drive.js';
import { loadImageFromURL, loadImageFromFile, ahashFromImage, cropToCanvas, hammingDistanceBits } from './utils/image.js';

// --- Hardcoded config (replace with your real values or env) ---
const DRIVE_FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID';
const GOOGLE_API_KEY  = 'YOUR_GOOGLE_API_KEY';

// ---------- Helper utils ----------
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
const stem = (nameOrUrl = '') =>
  (nameOrUrl.split('/').pop() || '').toLowerCase().replace(/\.[a-z0-9]+(?:\?.*)?$/, '');

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

// ---------- App ----------
export default function App() {
  // Library + search
  const [library, setLibrary] = useState([]); // [{id,url,name}]
  const [libQuery, setLibQuery] = useState('');

  // Drive-only progress (for "Get Sprites")
  const [getSpritesProg, setGetSpritesProg] = useState({ stage: 'idle', done: 0, total: 0 }); // stage: idle|fetching|hashing|done

  // Name index (filename stem -> url)
  const [refIndex, setRefIndex] = useState({ count: 0, byName: new Map() });

  // Library aHashes (url -> bitString). UseRef to avoid heavy rerenders
  const libHashesRef = useRef(new Map()); // Map<string, string>

  // Cards + active + per-card analysis flag
  const [cards, setCards] = useState([]); // [{id,title,rows,cols,tiles}]
  const [activeId, setActiveId] = useState(null);
  const [analyzing, setAnalyzing] = useState(new Set()); // Set<cardId>

  // ---------- Persistence ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem('cards:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.cards)) setCards(parsed.cards);
        if (parsed.activeId) setActiveId(parsed.activeId);
      }
      const rawIdx = localStorage.getItem('refIndex:names');
      if (rawIdx) {
        const obj = JSON.parse(rawIdx);
        const m = new Map(obj.byName || []);
        setRefIndex({ count: obj.count || m.size, byName: m });
      }
      const rawHashes = localStorage.getItem('lib:ahash');
      if (rawHashes) {
        const obj = JSON.parse(rawHashes);
        const m = new Map(Object.entries(obj)); // url -> bitString
        libHashesRef.current = m;
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cards:v1', JSON.stringify({ cards, activeId }));
    } catch {}
  }, [cards, activeId]);

  // ---------- Initial library load (cache → live fallback) ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await tryLoadDriveCacheJSON();
        if (!cancelled && cached) {
          const arr = cached.images ?? cached.files ?? cached.items ?? cached.list ?? cached;
          const items = toLibraryItems(arr);
          if (items.length) {
            setLibrary(items);
            // don’t hash here; user will click Get Sprites for a fresh pass anyway
            return;
          }
        }
      } catch { /* ignore */ }

      try {
        let list;
        try {
          list = await listDriveImagesFast(GOOGLE_API_KEY, DRIVE_FOLDER_ID);
        } catch {
          list = await listDriveImagesFast({ apiKey: GOOGLE_API_KEY, folderId: DRIVE_FOLDER_ID });
        }
        if (!cancelled && list) {
          const arr = list.images ?? list.files ?? list.items ?? list.list ?? list;
          setLibrary(toLibraryItems(arr));
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---------- Get Sprites (Drive-only, with progress bar) ----------
  async function getSprites() {
    setGetSpritesProg({ stage: 'fetching', done: 0, total: 0 });
    // 1) fetch
    let arr = [];
    try {
      let list;
      try {
        list = await listDriveImagesFast(GOOGLE_API_KEY, DRIVE_FOLDER_ID);
      } catch {
        list = await listDriveImagesFast({ apiKey: GOOGLE_API_KEY, folderId: DRIVE_FOLDER_ID });
      }
      arr = list?.images ?? list?.files ?? list?.items ?? list?.list ?? list ?? [];
    } catch {
      arr = [];
    }
    const items = toLibraryItems(arr);
    setLibrary(items);

    // 2) build name index
    const byName = new Map();
    for (const it of items) {
      const key = stem(it.name || it.url);
      if (key) byName.set(key, it.url);
    }
    setRefIndex({ count: byName.size, byName });
    try {
      localStorage.setItem('refIndex:names', JSON.stringify({ count: byName.size, byName: Array.from(byName.entries()) }));
    } catch {}

    // 3) compute aHash for library (with progress)
    setGetSpritesProg({ stage: 'hashing', done: 0, total: items.length });
    const hashes = libHashesRef.current;
    let done = 0;

    // Persisted hash cache
    const persisted = Object.fromEntries(hashes);

    for (const it of items) {
      if (!hashes.has(it.url)) {
        try {
          const img = await loadImageFromURL(it.url);
          const bits = ahashFromImage(img, 8); // 8x8 aHash → 64 bits
          const bitStr = bitsToString(bits);
          hashes.set(it.url, bitStr);
          persisted[it.url] = bitStr;
        } catch {
          // keep missing
        }
      }
      done++;
      setGetSpritesProg({ stage: 'hashing', done, total: items.length });
      // yield to UI
      await new Promise((r) => setTimeout(r, 0));
    }

    try { localStorage.setItem('lib:ahash', JSON.stringify(persisted)); } catch {}
    setGetSpritesProg({ stage: 'done', done: items.length, total: items.length });
    // auto-clear "done" after a moment
    setTimeout(() => setGetSpritesProg({ stage: 'idle', done: 0, total: 0 }), 1200);
  }

  // ---------- Derived: filtered library ----------
  const filteredLibrary = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    if (!q) return library;
    return library.filter((it) => it.name?.toLowerCase().includes(q) || it.url?.toLowerCase().includes(q));
  }, [library, libQuery]);

  // ---------- Card ops ----------
  function addCard({ title = `Card ${cards.length + 1}`, rows = 5, cols = 5, tiles } = {}) {
    const total = rows * cols;
    const filled = Array.isArray(tiles) && tiles.length === total ? tiles : Array(total).fill(null);
    const id = uid();
    const card = { id, title, rows, cols, tiles: filled };
    setCards((prev) => [...prev, card]);
    setActiveId(id);
  }
  function removeCard(id) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      const remaining = cards.filter((c) => c.id !== id);
      setActiveId(remaining[0]?.id ?? null);
    }
  }
  function renameCard(id, newTitle) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)));
  }
  function addTileToActive(url) {
    if (!activeId) return;
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== activeId) return c;
        const next = c.tiles.slice();
        const emptyIdx = next.findIndex((t) => !t);
        if (emptyIdx !== -1) next[emptyIdx] = url;
        else next[next.length - 1] = url;
        return { ...c, tiles: next };
      })
    );
  }
  function clearActiveCard() {
    if (!activeId) return;
    setCards((prev) => prev.map((c) => (c.id === activeId ? { ...c, tiles: Array(c.rows * c.cols).fill(null) } : c)));
  }
  function autofillActiveFromLibrary() {
    if (!activeId || filteredLibrary.length === 0) return;
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== activeId) return c;
        const total = c.rows * c.cols;
        const picked = filteredLibrary.slice(0, total).map((it) => it.url);
        const filled = picked.length === total ? picked : picked.concat(Array(total - picked.length).fill(null));
        return { ...c, tiles: filled };
      })
    );
  }
  function onBuiltPNG({ id, dataURL }) {
    try { localStorage.setItem(`card:${id}:png`, dataURL); } catch {}
  }

  // ---------- Screenshot analysis ----------
  async function analyzeScreenshotForCard(id, file) {
    // mark analyzing
    setAnalyzing((s) => new Set([...s, id]));
    try {
      // ensure library hashes exist
      await ensureLibraryHashes();

      // load screenshot
      const img = await loadImageFromFile(file);

      // get card spec
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      const { rows, cols } = card;

      // slice the screenshot evenly into rows x cols
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

          // hash the cell
          const cellBits = ahashFromImage(cellCanvas, 8);

          // find best match in library using hamming distance
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

          // thresholding (optional): require at least some similarity
          // 64-bit aHash -> typical good matches under ~20
          if (bestUrl /* && bestDist <= 22 */) {
            nextTiles[r * cols + c] = bestUrl;
          }
        }
      }

      // update card tiles
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, tiles: nextTiles } : c)));
    } finally {
      setAnalyzing((s) => {
        const n = new Set(s); n.delete(id); return n;
      });
    }
  }

  async function ensureLibraryHashes() {
    const items = library;
    const hashes = libHashesRef.current;
    const persisted = Object.fromEntries(hashes);

    let countMissing = 0;
    for (const it of items) if (!hashes.has(it.url)) countMissing++;
    if (countMissing === 0) return;

    // show "hashing" progress in the left pane bar (reuse)
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
        } catch { /* ignore */ }
      }
      done++;
      setGetSpritesProg({ stage: 'hashing', done, total: items.length });
      await new Promise((r) => setTimeout(r, 0));
    }
    try { localStorage.setItem('lib:ahash', JSON.stringify(persisted)); } catch {}
    setGetSpritesProg({ stage: 'idle', done: 0, total: 0 });
  }

  // ---------- UI ----------
  const progressPct = (() => {
    const { stage, done, total } = getSpritesProg;
    if (stage === 'idle' || total === 0) return null;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  })();

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Nebula Bingo Tracker</h1>

        <div style={styles.actions}>
          <button style={styles.btn} onClick={() => addCard({})}>New Card</button>
          <button
            style={{ ...styles.btn, ...(activeId ? {} : styles.btnDisabled) }}
            disabled={!activeId}
            onClick={autofillActiveFromLibrary}
            title={activeId ? 'Autofill from library' : 'Create/select a card first'}
          >
            Autofill
          </button>
          <button
            style={{ ...styles.btn, ...(activeId ? {} : styles.btnDisabled) }}
            disabled={!activeId}
            onClick={clearActiveCard}
          >
            Clear Card
          </button>

          {/* Uploads (adds to library) */}
          <label style={styles.uploadLabel}>
            <input type="file" multiple accept="image/*" onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              const items = files.map((file) => ({ id: uid(), url: URL.createObjectURL(file), name: file.name }));
              setLibrary((prev) => [...items, ...prev]);
              e.target.value = '';
            }} style={{ display: 'none' }} />
            <span>Upload Images</span>
          </label>
        </div>
      </header>

      <main style={styles.main}>
        {/* Left: library pane with Get Sprites + progress */}
        <section style={styles.libraryPane}>
          <div style={styles.libraryToolbar}>
            <button
              style={styles.btn}
              onClick={getSprites}
              title="Fetch sprites from Drive and build index"
            >
              Get Sprites
            </button>
            {progressPct !== null && (
              <div style={styles.progressWrap} aria-label="progress">
                <div style={{ ...styles.progressBar, width: `${progressPct}%` }} />
              </div>
            )}
          </div>

          <div style={styles.libraryHeader}>
            <div style={styles.libraryTitle}>Image Library</div>
            <input
              placeholder="Search…"
              value={libQuery}
              onChange={(e) => setLibQuery(e.target.value)}
              style={styles.search}
            />
            <span style={{ fontSize: 12, color: '#9bb4ff' }}>
              {refIndex.count ? `Indexed: ${refIndex.count}` : ''}
            </span>
          </div>

          <div style={styles.libraryGrid}>
            {filteredLibrary.map((it) => (
              <button
                key={it.id}
                style={styles.thumb}
                title={it.name}
                onClick={() => addTileToActive(it.url)}
              >
                <img src={it.url} alt={it.name} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
              </button>
            ))}
            {filteredLibrary.length === 0 && (
              <div style={styles.emptyNote}>No images yet. Click “Get Sprites” or upload.</div>
            )}
          </div>
        </section>

        {/* Right: cards */}
        <section style={styles.cardsPane}>
          <div style={styles.cardsGrid}>
            {cards.map((card) => {
              const isActive = card.id === activeId;
              return (
                <div
                  key={card.id}
                  style={{ ...styles.cardWrap, ...(isActive ? styles.cardWrapActive : {}) }}
                  onClick={() => setActiveId(card.id)}
                >
                  <BingoCard
                    id={card.id}
                    title={card.title}
                    rows={card.rows}
                    cols={card.cols}
                    tiles={card.tiles}
                    onRemove={removeCard}
                    onBuilt={onBuiltPNG}
                    onUploadScreenshot={analyzeScreenshotForCard}
                    onRename={renameCard}
                    analyzing={analyzing.has(card.id)}
                  />
                </div>
              );
            })}
          </div>

          {cards.length === 0 && <div style={styles.emptyCards}>Create a card to get started.</div>}
        </section>
      </main>
    </div>
  );
}

// ---------- Styles ----------
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
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    justifyContent: 'space-between',
  },
  h1: { fontSize: '1.15rem', margin: 0, fontWeight: 700 },
  actions: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  btn: {
    background: '#2b2b2b',
    color: '#fff',
    border: '1px solid #3a3a3a',
    padding: '8px 12px',
    borderRadius: '12px',
    cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  uploadLabel: {
    background: '#2b2b2b',
    border: '1px solid #3a3a3a',
    padding: '8px 12px',
    borderRadius: '12px',
    cursor: 'pointer',
    userSelect: 'none',
  },

  main: {
    display: 'grid',
    gridTemplateColumns: '360px 1fr',
    gap: '0px',
    flex: 1,
    minHeight: 0,
  },

  // Library
  libraryPane: {
    borderRight: '1px solid #222',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  libraryToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  progressWrap: {
    flex: 1,
    height: 8,
    background: '#1b1b1b',
    border: '1px solid #2a2a2a',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: '#4e7cff',
  },
  libraryHeader: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
  },
  libraryTitle: { fontWeight: 600 },
  search: {
    flex: 1,
    background: '#1b1b1b',
    color: '#eee',
    border: '1px solid #2c2c2c',
    borderRadius: '10px',
    padding: '6px 10px',
  },
  libraryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  thumb: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: '10px',
    border: '1px solid #2a2a2a',
    background: '#151515',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  emptyNote: { color: '#aaa', fontSize: '0.9rem', gridColumn: '1 / -1', textAlign: 'center', padding: '12px 0' },

  // Cards
  cardsPane: { padding: '12px', minWidth: 0 },
  cardsGrid: { display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' },
  cardWrap: { borderRadius: '18px', transition: 'box-shadow 120ms ease, border-color 120ms ease', border: '1px solid transparent' },
  cardWrapActive: { border: '1px solid #4e7cff', boxShadow: '0 0 0 3px rgba(78,124,255,0.25)' },
  emptyCards: { color: '#aaa', padding: '12px' },
};
