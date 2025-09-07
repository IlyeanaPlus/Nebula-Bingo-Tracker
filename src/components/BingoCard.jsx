// src/components/BingoCard.jsx
import React, { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import GridTunerModal from "./GridTunerModal.jsx";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

/**
 * MERGED VERSION
 * - Preserves repo features (progress HUD, Save, per-cell checked toggles)
 * - Reconciles props with App.jsx: { card, onChange, onRemove, manifest }
 * - Uses GridTunerModal flow; crops via computeCrops25(imageSrc, fractions)
 */
export default function BingoCard({ card, onChange, onRemove, manifest }) {
  // --- derived from card ---
  const nameFromCard = card?.title || "New Card";
  const cellsFromCard =
    Array.isArray(card?.cells) && card.cells.length === 25
      ? card.cells
      : Array.from({ length: 25 }, () => ({ label: "", matchKey: "", matchUrl: "" }));
  const checkedFromCard =
    Array.isArray(card?.checked) && card.checked.length === 25
      ? card.checked
      : Array(25).fill(false);

  // --- local UI state ---
  const [name, setName] = useState(nameFromCard);
  const [renaming, setRenaming] = useState(false);
  const [cells, setCells] = useState(cellsFromCard);
  const [checked, setChecked] = useState(checkedFromCard);

  const [fractions, setFractions] = useState(loadFractions());
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  const spritesReady = !!manifest && Object.keys(manifest).length > 0;

  // --- header: rename inline -> push to parent ---
  function handleRenameClick() {
    setRenaming(true);
  }
  function handleRenameSubmit(e) {
    e.preventDefault();
    setRenaming(false);
    const next = { ...(card || {}), title: name, cells, checked };
    onChange?.(next);
  }

  // --- actions ---
  function handleRemoveClick() {
    onRemove?.();
  }
  function handleOpenFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (pendingImageSrc) URL.revokeObjectURL(pendingImageSrc);
    const url = URL.createObjectURL(file);
    setPendingImageSrc(url);
    setShowTuner(true);
  }

  function onTunerCancel() {
    if (pendingImageSrc) URL.revokeObjectURL(pendingImageSrc);
    setPendingImageSrc("");
    setShowTuner(false);
  }

  async function onTunerConfirm(newFractions) {
    setShowTuner(false);
    if (!pendingImageSrc) return;
    try {
      setAnalyzing(true);
      setProgress(0);
      setFractions(newFractions);
      saveFractions(newFractions);

      // 1) Compute 25 crops as data URLs
      const crops = await computeCrops25(pendingImageSrc, newFractions);
      URL.revokeObjectURL(pendingImageSrc);
      setPendingImageSrc("");

      // 2) Run matcher with progress (if sprites are ready)
      let nextCells = Array.from({ length: 25 }, () => ({
        label: "",
        matchKey: "",
        matchUrl: "",
      }));

      if (spritesReady) {
        const refIndex = await prepareRefIndex(manifest);
        for (let i = 0; i < 25; i++) {
          const cropDataUrl = crops[i];
          const result = await findBestMatch(cropDataUrl, refIndex);
          if (result) {
            nextCells[i] = {
              label: result.name || result.key || `Cell ${i + 1}`,
              matchKey: result.key || "",
              matchUrl: result.src || result.url || "",
            };
          }
          setProgress(Math.round(((i + 1) / 25) * 100));
        }
      } else {
        // No sprites index: leave cells blank but advance progress to 100
        setProgress(100);
      }

      setCells(nextCells);

      // 3) Push result up to App
      const nextCard = { ...(card || {}), title: name, cells: nextCells, checked };
      onChange?.(nextCard);
    } catch (e) {
      console.error(e);
      alert("Failed to process image");
    } finally {
      setAnalyzing(false);
    }
  }

  // --- grid interactions ---
  function toggleCell(i) {
    const next = checked.slice();
    next[i] = !next[i];
    setChecked(next);
    onChange?.({ ...(card || {}), title: name, cells, checked: next });
  }

  // --- Save card payload ---
  function handleSave() {
    const payload = {
      title: name,
      fractions,
      cells,
      checked,
      ts: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name || "card").replace(/\s+/g, "_").toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --- render ---
  return (
    <div className="bingo-card">
      <div className="card-header">
        {renaming ? (
          <form onSubmit={handleRenameSubmit} className="rename-form">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRenameSubmit}
            />
          </form>
        ) : (
          <h3
            className="card-title"
            onClick={handleRenameClick}
            title="Click to rename"
          >
            {name}
          </h3>
        )}

        <div className="card-actions">
          <button className="btn" onClick={handleOpenFile} disabled={analyzing}>
            Fill
          </button>
          <button className="btn" onClick={handleSave} disabled={analyzing}>
            Save
          </button>
          <button
            className="btn danger"
            onClick={handleRemoveClick}
            disabled={analyzing}
          >
            Remove
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* status + progress */}
      <div className="fill-hud" style={{ display: analyzing ? "block" : "none" }}>
        <div className="fill-box">
          <div className="fill-title">Analyzing…</div>
          <div className="fill-bar">
            <div className="fill-bar-inner" style={{ width: `${progress}%` }} />
          </div>
          <div className="fill-meta">{progress}%</div>
          {!spritesReady && (
            <div className="fill-hint">Tip: Load sprites to enable matching.</div>
          )}
        </div>
      </div>

      <div className="grid-5x5">
        {cells.map((cell, i) => (
          <div
            key={i}
            className={`cell${checked[i] ? " complete" : ""}`}
            title={cell.label || `Cell ${i + 1}`}
            onClick={() => toggleCell(i)}
          >
            {cell.matchUrl ? (
              <img src={cell.matchUrl} alt={cell.label || `cell ${i + 1}`} />
            ) : (
              <div className="placeholder">{i + 1}</div>
            )}
            {cell.label ? <div className="caption">{cell.label}</div> : null}
          </div>
        ))}
      </div>

      {/* Grid tuner modal (portaled) */}
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
