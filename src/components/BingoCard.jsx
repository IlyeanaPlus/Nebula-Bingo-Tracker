// src/components/BingoCard.jsx
import React, { useMemo, useRef, useState } from 'react';
import { fileToImage, crop25, calcGrayHashes, calcRGBHashes, calcPHash, calcEdgeHash, hamming64 } from '../utils/image';

const MAX_SCORE = 0.30;
const WEIGHTS = { phash: 0.45, edge: 0.25, gray: 0.20, rgb: 0.10 };

const NO_MATCH_SVG = encodeURI(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
     <rect width="100%" height="100%" fill="#121212"/>
     <g fill="#777" font-family="system-ui,Segoe UI,Arial" font-size="16" text-anchor="middle">
       <text x="150" y="150">No match</text>
     </g>
   </svg>`
);
const NO_MATCH_DATA_URL = `data:image/svg+xml;utf8,${NO_MATCH_SVG}`;

function pickSpriteSrc(entry) {
  return entry.src || entry.image || entry.path || entry.url || null;
}

function norm64(d) { return d / 64; }

function scoreGray(dA, dX, dY) {
  return (0.2 * norm64(dA)) + (0.4 * norm64(dX)) + (0.4 * norm64(dY));
}
function scoreRGB(dist) {
  const ch = ['R','G','B'].map(k => {
    const v = dist[k];
    return (0.2 * norm64(v.a)) + (0.4 * norm64(v.dx)) + (0.4 * norm64(v.dy));
  });
  return (ch[0] + ch[1] + ch[2]) / 3;
}

export default function BingoCard({ card, onChange, onRemove, manifest }) {
  const [isFilling, setIsFilling] = useState(false);
  const [fillStep, setFillStep] = useState(0);
  const inputRef = useRef(null);

  const cells = useMemo(
    () =>
      card.cells ||
      Array.from({ length: 25 }, () => ({
        name: '',
        sprite: null,
        complete: false
      })),
    [card]
  );

  function toggleComplete(idx) {
    const next = [...cells];
    next[idx] = { ...next[idx], complete: !next[idx].complete };
    onChange({ ...card, cells: next });
  }

  function handleTitleChange(e) {
    onChange({ ...card, title: e.target.value });
  }

  async function runFillFromFile(file) {
    setIsFilling(true);
    setFillStep(0);
    try {
      const img = await fileToImage(file);
      const crops = await crop25(img);

      const nextCells = [...cells];

      for (let i = 0; i < crops.length; i++) {
        const dataURL = crops[i];

        const [ph, eh] = await Promise.all([calcPHash(dataURL), calcEdgeHash(dataURL)]);
        const gray = await calcGrayHashes(dataURL);
        const rgb = await calcRGBHashes(dataURL);

        let best = { score: Number.POSITIVE_INFINITY, entry: null };

        for (const entry of manifest || []) {
          if (!entry.ahash || !entry.dhashX || !entry.dhashY || !entry.phash || !entry.edgeHash) continue;

          const phd = norm64(hamming64(ph, entry.phash));
          const ehd = norm64(hamming64(eh, entry.edgeHash));

          const gScore = scoreGray(
            hamming64(gray.a, entry.ahash),
            hamming64(gray.dx, entry.dhashX),
            hamming64(gray.dy, entry.dhashY)
          );

          const rgbDistances = {
            R: {
              a: entry.ahashR ? hamming64(rgb.R.a, entry.ahashR) : 64,
              dx: entry.dhashXR ? hamming64(rgb.R.dx, entry.dhashXR) : 64,
              dy: entry.dhashYR ? hamming64(rgb.R.dy, entry.dhashYR) : 64
            },
            G: {
              a: entry.ahashG ? hamming64(rgb.G.a, entry.ahashG) : 64,
              dx: entry.dhashXG ? hamming64(rgb.G.dx, entry.dhashXG) : 64,
              dy: entry.dhashYG ? hamming64(rgb.G.dy, entry.dhashYG) : 64
            },
            B: {
              a: entry.ahashB ? hamming64(rgb.B.a, entry.ahashB) : 64,
              dx: entry.dhashXB ? hamming64(rgb.B.dx, entry.dhashXB) : 64,
              dy: entry.dhashYB ? hamming64(rgb.B.dy, entry.dhashYB) : 64
            }
          };
          const cScore = scoreRGB(rgbDistances);

          const final = (WEIGHTS.phash * phd) + (WEIGHTS.edge * ehd) + (WEIGHTS.gray * gScore) + (WEIGHTS.rgb * cScore);

          if (final < best.score) best = { score: final, entry };
        }

        if (best.entry && best.score <= MAX_SCORE) {
          nextCells[i] = {
            name: best.entry.name || best.entry.id || 'Unknown',
            sprite: pickSpriteSrc(best.entry),
            complete: nextCells[i]?.complete || false
          };
        } else {
          nextCells[i] = { name: '— no match —', sprite: null, complete: false };
        }

        setFillStep(i + 1);
        if ((i + 1) % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      onChange({ ...card, cells: nextCells });
    } catch (e) {
      console.error('Fill error', e);
    } finally {
      setIsFilling(false);
    }
  }

  function handlePick() {
    inputRef.current?.click();
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (file) runFillFromFile(file);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) runFillFromFile(file);
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  function handleSave() {
    onChange({ ...card, saved: true });
  }

  return (
    <div className="card" onDrop={onDrop} onDragOver={onDragOver}>
      <div className="card-header">
        <input
          className="title-inline"
          value={card.title || ''}
          onChange={handleTitleChange}
          placeholder="Card title"
          aria-label="Card title"
        />
        <div className="actions">
          <button onClick={handlePick}>Fill</button>
          <button onClick={handleSave}>Save</button>
          <button onClick={onRemove}>Remove</button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFile}
        />
      </div>

      <div className="grid-5x5" aria-label="Bingo grid">
        {cells.map((cell, idx) => (
          <div
            key={idx}
            className={`cell ${cell.complete ? 'complete' : ''}`}
            onClick={() => toggleComplete(idx)}
            title={cell.name || '—'}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleComplete(idx)}
          >
            {cell.sprite ? (
              <img src={cell.sprite} alt={cell.name || 'cell'} />
            ) : (
              <span className="cell-text">{cell.name || '—'}</span>
            )}
          </div>
        ))}
      </div>

      {isFilling && (
        <div className="fill-overlay" role="status" aria-live="polite">
          <div className="fill-box">
            <div className="fill-title">Analyzing screenshot…</div>
            <div className="fill-bar">
              <div className="fill-bar-inner" style={{ width: `${(fillStep / 25) * 100}%` }} />
            </div>
            <div className="fill-meta">{fillStep} / 25</div>
            <div className="fill-hint">Tip: Drop an image anywhere on this card to start.</div>
          </div>
        </div>
      )}
    </div>
  );
}
