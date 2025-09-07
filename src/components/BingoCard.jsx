// src/components/BingoCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { fileToImage, computeCrops25, loadFractions, saveFractions } from "../utils/image";
import GridTunerModal from "./GridTunerModal";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

export default function BingoCard({ id, title, spritesIndex, onRemove, onRename }) {
  const [name, setName] = useState(title || `Card ${id}`);
  const [renaming, setRenaming] = useState(false);
  const [spritesReady, setSpritesReady] = useState(
    !!spritesIndex && Object.keys(spritesIndex || {}).length > 0
  );
  const [matchResults, setMatchResults] = useState(Array(25).fill(null));
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const [fractions, setFractions] = useState(loadFractions());
  const fileInputRef = useRef(null);

  // Renaming logic
  function handleRenameClick() {
    setRenaming(true);
  }
  function handleRenameSubmit(e) {
    e.preventDefault();
    setRenaming(false);
    onRename?.(id, name);
  }

  // File → tuner pipeline
  function handlePickImage() {
    fileInputRef.current?.click();
  }
  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPendingImageSrc(url);
    setShowTuner(true);
  }

  async function onTunerConfirm(newFractions) {
    setShowTuner(false);
    setFractions(newFractions);
    saveFractions(newFractions);
    if (!pendingImageSrc) return;

    const tmp = new Image();
    await new Promise((res, rej) => {
      tmp.onload = () => res();
      tmp.onerror = rej;
      tmp.src = pendingImageSrc;
    });

    const crops = computeCrops25(tmp, newFractions);
    const results = await matchAll(crops);
    setMatchResults(results);
  }

  function onTunerCancel() {
    setShowTuner(false);
    setPendingImageSrc(null);
  }

  // Matching logic
  async function matchAll(crops) {
    if (!spritesIndex) return Array(25).fill(null);
    const prepared = prepareRefIndex(spritesIndex);
    const out = [];
    for (let i = 0; i < 25; i++) {
      const crop = crops[i];
      const best = await findBestMatch(crop, prepared);
      out.push(best);
    }
    return out;
  }

  return (
    <div className="card">
      <div className="card-header">
        {/* Title row */}
        <div className="title-row">
          {renaming ? (
            <form onSubmit={handleRenameSubmit}>
              <input
                className="title-inline"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                onBlur={() => setRenaming(false)}
              />
            </form>
          ) : (
            <h2 className="title" title="Click to rename" onClick={handleRenameClick}>
              {name}
            </h2>
          )}
        </div>

        {/* Actions row (buttons below title) */}
        <div className="actions-row">
          <button
            className="btn"
            onClick={handlePickImage}
            title="Fill: pick screenshot & fine-tune grid"
          >
            Fill
          </button>
          <button className="btn" onClick={() => onRemove?.(id)}>
            Remove
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={onPickFile}
          />
        </div>
      </div>

      {/* Status row */}
      <div className="bingo-card__status">
        {spritesReady ? (
          <span className="ok">sprites loaded!</span>
        ) : (
          <span className="warn">load sprites to enable matching</span>
        )}
      </div>

      {/* Grid */}
      <div className="grid-5x5">
        {Array.from({ length: 25 }, (_, i) => (
          <div key={i} className="cell">
            {matchResults[i] ? (
              <img
                className="cell-sprite"
                src={matchResults[i].url || matchResults[i].dataURL}
                alt={`match-${i}`}
              />
            ) : (
              <div className="cell-empty" />
            )}
          </div>
        ))}
      </div>

      {/* Grid tuner modal */}
      {showTuner && (
        <GridTunerModal
          imageSrc={pendingImageSrc}
          initialFractions={fractions}
          onConfirm={onTunerConfirm}
          onCancel={onTunerCancel}
        />
      )}
    </div>
  );
}
