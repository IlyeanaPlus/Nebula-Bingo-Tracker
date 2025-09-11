// src/components/BingoCardView.jsx
import React, { useRef } from "react";

/**
 * Pure UI view — consumes the frozen View Contract (V1).
 * Props (exact):
 * - title, renaming, onRenameStart, onTitleChange, onRenameSubmit, onRemove
 * - analyzing, progress
 * - cells[25], checked[25], onToggleCell(index)
 * - onPickImage(), fileInput (hidden input element)
 * - analyzedOnce
 */
export default function BingoCardView(props) {
  const {
    title,
    renaming,
    onRenameStart,
    onTitleChange,
    onRenameSubmit,
    onRemove,

    analyzing,
    progress,

    cells,
    checked,
    onToggleCell,

    onPickImage,
    fileInput,

    analyzedOnce,
  } = props;

  const renameInputRef = useRef(null);

  // Submit rename on Enter; blur also submits (handled below)
  const onRenameFormSubmit = (e) => {
    e.preventDefault();
    const val = renameInputRef.current?.value ?? "";
    onRenameSubmit?.(val.trim());
  };

  const onRenameBlur = () => {
    const val = renameInputRef.current?.value ?? "";
    onRenameSubmit?.(val.trim());
  };

  return (
    <div className="bingo-card" aria-busy={!!analyzing}>
      {/* Header */}
      <div className="card-header">
        {renaming ? (
          <form className="rename-form" onSubmit={onRenameFormSubmit}>
            <input
              ref={renameInputRef}
              type="text"
              defaultValue={title || ""}
              onChange={onTitleChange}
              onBlur={onRenameBlur}
              autoFocus
              aria-label="Rename card title"
            />
          </form>
        ) : (
          <h3
            className="card-title"
            title="Click to rename"
            onClick={onRenameStart}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onRenameStart?.();
            }}
          >
            {title || "New Card"}
          </h3>
        )}

        {/* Actions row sits below the title */}
        <div className="card-actions row">
          <button className="btn card-btn" type="button" onClick={onPickImage}>
            Fill
          </button>
          <button
            className="btn btn--primary card-btn"
            type="button"
            onClick={onRemove}
            aria-label="Remove card"
          >
            Remove
          </button>
        </div>
      </div>


      {/* Hidden file input element is provided by the adapter */}
      {fileInput}

      {/* Progress HUD */}
      {analyzing ? (
        <div className="fill-hud" aria-live="polite">
          <div className="fill-box">
            <div className="fill-title">Analyzing…</div>
            <div className="fill-bar">
              <div
                className="fill-bar-inner"
                style={{ width: `${Math.max(0, Math.min(100, progress || 0))}%` }}
              />
            </div>
            <div className="fill-meta">{Math.round(progress || 0)}%</div>
          </div>
        </div>
      ) : null}

      {/* Grid */}
      <div className="grid-5x5">
        {Array.from({ length: 25 }).map((_, i) => {
          const cell = cells?.[i] ?? null;
          const isChecked = !!checked?.[i];
          const hasImg =
            !!(cell && (cell.spriteUrl || cell.matchUrl || cell.url || cell?.ref?.url));
          const caption =
            (cell && (cell.label || cell.name || cell.key)) ||
            (cell?.noMatch ? "No match" : "");

        const imgSrc =
            (cell && (cell.spriteUrl || cell.matchUrl || cell.url || cell?.ref?.url)) ||
            "";

          return (
            <div
              key={i}
              className={`cell${isChecked ? " complete" : ""}${
                !hasImg && analyzedOnce ? " no-match" : ""
              }`}
              onClick={() => props.onToggleCell?.(i)}
            >
              {hasImg ? (
                <img className="bingo-sprite" src={imgSrc} alt={caption || `Cell ${i + 1}`} />
              ) : (
                <div className="bingo-sprite" />
              )}
              <div className="caption">{caption}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
