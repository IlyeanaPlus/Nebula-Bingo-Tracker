// src/components/BingoCardView.jsx
import React from "react";

/**
 * Pure presentational component — UI locked.
 * Renders the card layout and wires callbacks passed from the container/hook.
 */
export default function BingoCardView({
  title,
  renaming,
  onRenameStart,
  onRenameSubmit,
  onTitleChange,
  analyzing,
  progress,
  spritesReady,
  cells,
  checked,
  onToggleCell,
  onPickImage,
  onSave,
  onRemove,
  fileInput,
}) {
  const safeCells = Array.isArray(cells) && cells.length === 25 ? cells : Array(25).fill(null);
  const safeChecked = Array.isArray(checked) && checked.length === 25 ? checked : Array(25).fill(false);

  return (
    <div className="bingo-card">
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
          <button className="btn" onClick={onSave} disabled={analyzing}>Save</button>
          <button className="btn danger" onClick={onRemove} disabled={analyzing}>Remove</button>
          {fileInput}
        </div>
      </div>

      <div className="bingo-card__status">
        {spritesReady ? <span className="ok">sprites loaded!</span> : <span className="warn">load sprites to enable matching</span>}
        {analyzing && (
          <div className="progress-wrap">
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <div className="progress-meta">analyzing… {progress}%</div>
          </div>
        )}
      </div>

      <div className="grid-5x5">
        {safeCells.map((result, i) => (
          <div key={i} className={`cell${safeChecked[i] ? " complete" : ""}`} onClick={() => onToggleCell?.(i)}>
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
