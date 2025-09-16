// src/components/BingoCard.jsx
import React, { useEffect, useRef } from "react";
import useBingoCard from "../hooks/useBingoCard";

/* Helpers */
function titleCaseSlug(slug = "") {
  if (!slug) return "";
  return slug
    .split(/[-\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(/-[a-z0-9]/i.test(slug) ? "-" : " ");
}
const POKE_PAT = /^pokemon[_\s]+(\d+)[_\s]+([a-z0-9\-]+)/i;
function isRawPokemonLabel(s = "") { return POKE_PAT.test(s); }
function deriveFromUrl(url = "") {
  const file = (url.split("/").pop() || "").replace(/\.(png|jpg|jpeg|webp)$/i, "");
  const m = POKE_PAT.exec(file);
  return m ? titleCaseSlug(m[2]) : "";
}

/** Derive friendly display name from cell + match ref */
function deriveDisplayName(cell = {}, ref) {
  // 1) Best: explicit slug on v4 items
  if (ref?.slug) return titleCaseSlug(ref.slug);

  // 2) Next: parse from the matched sprite URL (most reliable)
  const urlFromEither =
    cell.spriteUrl || cell.imageUrl || cell.matchUrl || cell.src || cell.url || ref?.url || "";
  const byUrl = deriveFromUrl(urlFromEither);
  if (byUrl) return byUrl;

  // 3) Fallback to key-style strings (strip "pokemon_###_")
  const raw = ref?.key || cell.matchKey || cell.label || "";
  const mKey = POKE_PAT.exec(raw);
  if (mKey) return titleCaseSlug(mKey[2]);

  // 4) If label is already friendly (not a raw pattern), keep it
  if (cell.displayName) return cell.displayName;
  if (cell.name && !isRawPokemonLabel(cell.name)) return cell.name;
  if (cell.label && !isRawPokemonLabel(cell.label)) return cell.label;

  // 5) Last resort: return whatever label we have
  return cell.label || "";
}

export default function BingoCard({ card, manifest, onChange, onRemove }) {
  const {
    title, setTitle, renaming, onRenameStart, onRenameCancel, onRenameSubmit,
    analyzing, progress, checked, setChecked,
    onFileChosen,
    results, // from hook
  } = useBingoCard({ card, manifest, onChange, onRemove });

  const fileRef = useRef(null);

  useEffect(() => {
    (window.__NBT_DEV ||= {});
    window.__NBT_DEV.card = card;
    window.__NBT_DEV.results = results;
  }, [card, results]);

  const handleFilePick = () => fileRef.current?.click();
  const onFileInput = (e) => {
    const f = e.currentTarget.files?.[0];
    if (f) onFileChosen(f);
    e.currentTarget.value = "";
  };

  const toggleCell = (i) => {
    const next = [...(checked || Array(25).fill(false))];
    next[i] = !next[i];
    setChecked(next);
  };

  return (
    <div className="bingo-card" aria-busy={!!analyzing} style={cardStyle} data-component="BingoCard">
      <div className="card-header" style={headerStyle}>
        {renaming ? (
          <form onSubmit={onRenameSubmit} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              autoFocus
              type="text"
              value={title || ""}
              onChange={(e) => setTitle(e.target.value)}
              style={renameInputStyle}
              aria-label="Rename card title"
            />
            <button type="submit" className="btn">Save</button>
            <button type="button" className="btn" onClick={onRenameCancel}>Cancel</button>
          </form>
        ) : (
          <h2
            className="card-title"
            title="Click to rename"
            onClick={onRenameStart}
            style={{ margin: 0, cursor: "text", fontSize: 18, fontWeight: 700 }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onRenameStart?.(); }}
          >
            {title || "New Card"}
          </h2>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFileInput} style={{ display: "none" }} />
          <button className="btn" onClick={handleFilePick} disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Choose Image"}
          </button>
          <button className="btn btn--primary" onClick={onRemove} aria-label="Remove card">Remove</button>
        </div>
      </div>

      <ProgressBar progress={progress} active={analyzing} />

      <div className="grid-5x5" style={gridStyle}>
        {Array.from({ length: 25 }).map((_, i) => {
          const cell = card?.cells?.[i] ?? {};
          const best = results?.[i]?.best || null;
          const ref = best?.ref || null;

          const imgSrc =
            cell.spriteUrl ||
            cell.matchUrl ||
            cell.imageUrl ||
            cell.src ||
            cell.url ||
            ref?.url ||
            "";

          const caption = deriveDisplayName(cell, ref);
          const isChecked = !!checked?.[i];
          const hasImg = !!imgSrc;

          return (
            <button
              key={i}
              type="button"
              className={`cell${isChecked ? " complete" : ""}${!hasImg && !analyzing ? " no-match" : ""}`}
              onClick={() => toggleCell(i)}
              title={caption || `Cell ${i + 1}`}
              data-index={i + 1}
              data-has={String(hasImg)}
              data-src={imgSrc || ""}
              style={{
                ...cellStyle,
                outline: isChecked ? "2px solid var(--accent,#7bd389)" : "1px solid var(--border,#333)",
              }}
            >
              {hasImg ? (
                <img
                  className="bingo-sprite"
                  src={imgSrc}
                  alt={caption || `Cell ${i + 1}`}
                  decoding="async"
                  loading="eager"
                  draggable={false}
                  style={imgStyle}
                  onError={(e) => { e.currentTarget.style.display = "none"; console.warn("[BingoCard] image error:", imgSrc); }}
                />
              ) : (
                <div className="bingo-sprite" style={imgPlaceholder} />
              )}
              <div className="caption" style={labelStyle}>
                {caption || <span style={{ opacity: 0.5 }}>—</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProgressBar({ progress, active }) {
  const clamped = Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} style={pbWrap}>
      <div style={{ ...pbFill, width: `${clamped}%`, transition: "width 280ms ease" }} />
      <span style={pbText}>{active ? `${Math.round(clamped)}%` : clamped >= 100 ? "Done" : `${Math.round(clamped)}%`}</span>
    </div>
  );
}

/* Styles (unchanged) */
const cardStyle = { display: "grid", gap: 10, padding: 12, border: "1px solid #2a2a2a", borderRadius: 12, background: "var(--card-bg,#141414)" };
const headerStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
const renameInputStyle = { padding: "6px 8px", background: "transparent", color: "inherit", border: "1px solid #333", borderRadius: 8, minWidth: 220 };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 };
const cellStyle = { display: "grid", gridTemplateRows: "auto 1fr", gap: 6, padding: 8, borderRadius: 10, background: "transparent", textAlign: "initial" };
const imgStyle = { display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "contain", imageRendering: "pixelated", borderRadius: 8, opacity: 1, visibility: "visible", mixBlendMode: "normal", pointerEvents: "none" };
const imgPlaceholder = { width: "100%", aspectRatio: "1 / 1", borderRadius: 8, background: "transparent" };
const labelStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", fontSize: 12, lineHeight: 1.2, minHeight: 14, wordBreak: "break-word", textAlign: "center", textTransform: "none", pointerEvents: "none" };
const pbWrap = { position: "relative", height: 10, borderRadius: 999, overflow: "hidden", background: "#1a1a1a", border: "1px solid #2a2a2a" };
const pbFill = { position: "absolute", inset: 1, borderRadius: 999, background: "linear-gradient(90deg,#47cc93,#7ee0b0)" };
const pbText = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.85)" };
