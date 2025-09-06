// src/components/BingoCard.jsx
import React, { useMemo, useRef, useState } from 'react';
import { fileToImage, crop25, calcGrayHashes, calcRGBHashes, hamming64 } from '../utils/image';
import { weightedScore, scoreGray, scoreRGB, DEFAULT_WEIGHTS } from '../utils/match';

const MAX_SCORE = 0.22; // tune: lower = stricter (0.18–0.28 typical)
const WEIGHTS = DEFAULT_WEIGHTS;

// Simple inline SVG placeholder for unmatched cells
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

        // Compute hashes for the crop
        const gray = await calcGrayHashes(dataURL);
        const rgb = await calcRGBHashes(dataURL);

        let best = { score: Number.POSITIVE_INFINITY, entry: null };

        // Scan manifest entries for best score
        for (const entry of manifest || []) {
          if (!entry.ahash || !entry.dhashX || !entry.dhashY) continue;

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
          const final = weightedScore({ gray: gScore, rgb: cScore }, WEIGHTS);

          if (final < best.score) {
            best = { score: final, entry };
          }
        }

        if (best.entry && best.score <= MAX_SCORE) {
          nextCells[i] = {
            name: best.entry.name || best.entry.id || 'Unknown',
            sprite: pickSpriteSrc(best.entry),
            complete: nextCells[i]?.complete || false
          };
        } else {
          // Use placeholder to indicate analyzer ran but no match was found
          nextCells[i] = { name: '— no match —', sprite: NO_MATCH_DATA_URL, complete: false };
        }

        setFillStep(i + 1);
        // yield to UI every few steps
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
    // reset so selecting same file again still triggers change
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
