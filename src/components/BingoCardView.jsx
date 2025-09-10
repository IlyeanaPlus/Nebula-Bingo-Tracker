// src/components/BingoCardView.jsx
import React from "react";

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
  analyzedOnce,     // used to show "no match" only after a run
  fileInput,        // hidden <input type="file"> from container
}) {
  const safeCells =
    Array.isArray(cells) && cells.length === 25 ? cells : Array(25).fill(null);
  const safeChecked =
    Array.isArray(checked) && checked.length === 25 ? checked : Array(25).fill(false);

  // Prefer explicit spriteUrl, otherwise try common url keys for backward compat.
  const cellThumb = (r) =>
    r?.spriteUrl || r?.matchUrl || r?.url || r?.ref?.url || null;

  const cellLabel = (r) =>
    r?.label ?? r?.name ?? r?.key ?? (r?.empty ? "No match" : "");

  return (
    <div className="bingo-card" aria-busy={!!analyzing}>
      {/* Header */}
      <div className="card-header">
        {renaming ? (
          <form onSubmit={onRenameSubmit} className="rename-form">
            <input
              autoFocus
              type="text"
              value={title}
              onBlur={onRenameSubmit}
              onChange={onTitleChange}
            />
          </form>
        ) : (
          <h3
            className="card-title"
            onClick={onRenameStart}
            title="Click to rename"
          >
            {title}
          </h3>
        )}

        <div className="card-actions">
          <button
            className="btn"
            type="button"
            onClick={onPickImage}
            disabled={analyzing}
            aria-label="Fill from screenshot"
            title="Fill"
          >
            Fill
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={onRemove}
            disabled={analyzing}
            aria-label="Remove card"
          >
            Remove
          </button>
          {/* Hidden file input element */}
          {fileInput}
        </div>
      </div>

      {/* Progress HUD */}
      {analyzing && (
        <div className="fill-hud" role="status" aria-live="polite">
          <div className="fill-box">
            <div className="fill-title">Analyzing…</div>
            <div className="fill-bar" aria-hidden="true">
              <div className="fill-bar-inner" style={{ width: `${progress}%` }} />
            </div>
            <div className="fill-meta">{progress}%</div>
          </div>
        </div>
      )}

      {/* 5x5 grid */}
      <div className="grid-5x5">
        {safeCells.map((result, i) => {
          const src = cellThumb(result);
          const alt = cellLabel(result) || `cell-${i + 1}`;
          const noMatch = analyzedOnce && result?.noMatch && !src;

          return (
            <div
              key={i}
              className={`cell${safeChecked[i] ? " complete" : ""}`}
              onClick={() => onToggleCell?.(i)}
              title={safeChecked[i] ? "Checked" : "Click to mark as done"}
            >
              {src ? (
                <img src={src} alt="" draggable={false} className="bingo-sprite" />
              ) : noMatch ? (
                <div className="no-match">no match</div>
              ) : (
                <></>
              )}
              <div className="caption">{alt}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
