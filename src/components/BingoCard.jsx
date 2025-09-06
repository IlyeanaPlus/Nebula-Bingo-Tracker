// src/components/BingoCard.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fileToImage, crop25 } from '../utils/image';
import { prepareRefIndex, findBestMatch } from '../utils/matchers';

// Simple SVG “no match” badge
const NO_MATCH_SVG = encodeURI(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
     <rect width="100%" height="100%" fill="#121212"/>
     <g fill="#777" font-family="system-ui,Segoe UI,Arial" font-size="16" text-anchor="middle">
       <text x="150" y="154">No match</text>
     </g>
   </svg>`
);
const NO_MATCH_DATA_URL = `data:image/svg+xml;utf8,${NO_MATCH_SVG}`;

export default function BingoCard({ card, onChange, onRemove, manifest }) {
  const [isFilling, setIsFilling] = useState(false);
  const [fillStep, setFillStep] = useState(0);
  const [refIndex, setRefIndex] = useState([]);
  const inputRef = useRef(null);

  // ensure we have a 25-cell structure
  const cells = useMemo(
    () =>
      card.cells ||
      Array.from({ length: 25 }, () => ({
        name: '',
        sprite: null,
        complete: false,
      })),
    [card]
  );

  // Build the reference index once the manifest is ready
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!manifest || !manifest.length) {
        setRefIndex([]);
        return;
      }
      try {
        const idx = await prepareRefIndex(manifest);
        if (alive) setRefIndex(idx);
      } catch (e) {
        console.error('prepareRefIndex failed', e);
        if (alive) setRefIndex([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [manifest]);

  function toggleComplete(idx) {
    const next = [...cells];
    next[idx] = { ...next[idx], complete: !next[idx].complete };
    onChange({ ...card, cells: next });
  }

  function handleTitleChange(e) {
    onChange({ ...card, title: e.target.value });
  }

  function handleSave() {
    onChange({ ...card, saved: true });
  }

  function handlePick() {
    inputRef.current?.click();
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (f) runFillFromFile(f);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) runFillFromFile(f);
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  async function runFillFromFile(file) {
    setIsFilling(true);
    setFillStep(0);
    try {
      // load and crop the screenshot
      const img = await fileToImage(file);
      const crops = await crop25(img);

      const nextCells = [...cells];

      for (let i = 0; i < crops.length; i++) {
        const cropURL = crops[i];

        let out = null;
        if (refIndex.length) {
          // shortlist with histograms, then SSIM + MSE with small offset search
          out = await findBestMatch(cropURL, refIndex, {
            shortlistK: 24, // tune: 16–48
            ssimMin: 0.88,  // tune: 0.86–0.92
            mseMax: 600,    // tune: 400–800
          });
        }

        if (out) {
          nextCells[i] = {
            name: out.name,
            sprite: out.src,
            complete: nextCells[i]?.complete || false,
          };
        } else {
          // analyzer ran but nothing was confident enough
          nextCells[i] = { name: '— no match —', sprite: NO_MATCH_DATA_URL, complete: false };
        }

        setFillStep(i + 1);
        // yield so the UI paints during long runs
        if ((i + 1) % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }

      onChange({ ...card, cells: nextCells });
    } catch (e) {
      console.error('Fill error', e);
    } finally {
      setIsFilling(false);
    }
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
            <div className="fill-hint">Tip: drop an image anywhere on this card to start.</div>
          </div>
        </div>
      )}
    </div>
  );
}
