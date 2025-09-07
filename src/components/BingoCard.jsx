// src/components/BingoCard.jsx
import React, { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import GridTunerModal from "./GridTunerModal";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

export default function BingoCard({
  id,
  title,
  spritesIndex,
  onRemove,
  onRename,
}) {
  // --- state ---
  const [name, setName] = useState(title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const [matchResults, setMatchResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const [fractions, setFractions] = useState(loadFractions());
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  const spritesReady = !!spritesIndex && Object.keys(spritesIndex).length > 0;

  // --- header: rename inline ---
  function handleRenameClick() {
    setRenaming(true);
  }
  function handleRenameSubmit(e) {
    e.preventDefault();
    setRenaming(false);
    onRename?.(id, name);
  }

  // --- Fill pipeline ---
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

    // load chosen screenshot
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = pendingImageSrc;
    });

    console.log(
      `[Card ${id}] GridTuner confirm`,
      { imgW: img.naturalWidth, imgH: img.naturalHeight, fractions: newFractions }
    );

    // build the 25 crops for this square
    const crops = computeCrops25(img, newFractions);
    console.log(`[Card ${id}] computeCrops25 -> ${crops.length} crops`);

    // run matcher with progress
    setAnalyzing(true);
    setProgress(0);
    try {
      const t0 = performance.now();
      const results = await matchAll(crops, (i) =>
        setProgress(Math.round(((i + 1) / 25) * 100))
      );
      const t1 = performance.now();
      console.log(`[Card ${id}] matchAll finished in ${(t1 - t0).toFixed(1)} ms`);
      setMatchResults(results);
    } finally {
      setAnalyzing(false);
    }
  }
  function onTunerCancel() {
    setShowTuner(false);
    setPendingImageSrc(null);
  }

  // --- grid interactions ---
  function toggleCell(i) {
    setChecked((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      return next;
    });
  }

  // --- Save card payload ---
  function handleSave() {
    const payload = {
      id,
      name,
      fractions,
      matches: matchResults,
      checked,
      ts: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name || "card").replace(/\s+/g, "_").toLowerCase()}_${id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --- matcher wrapper ---
  async function matchAll(crops, onStep) {
    if (!spritesReady) {
      console.warn(`[Card ${id}] matchAll aborted: no sprites loaded`);
      return Array(25).fill(null);
    }
    console.log(
      `[Card ${id}] preparing ref index with`,
      Object.keys(spritesIndex).length,
      "sprites…"
    );
    const prepared = prepareRefIndex(spritesIndex);
    console.log(`[Card ${id}] ref index ready`);

    const out = [];
    for (let i = 0; i < 25; i++) {
      const cropCanvas = crops[i];
      const dataURL = cropCanvas.toDataURL("image/png"); // matcher expects dataURL
      const start = performance.now();
      const best = await findBestMatch(dataURL, prepared);
      const end = performance.now();

      if (best) {
        console.log(
          `[Card ${id}] Cell ${i + 1}/25 MATCH "${best.name}" in ${(end - start).toFixed(1)} ms`,
          { mse: best.mse, ssim: best.ssim, ncc: best.ncc }
        );
      } else {
        console.log(
          `[Card ${id}] Cell ${i + 1}/25 NO MATCH in ${(end - start).toFixed(1)} ms`
        );
      }

      out.push(best || null);
      onStep?.(i);
    }
    return out;
  }

  return (
    <div className="card">
      {/* Card header row */}
      <div className="card-header">
        {/* centered title */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
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

        {/* actions aligned right */}
        <div className="actions" style={{ display: "flex", gap: 8 }}>
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

      {/* status + analyzing bar */}
      <div className="bingo-card__status" style={{ marginBottom: 10 }}>
        {spritesReady ? (
          <span className="ok">sprites loaded!</span>
        ) : (
          <span className="warn">load sprites to enable matching</span>
        )}
        {analyzing && (
          <div className="progress-wrap" style={{ marginTop: 8 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-meta">analyzing… {progress}%</div>
          </div>
        )}
      </div>

      {/* 5×5 grid */}
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
                <img src={result.src} alt={`match-${i}`} />
              ) : noMatch ? (
                <div className="cell-text">no match</div>
              ) : (
                <div className="cell-empty" />
              )}
            </div>
          );
        })}
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
