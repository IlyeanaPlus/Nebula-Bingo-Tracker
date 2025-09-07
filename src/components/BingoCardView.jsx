// src/components/BingoCardView.jsx
import React from "react";

/**
 * Pure presentational component — UI locked.
 * Renders the card layout and wires callbacks passed from the container/hook.
 *
 * Sprites notice has been removed; only progress HUD remains here.
 */
export default function BingoCardView({
  title,
  renaming,
  onRenameStart,
  onRenameSubmit,
  onTitleChange,
  analyzing,
  progress,
  cells,
  checked,
  onToggleCell,
  onPickImage,
  onRemove,
  // CHANGED: accept props for a hidden file input (from useBingoCard)
  fileInputProps,
}) {
  const safeCells = Array.isArray(cells) && cells.length === 25 ? cells : Array(25).fill(null);
  const safeChecked = Array.isArray(checked) && checked.length === 25 ? checked : Array(25).fill(false);

  return (
    <div className="bingo-card">
      {/* Header */}
      <div className="card-header">
        {renaming ? (
          <form onSubmit={onRenameSubmit} className="rename-form">
            <input autoFocus value={title} onChange={onTitleChange} onBlur={onRenameSubmit} />
          </form>
        ) : (
          <h3 className="card-title" onClick={onRenameStart} title="Click to rename">{title}</h3>
        )}

        <div className="card-actions">
          <button className="btn" onClick={onPickImage} disabled={analyzing}>Fill</button>
          <button className="btn danger" onClick={onRemove} disabled={analyzing}>Remove</button>
          {/* CHANGED: render the hidden file input here */}
          <input {...fileInputProps} />
        </div>
      </div>

      {/* Progress HUD only */}
      {analyzing && (
        <div className="fill-hud">
          <div className="fill-box">
            <div className="fill-title">Analyzing…</div>
            <div className="fill-bar">
              <div className="fill-bar-inner" style={{ width: `${progress}%` }} />
            </div>
            <div className="fill-meta">{progress}%</div>
          </div>
        </div>
      )}

      {/* 5x5 grid */}
      <div className="grid-5x5">
        {safeCells.map((result, i) => (
          <div
            key={i}
            className={`cell${safeChecked[i] ? " complete" : ""}`}
            onClick={() => onToggleCell?.(i)}
            title={safeChecked[i] ? "Checked" : "Click to mark as done"}
          >
            {result?.matchUrl ? (
              <img src={result.matchUrl} alt={result?.label || `cell-${i}`} />
            ) : (
              <div className="placeholder">{i + 1}</div>
            )}
            {result?.label ? <div className="caption">{result.label}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
