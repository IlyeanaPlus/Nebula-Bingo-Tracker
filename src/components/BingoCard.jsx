// src/components/BingoCard.jsx
import React, { useMemo, useState } from 'react';
import { buildCard } from '../utils/cardBuilder.js';

export default function BingoCard({
  id,
  title = 'Bingo Card',
  tiles,          // array of image URLs, length = rows*cols
  rows = 5,
  cols = 5,
  onRemove,       // (id) => void
  onBuilt,        // ({ id, dataURL }) => void
}) {
  const [building, setBuilding] = useState(false);
  const [previewURL, setPreviewURL] = useState(null);

  const valid = Array.isArray(tiles) && tiles.length === rows * cols;

  const grid = useMemo(() => {
    if (!valid) return [];
    const chunks = [];
    for (let r = 0; r < rows; r++) {
      chunks.push(tiles.slice(r * cols, (r + 1) * cols));
    }
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

  return (
    <div className="rounded-2xl p-3 bg-[#151515] text-white shadow-md border border-[#262626]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded-xl bg-[#2b2b2b] hover:bg-[#333] disabled:opacity-50"
            onClick={handleBuild}
            disabled={!valid || building}
            title={!valid ? 'Fill all tiles first' : 'Build PNG'}
          >
            {building ? 'Building…' : 'Build PNG'}
          </button>
          <button
            className="px-3 py-1 rounded-xl bg-[#2b2b2b] hover:bg-[#333]"
            onClick={handleDownload}
            disabled={!previewURL}
            title={previewURL ? 'Download PNG' : 'Build a preview first'}
          >
            Download
          </button>
          <button
            className="px-3 py-1 rounded-xl bg-[#402020] hover:bg-[#552727]"
            onClick={() => onRemove?.(id)}
            title="Remove this card"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Live grid preview (simple) */}
      <div className="grid" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: '6px'
      }}>
        {grid.flat().map((url, i) => (
          <div key={i} className="aspect-square border border-[#2a2a2a] bg-[#1b1b1b] flex items-center justify-center overflow-hidden rounded-lg">
            {url ? (
              <img src={url} alt={`tile-${i}`} className="object-contain max-w-full max-h-full" />
            ) : (
              <span className="text-xs text-[#888]">empty</span>
            )}
          </div>
        ))}
      </div>

      {/* Built PNG preview (optional) */}
      {previewURL && (
        <div className="mt-3">
          <div className="text-sm mb-1 text-[#bbb]">Built preview</div>
          <img src={previewURL} alt="built-card" className="w-full rounded-lg border border-[#2a2a2a]" />
        </div>
      )}
    </div>
  );
}
