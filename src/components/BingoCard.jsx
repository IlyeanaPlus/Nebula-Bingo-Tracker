// src/components/BingoCard.jsx
import React, { useMemo, useState } from 'react';
import { buildCard } from '../utils/cardBuilder.js';

const styles = {
  card: { borderRadius: '16px', padding: '12px', background: '#151515', color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.25)', border: '1px solid #262626' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' },
  titleRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  title: { fontSize: '1.1rem', fontWeight: 600, margin: 0 },
  input: { background: '#1b1b1b', color: '#eee', border: '1px solid #2c2c2c', borderRadius: '10px', padding: '4px 8px' },
  btn: { padding: '6px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: '#2b2b2b', color: '#fff' },
  btnDanger: { padding: '6px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: '#402020', color: '#fff' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  gridCell: { aspectRatio: '1 / 1', border: '1px solid #2a2a2a', background: '#1b1b1b', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '10px' },
  previewLabel: { fontSize: '0.85rem', marginBottom: '6px', color: '#bbb' },
  builtImg: { width: '100%', borderRadius: '10px', border: '1px solid #2a2a2a' },
  smallNote: { fontSize: 12, color: '#9bb4ff' }
};

export default function BingoCard({
  id,
  title = 'Bingo Card',
  tiles,          // array of image URLs, length = rows*cols
  rows = 5,
  cols = 5,
  onRemove,       // (id) => void
  onBuilt,        // ({ id, dataURL }) => void
  onUploadScreenshot, // (id, File) => void
  onRename,       // (id, newTitle) => void
  analyzing = false,  // boolean from parent while screenshot analysis runs
}) {
  const [building, setBuilding] = useState(false);
  const [previewURL, setPreviewURL] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);

  const valid = Array.isArray(tiles) && tiles.length === rows * cols;

  const grid = useMemo(() => {
    if (!valid) return [];
    const chunks = [];
    for (let r = 0; r < rows; r++) chunks.push(tiles.slice(r * cols, (r + 1) * cols));
    return chunks;
  }, [tiles, rows, cols, valid]);

  async function handleBuild() {
    if (!valid) return;
    setBuilding(true);
    try {
      const { dataURL } = await buildCard({ tiles, rows, cols });
      setPreviewURL(dataURL);
      onBuilt?.({ id, dataURL });
    } finally {
      setBuilding(false);
    }
  }

  function handleDownload() {
    if (!previewURL) return;
    const a = document.createElement('a');
    a.href = previewURL;
    a.download = `${title.replace(/\s+/g, '_').toLowerCase()}.png`;
    a.click();
  }

  function finalizeRename() {
    const next = (nameDraft || '').trim();
    if (next && next !== title) onRename?.(id, next);
    setRenaming(false);
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          {renaming ? (
            <>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') finalizeRename(); if (e.key === 'Escape') setRenaming(false); }}
                style={styles.input}
              />
              <button style={styles.btn} onClick={finalizeRename}>Save</button>
              <button style={styles.btn} onClick={() => { setRenaming(false); setNameDraft(title); }}>Cancel</button>
            </>
          ) : (
            <>
              <h3 style={styles.title}>{title}</h3>
              <button style={styles.btn} onClick={() => { setRenaming(true); setNameDraft(title); }}>Rename</button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <label style={styles.btn}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadScreenshot?.(id, f);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
            Upload Screenshot
          </label>
          <button
            style={{ ...styles.btn, ...( (!valid || building) ? styles.btnDisabled : {} ) }}
            onClick={handleBuild}
            disabled={!valid || building}
            title={!valid ? 'Fill all tiles first' : 'Build PNG'}
          >
            {building ? 'Building…' : 'Build PNG'}
          </button>
          <button
            style={{ ...styles.btn, ...( !previewURL ? styles.btnDisabled : {} ) }}
            onClick={handleDownload}
            disabled={!previewURL}
            title={previewURL ? 'Download PNG' : 'Build a preview first'}
          >
            Download
          </button>
          <button
            style={styles.btnDanger}
            onClick={() => onRemove?.(id)}
            title="Remove this card"
          >
            Remove
          </button>
        </div>
      </div>

      {analyzing && <div style={styles.smallNote}>Analyzing screenshot… matching sprites to cells</div>}

      {/* Live grid preview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: '6px',
        }}
      >
        {grid.flat().map((url, i) => (
          <div key={i} style={styles.gridCell}>
            {url ? (
              <img src={url} alt={`tile-${i}`} style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%' }} />
            ) : (
              <span style={{ fontSize: '12px', color: '#888' }}>empty</span>
            )}
          </div>
        ))}
      </div>

      {/* Built PNG preview (optional) */}
      {previewURL && (
        <div style={{ marginTop: '12px' }}>
          <div style={styles.previewLabel}>Built preview</div>
          <img src={previewURL} alt="built-card" style={styles.builtImg} />
        </div>
      )}
    </div>
  );
}
