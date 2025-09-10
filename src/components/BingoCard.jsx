// src/components/BingoCardView.jsx
import React from "react";

export default function BingoCardView({
  /* title / rename */
  title,
  renaming,
  onRenameStart,
  onTitleChange,
  onRenameSubmit,

  /* analyze / fill */
  analyzing,
  progress,
  onPickImage,
  fileInput, // <input type="file" .../> element passed by container

  /* grid */
  cells = [],
  analyzedOnce = false,
  checked = [],
  onToggleCell,

  /* remove */
  onRemove,
}) {
  return (
    <div className="card-wrap">
      {/* Header */}
      <header className="card-header">
        <div className="card-title">
          {renaming ? (
            <form onSubmit={onRenameSubmit}>
              <input
                autoFocus
                defaultValue={title || ""}
                onChange={onTitleChange}
                className="title-input"
              />
            </form>
          ) : (
            <h2 className="title" onClick={onRenameStart} role="button" tabIndex={0}>
              {title || "Card"}
            </h2>
          )}
        </div>

        <div className="card-actions">
          <button className="btn" onClick={onPickImage} disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Fill"}
          </button>
          <button className="btn btn-danger" onClick={onRemove} disabled={analyzing}>
            Remove
          </button>
        </div>
      </header>

      {/* Hidden file input lives here so it’s in the DOM */}
      {fileInput}

      {/* Progress / analyzing indicator */}
      {analyzing && (
        <div className="analyze-bar" aria-live="polite">
          <div className="analyze-bar__label">Analyzing…</div>
          <div className="analyze-bar__track">
            <div
              className="analyze-bar__fill"
              style={{ width: `${Math.max(0, Math.min(100, progress || 0))}%` }}
            />
          </div>
        </div>
      )}

      {/* 5x5 grid */}
      <main className="main-content">
        <div className="cards-grid">
          {(cells.length ? cells : Array.from({ length: 25 }, (_, i) => ({ idx: i }))).map(
            (cell, i) => {
              const isChecked = !!checked[i];
              const hasSprite = !!cell?.spriteUrl;
              const showNoMatch = analyzedOnce && cell?.noMatch && !hasSprite;

              return (
                <button
                  key={i}
                  type="button"
                  className={
                    "bingo-cell" +
                    (isChecked ? " bingo-cell--checked" : "") +
                    (showNoMatch ? " bingo-cell--no-match" : "")
                  }
                  onClick={() => onToggleCell?.(i)}
                  title={hasSprite ? "" : undefined}
                >
                  {hasSprite ? (
                    // Sprite only — no label/title/name
                    <img
                      src={cell.spriteUrl}
                      alt=""
                      draggable={false}
                      className="bingo-sprite"
                    />
                  ) : showNoMatch ? (
                    // Only after a run completed with no match
                    <div className="no-match">no match</div>
                  ) : (
                    // Blank numbered cell before any run
                    <div className="cell-index">{i + 1}</div>
                  )}
                </button>
              );
            }
          )}
        </div>

        {/* Optional helper text when nothing has run yet */}
        {!analyzing && !analyzedOnce && !cells.some(c => c?.spriteUrl) && (
          <div className="empty-hint">
            Click <strong>Fill</strong> and choose an image to analyze the grid.
          </div>
        )}
      </main>
    </div>
  );
}
