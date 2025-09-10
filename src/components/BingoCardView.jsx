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
  analyzedOnce,     // NEW
  fileInput,
}) {
  const safeCells =
    Array.isArray(cells) && cells.length === 25 ? cells : Array(25).fill(null);
  const safeChecked =
    Array.isArray(checked) && checked.length === 25 ? checked : Array(25).fill(false);

  // --- Helpers to safely read CLIP-based match results (or legacy hashes) ---
  const cellThumb = (r) =>
    r?.matchUrl || r?.url || r?.ref?.url || null; // prefer explicit matchUrl, then url, then ref.url
  const cellLabel = (r) =>
    r?.label ?? r?.name ?? r?.key ?? (r?.empty ? "No match" : ""); // show "No match" label for empties

  return (
    <div className="bingo-card" aria-busy={!!analyzing}>
      {/* Header */}
      <div className="card-header">
        {renaming ? (
          <form onSubmit={onRenameSubmit} className="rename-form">
            <input
              autoFocus
              type="text"
              defaultValue={title}
              onBlur={onRenameSubmit}
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
          {/* Important: type='button' to avoid accidental form submissions */}
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
              <div
                className="fill-bar-inner"
                style={{ width: `${progress}%` }}
              />
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
          return (
            <div
              key={i}
              className={`cell${safeChecked[i] ? " complete" : ""}`}
              onClick={() => onToggleCell?.(i)}
              title={safeChecked[i] ? "Checked" : "Click to mark as done"}
            >
              {cell?.spriteUrl ? (
                // show the sprite only (no label/title)
                <img src={cell.spriteUrl} alt="" draggable={false} className="bingo-sprite" />
              ) : analyzedOnce && cell?.noMatch ? (
                // only after a run that produced no match
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
