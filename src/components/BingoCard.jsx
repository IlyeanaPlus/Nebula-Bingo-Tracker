// src/components/BingoCard.jsx
import React, { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import GridTunerModal from "./GridTunerModal";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

export default function BingoCard({ id, title, spritesIndex, onRemove, onRename }) {
  const [name, setName] = useState(title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const [spritesReady, setSpritesReady] = useState(
    !!spritesIndex && Object.keys(spritesIndex || {}).length > 0
  );
  const [matchResults, setMatchResults] = useState(Array(25).fill(null));
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const [fractions, setFractions] = useState(loadFractions());
  const fileInputRef = useRef(null);

  // Rename
  function handleRenameClick() { setRenaming(true); }
  function handleRenameSubmit(e) {
    e.preventDefault();
    setRenaming(false);
    onRename?.(id, name);
  }

  // Fill pipeline
  function handlePickImage() { fileInputRef.current?.click(); }
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

  // Save button
  function handleSave() {
    const payload = {
      id,
      name,
      fractions,
      matches: matchResults,
      ts: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_").toLowerCase() || "card"}_${id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Matcher
  async function matchAll(crops) {
    if (!spritesIndex) return Array(25).fill(null);
    const prepared = prepareRefIndex(spritesIndex);
    const out = [];
    for (let i = 0; i < 25; i++) {
      const best = await findBestMatch(crops[i], prepared);
      out.push(best);
    }
    return out;
  }

  return (
    <div className="card">
      <div className="card-header">
        {/* Title row (centered) */}
        <div className="title-row" style={{ justifyContent: "center" }}>
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

        {/* Actions row */}
        <div className="actions-row">
          <button className="btn" onClick={handlePickImage}>Fill</button>
          <button className="btn" onClick={handleSave}>Save</button>
          <button className="btn" onClick={() => onRemove?.(id)}>Remove</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={onPickFile}
          />
        </div>
      </div>

      {/* Status */}
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
