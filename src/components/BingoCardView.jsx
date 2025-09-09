// src/components/BingoCardView.jsx
import React from "react";

/**
 * Pure presentational component — UI locked.
 * Renders the card layout and wires callbacks passed from the container/hook.
 *
 * Shows numbered cells by default, and after analysis:
 *  - cells with matches show the sprite image (no label),
 *  - cells with no match show a .no-match placeholder.
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
  analyzedOnce,
  checked,
  onToggleCell,
  onPickImage,
  onRemove,
  fileInput,
}) {
  const safeCells =
    Array.isArray(cells) && cells.length === 25 ? cells : Array(25).fill(null);
  const safeChecked =
    Array.isArray(checked) && checked.length === 25 ? checked : Array(25).fill(false);

  const cellThumb = (r) => r?.matchUrl || r?.url || r?.ref?.url || null;

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
              onChange={onTitleChange}
              onBlur={onRenameSubmit}
            />
          </form>
        ) : (
          <h3 className="card-title" onClick={onRenameStart} title="Click to rename">
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

          {/* Hidden file input element provided by container/hook */}
          {fileInput}
        </div>
      </div>

      {/* Progress HUD only */}
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
          return (
            <div
              key={i}
              className={`cell${safeChecked[i] ? " complete" : ""}`}
              onClick={() => onToggleCell?.(i)}
              title={safeChecked[i] ? "Checked" : "Click to mark as done"}
            >
              {src ? (
                <img src={src} alt="" />
              ) : analyzedOnce ? (
                <div className="no-match" aria-label="No match" />
              ) : (
                <div className="placeholder">{i + 1}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
