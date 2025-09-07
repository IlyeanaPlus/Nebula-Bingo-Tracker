// src/components/Sidebar.jsx
import React from "react";

export default function Sidebar({
  cards = [],
  currentIndex = 0,
  onSelect,
  onNewCard,
  onClearSaved,
  onGetSprites,
  spritesLoaded = 0,
  spritesTotal = 0,
}) {
  const savedCount = cards.filter((c) => c?.saved).length;
  const haveTotal = spritesTotal > 0;
  const pct = haveTotal ? Math.round((spritesLoaded / spritesTotal) * 100) : 0;

  return (
    <aside className="sidebar">
      <div className="panel">
        <div className="panel-title">Controls</div>
        <div className="row">
          <button className="btn" onClick={onGetSprites}>Get Sprites</button>
        </div>
        <div className="row">
          <button className="btn" onClick={onNewCard}>New Card</button>
        </div>

        {haveTotal && (
          <>
            <div className="progress-wrap" aria-label="Sprites preload progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="progress-meta">
                {spritesLoaded} / {spritesTotal} ({pct}%)
              </div>
            </div>
          </>
        )}

        <div className="meta">Saved cards: {savedCount}</div>
        <div className="row">
          <button className="btn" onClick={onClearSaved}>Clear Saved</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Cards</div>
        <div className="list">
          {cards.map((c, i) => (
            <button
              key={i}
              className={`list-item ${i === currentIndex ? "active" : ""}`}
              onClick={() => onSelect?.(i)}
              title={c?.title || `Card ${i + 1}`}
            >
              <div className="name">{c?.title || `Card ${i + 1}`}</div>
              {c?.saved ? <div className="tag">saved</div> : null}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
