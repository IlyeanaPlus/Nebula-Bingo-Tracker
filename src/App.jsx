// src/App.jsx
import React, { useEffect, useMemo, useState } from 'react';
import BingoCard from './components/BingoCard.jsx';
import { tryLoadDriveCacheJSON, listDriveImagesFast } from './services/drive.js';

// --- Hardcoded config (replace with your real values or env) ---
const DRIVE_FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID';
const GOOGLE_API_KEY  = 'YOUR_GOOGLE_API_KEY';

// ---------- Helpers ----------
function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function extractUrl(item) {
  // Flexible extraction from whatever the Drive service returns
  if (!item) return '';
  if (typeof item === 'string') return item;
  return (
    item.url ??
    item.webContentLink ??
    item.thumbnailLink ??
    item.webViewLink ??
    ''
  );
}

function toLibraryItems(arr) {
  return (arr ?? [])
    .map((it) => {
      const url = extractUrl(it);
      if (!url) return null;
      return {
        id: it.id ?? uid(),
        url,
        name: it.name ?? it.title ?? 'image',
      };
    })
    .filter(Boolean);
}

// ---------- App ----------
export default function App() {
  // Image library (from Drive cache/API or local uploads)
  const [library, setLibrary] = useState([]); // [{id,url,name}]
  const [libQuery, setLibQuery] = useState('');

  // Cards
  const [cards, setCards] = useState([]); // [{id,title,rows,cols,tiles}]
  const [activeId, setActiveId] = useState(null);

  // Load from Drive cache first; fall back to Drive API if available
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cached = await tryLoadDriveCacheJSON();
        if (!cancelled && cached) {
          // Try multiple possible shapes
          const arr =
            cached.images ??
            cached.files ??
            cached.items ??
            cached.list ??
            cached;
          const items = toLibraryItems(arr);
          if (items.length) {
            setLibrary(items);
            return;
          }
        }
      } catch {
        // ignore and try live
      }

      // Fallback: live listing (support both signatures)
      try {
        let list;
        try {
          list = await listDriveImagesFast(GOOGLE_API_KEY, DRIVE_FOLDER_ID);
        } catch {
          list = await listDriveImagesFast({
            apiKey: GOOGLE_API_KEY,
            folderId: DRIVE_FOLDER_ID,
          });
        }
        if (!cancelled && list) {
          const arr =
            list.images ?? list.files ?? list.items ?? list.list ?? list;
          setLibrary(toLibraryItems(arr));
        }
      } catch {
        // If Drive fails entirely, leave library empty; user can upload
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Filtered view of library
  const filteredLibrary = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (it) =>
        it.name?.toLowerCase().includes(q) ||
        it.url?.toLowerCase().includes(q)
    );
  }, [library, libQuery]);

  // Card helpers
  function addCard({ title = `Card ${cards.length + 1}`, rows = 5, cols = 5, tiles } = {}) {
    const total = rows * cols;
    const filled = Array.isArray(tiles) && tiles.length === total
      ? tiles
      : Array(total).fill(null);
    const id = uid();
    const card = { id, title, rows, cols, tiles: filled };
    setCards((prev) => [...prev, card]);
    setActiveId(id);
  }

  function removeCard(id) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId((prev) => {
        const remaining = cards.filter((c) => c.id !== id);
        return remaining[0]?.id ?? null;
      });
    }
  }

  function setActive(id) {
    setActiveId(id);
  }

  function updateCard(id, updater) {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updater(c) } : c))
    );
  }

  function addTileToActive(url) {
    if (!activeId) return;
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== activeId) return c;
        const next = c.tiles.slice();
        const emptyIdx = next.findIndex((t) => !t);
        if (emptyIdx !== -1) {
          next[emptyIdx] = url;
        } else {
          // If full, replace last slot (or do nothing)
          next[next.length - 1] = url;
        }
        return { ...c, tiles: next };
      })
    );
  }

  function clearActiveCard() {
    if (!activeId) return;
    setCards((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, tiles: Array(c.rows * c.cols).fill(null) } : c
      )
    );
  }

  function autofillActiveFromLibrary() {
    if (!activeId || filteredLibrary.length === 0) return;
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== activeId) return c;
        const total = c.rows * c.cols;
        const picked = filteredLibrary.slice(0, total).map((it) => it.url);
        const filled = picked.length === total
          ? picked
          : picked.concat(Array(total - picked.length).fill(null));
        return { ...c, tiles: filled };
      })
    );
  }

  function onBuiltPNG({ id, dataURL }) {
    try {
      localStorage.setItem(`card:${id}:png`, dataURL);
    } catch {}
  }

  // Local uploads -> add to library
  function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const items = files.map((file) => ({
      id: uid(),
      url: URL.createObjectURL(file), // kept for session; revocation omitted for UX
      name: file.name,
    }));
    setLibrary((prev) => [...items, ...prev]);
    e.target.value = ''; // reset
  }

  // ---------- UI ----------
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Nebula Bingo Tracker</h1>

        <div style={styles.actions}>
          <button style={styles.btn} onClick={() => addCard({})}>
            New Card
          </button>
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

          {/* Local uploads */}
          <label style={styles.uploadLabel}>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
            <span>Upload Images</span>
          </label>
        </div>
      </header>

      <main style={styles.main}>
        {/* Left: image library */}
        <section style={styles.libraryPane}>
          <div style={styles.libraryHeader}>
            <div style={styles.libraryTitle}>Image Library</div>
            <input
              placeholder="Search…"
              value={libQuery}
              onChange={(e) => setLibQuery(e.target.value)}
              style={styles.search}
            />
          </div>

          <div style={styles.libraryGrid}>
            {filteredLibrary.map((it) => (
              <button
                key={it.id}
                style={styles.thumb}
                title={it.name}
                onClick={() => addTileToActive(it.url)}
              >
                <img
                  src={it.url}
                  alt={it.name}
                  style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                />
              </button>
            ))}
            {filteredLibrary.length === 0 && (
              <div style={styles.emptyNote}>
                No images yet. Upload some or ensure Drive config is valid.
              </div>
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
                  style={{
                    ...styles.cardWrap,
                    ...(isActive ? styles.cardWrapActive : {}),
                  }}
                  onClick={() => setActive(card.id)}
                >
                  <BingoCard
                    id={card.id}
                    title={card.title}
                    rows={card.rows}
                    cols={card.cols}
                    tiles={card.tiles}
                    onRemove={removeCard}
                    onBuilt={onBuiltPNG}
                  />
                </div>
              );
            })}
          </div>

          {cards.length === 0 && (
            <div style={styles.emptyCards}>
              Create a card to get started.
            </div>
          )}
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
  actions: { display: 'flex', alignItems: 'center', gap: '10px' },
  btn: {
    background: '#2b2b2b',
    color: '#fff',
    border: '1px solid #3a3a3a',
    padding: '8px 12px',
    borderRadius: '12px',
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
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
  libraryHeader: {
    display: 'flex',
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
  emptyNote: {
    color: '#aaa',
    fontSize: '0.9rem',
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '12px 0',
  },

  // Cards
  cardsPane: {
    padding: '12px',
    minWidth: 0,
  },
  cardsGrid: {
    display: 'grid',
    gap: '12px',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  },
  cardWrap: {
    borderRadius: '18px',
    transition: 'box-shadow 120ms ease, border-color 120ms ease',
    border: '1px solid transparent',
  },
  cardWrapActive: {
    border: '1px solid #4e7cff',
    boxShadow: '0 0 0 3px rgba(78,124,255,0.25)',
  },
  emptyCards: { color: '#aaa', padding: '12px' },
};
