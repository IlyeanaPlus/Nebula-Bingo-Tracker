// src/components/BingoCard.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fileToImage, crop25 } from '../utils/image';
import { prepareRefIndex, findBestMatch } from '../utils/matchers';

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
  const [lastCrops, setLastCrops] = useState(null);     // dataURLs from last Fill
  const [showDebugCrops, setShowDebugCrops] = useState(false);
  const inputRef = useRef(null);

  // normalize to 25 cells
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

  // Build reference index whenever manifest changes
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
    return () => { alive = false; };
  }, [manifest]);

  // Close Debug Crops with Esc
  useEffect(() => {
    function onEsc(e) {
      if (e.key === 'Escape') setShowDebugCrops(false);
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

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
    if (!isFilling) inputRef.current?.click();
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
  function onDragOver(e) { e.preventDefault(); }

  async function runFillFromFile(file) {
    setIsFilling(true);
    setFillStep(0);
    try {
      const img = await fileToImage(file);
      const crops = await crop25(img);   // native-size crops
      setLastCrops(crops);               // show in Debug Crops modal

      const nextCells = [...cells];

      for (let i = 0; i < crops.length; i++) {
        const cropURL = crops[i];

        const out = refIndex.length
          ? await findBestMatch(cropURL, refIndex, {
              shortlistK: 48,
              ssimMin: 0.82,
              mseMax: 1100,
              nccMin: 0.88, // NCC acceptance path
              tau: 16,      // raise to 18–20 for low-quality JPGs
              debug: true   // console logs while tuning
            })
          : null;

        if (out) {
          nextCells[i] = {
            name: out.name,
            sprite: out.src,
            complete: nextCells[i]?.complete || false,
          };
        } else {
          nextCells[i] = { name: '— no match —', sprite: NO_MATCH_DATA_URL, complete: false };
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
        <div className="actions" title={refIndex.length ? '' : 'Sprites not loaded yet'}>
          <span style={{ opacity: 0.7, fontSize: 12, marginRight: 8 }}>
            sprites: {refIndex.length}
          </span>
          <button onClick={handlePick} disabled={!refIndex.length || isFilling}>Fill</button>
          <button onClick={handleSave}>Save</button>
          <button onClick={onRemove}>Remove</button>
          {lastCrops?.length === 25 && (
            <button
              onClick={() => setShowDebugCrops(true)}
              title="Show 25 cropped cells from the last Fill"
            >
              Debug Crops
            </button>
          )}
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

      {/* Debug crops modal */}
      {showDebugCrops && (
        <div
          className="fill-overlay"
          style={{ zIndex: 9999 }}
          onClick={() => setShowDebugCrops(false)}
        >
          <div
            className="fill-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '70vh', overflow: 'auto' }}
          >
            <div
              className="fill-title"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>Last Fill — Crops</span>
              <button onClick={() => setShowDebugCrops(false)}>Close</button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 8,
                background: '#111',
                padding: 8,
                borderRadius: 8
              }}
            >
              {lastCrops.map((src, i) => (
                <div key={i} style={{ background: '#222', padding: 6, borderRadius: 6 }}>
                  <img
                    src={src}
                    alt={`crop ${i}`}
                    style={{ width: 48, height: 48, imageRendering: 'pixelated' }}
                  />
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.8,
                      marginTop: 4,
                      textAlign: 'center'
                    }}
                  >
                    {i === 12 ? 'center' : `#${i + 1}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
