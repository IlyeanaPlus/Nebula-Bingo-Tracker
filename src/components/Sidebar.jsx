// src/components/Sidebar.jsx
import React from "react";

export default function Sidebar({
  cards = [],
  currentIndex = 0,
  onSelect,
  onNewCard,
  onClearSaved,
}) {
  const savedCount = cards.filter((c) => c?.saved).length;

  return (
    <aside className="sidebar">
      <div className="panel">
        <div className="panel-title">Controls</div>
        <div className="row">
          <button className="btn" onClick={onNewCard}>New Card</button>
        </div>
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
