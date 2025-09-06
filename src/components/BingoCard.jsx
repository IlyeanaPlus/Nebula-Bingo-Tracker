import React, { useRef, useState } from 'react';

export default function BingoCard({
  id,
  title,
  rows = 5,
  cols = 5,
  tiles = [],
  analyzing = false,
  onRename,
  onUploadScreenshot,
  onClear,
  onRemove,
  onToggleCell,
}) {
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(title || 'Card');

  const total = rows * cols;

  function openFilePicker() {
    if (fileRef.current) fileRef.current.click();
  }

  function handleFileChange(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    onUploadScreenshot?.(id, f);
  }

  function startEdit() {
    setNameDraft(title || 'Card');
    setEditing(true);
  }
  function commitEdit() {
    const next = nameDraft.trim() || 'Card';
    setEditing(false);
    if (next !== title) onRename?.(id, next);
  }
  function cancelEdit() {
    setEditing(false);
    setNameDraft(title || 'Card');
  }

  return (
    <div style={styles.card}>
      {/* header */}
      <div style={styles.topRow}>
        {editing ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              else if (e.key === 'Escape') cancelEdit();
            }}
            style={styles.titleInput}
          />
        ) : (
          <button onClick={startEdit} style={styles.titleBtn} title="Click to rename">
            {title || 'Card'}
          </button>
        )}

        <div style={styles.actions}>
          <button style={styles.smallBtn} onClick={openFilePicker} title="Upload screenshot to fill">
            Fill Card
          </button>
          <button style={styles.smallBtn} onClick={() => onClear?.(id)} title="Reset this card">
            Clear Card
          </button>
          <button style={styles.smallBtnDanger} onClick={() => onRemove?.(id)} title="Delete card">
            Remove
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* grid */}
      <div
        style={{
          ...styles.grid,
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {Array.from({ length: total }, (_, i) => {
          const t = tiles[i] || null;
          const isChecked = !!(t && t.checked);
          const hasImg = !!(t && t.url);
          return (
            <button
              key={i}
              style={{
                ...styles.cell,
                ...(isChecked ? styles.cellChecked : {}),
              }}
              onClick={() => onToggleCell?.(id, i)}
              title={isChecked ? 'Checked' : 'Click to mark done'}
            >
              {hasImg ? (
                <img
                  src={t.url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isChecked ? 0.85 : 1 }}
                  crossOrigin="anonymous"
                />
              ) : (
                <span style={styles.cellEmpty}>–</span>
              )}
            </button>
          );
        })}
      </div>

      {analyzing && <div style={styles.overlay}>Analyzing…</div>}
    </div>
  );
}

const styles = {
  card: { position: 'relative', padding: 12 },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  titleBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    fontSize: '1rem',
    textAlign: 'left',
    cursor: 'pointer',
  },
  titleInput: {
    background: '#1c1c1c',
    color: '#fff',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: '6px 8px',
    fontSize: '1rem',
    width: 220,
  },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  smallBtn: {
    background: '#2b2b2b',
    color: '#fff',
    border: '1px solid #3a3a3a',
    padding: '6px 10px',
    borderRadius: 10,
    cursor: 'pointer',
  },
  smallBtnDanger: {
    background: '#291c1c',
    color: '#ff9b9b',
    border: '1px solid #4a2a2a',
    padding: '6px 10px',
    borderRadius: 10,
    cursor: 'pointer',
  },

  grid: {
    display: 'grid',
    gap: 6,
    width: '100%',
    aspectRatio: '1 / 1',
  },
  cell: {
    position: 'relative',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    background: '#101010',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  cellChecked: {
    outline: '2px solid #31c76a',
    boxShadow: 'inset 0 0 0 9999px rgba(49,199,106,0.20)',
  },
  cellEmpty: {
    color: '#555',
    fontSize: 18,
  },

  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    fontWeight: 700,
  },
};
