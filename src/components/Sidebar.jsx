// src/components/Sidebar.jsx
import React from 'react';

export default function Sidebar({ onNewCard, savedCount = 0, onClearSaved }) {
  return (
    <aside className="sidebar">
      <h2>Controls</h2>
      <div className="stack">
        <button onClick={onNewCard}>New Card</button>
        <div className="progress-line">Saved cards: {savedCount}</div>
        {onClearSaved && (
          <button
            onClick={onClearSaved}
            title="Remove all saved cards from this browser"
          >
            Clear Saved
          </button>
        )}
      </div>
    </aside>
  );
}
