// src/components/BingoCard.jsx
import React, { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import GridTunerModal from "./GridTunerModal";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

export default function BingoCard({ id, title, spritesIndex, onRemove, onRename }) {
  const [name, setName] = useState(title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const [spritesReady, setSpritesReady] = useState(!!spritesIndex && Object.keys(spritesIndex || {}).length > 0);
  const [matchResults, setMatchResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const [fractions, setFractions] = useState(loadFractions());
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  // --- Rename ---
  function handleRenameClick() { setRenaming(true); }
  function handleRenameSubmit(e) { e.preventDefault(); setRenaming(false); onRename?.(id, name); }

  // --- Fill pipeline ---
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

    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = pendingImageSrc; });
    const crops = computeCrops25(img, newFractions);

    setAnalyzing(true);
    setProgress(0);
    try {
      const results = await matchAll(crops, (i) => setProgress(Math.round(((i + 1) / 25) * 100)));
      setMatchResults(results);
    } finally {
      setAnalyzing(false);
    }
  }
  function onTunerCancel() { setShowTuner(false); setPendingImageSrc(null); }

  // --- Check/uncheck cells ---
  function toggleCell(i) {
    setChecked((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      return next;
    });
  }

  // --- Save card ---
  function handleSave() {
    const payload = { id, name, fractions, matches: matchResults, checked, ts: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_").toLowerCase() || "card"}_${id}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // --- Matcher ---
  async function matchAll(crops, onStep) {
    if (!spritesIndex) return Array(25).fill(null);
    const prepared = prepareRefIndex(spritesIndex);
    const out = [];
    for (let i = 0; i < 25; i++) {
      const cropCanvas = crops[i];
      const dataURL = cropCanvas.toDataURL("image/png");   // ✅ convert to dataURL
      const best = await findBestMatch(dataURL, prepared);
      out.push(best || null);
      onStep?.(i);
    }
    return out;
  }

  return (
    <div className="card">
      <div className="card-header">
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

      <div className="bingo-card__status">
        {spritesReady ? <span className="ok">sprites loaded!</span> : <span className="warn">load sprites to enable matching</span>}
        {analyzing && (
          <div className="progress-wrap" style={{ marginTop: 8 }}>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <div className="progress-meta">analyzing… {progress}%</div>
          </div>
        )}
      </div>

      <div className="grid-5x5">
        {Array.from({ length: 25 }, (_, i) => {
          const result = matchResults[i];
          const isChecked = checked[i];
          const noMatch = !result && !analyzing && pendingImageSrc;
          return (
            <div
              key={i}
              className={`cell${isChecked ? " complete" : ""}`}
              onClick={() => toggleCell(i)}
              title={isChecked ? "Checked" : "Click to mark as done"}
            >
              {result?.src ? (
                <img className="cell-sprite" src={result.src} alt={`match-${i}`} />
              ) : noMatch ? (
                <div className="cell-text">no match</div>
              ) : (
                <div className="cell-empty" />
              )}
            </div>
          );
        })}
      </div>

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
