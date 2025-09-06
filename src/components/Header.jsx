// src/components/Header.jsx
import React from 'react';

export default function Header({
  totalSprites = 0,
  loadedSprites = 0,
  spritesLoading = false,
  onGetSprites,
  onNewCard,
}) {
  const pct = totalSprites ? Math.round((loadedSprites / totalSprites) * 100) : 0;

  return (
    <header className="app-header">
      <div className="title">Nebula Bingo Tracker</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onGetSprites} disabled={spritesLoading}>
          {spritesLoading ? 'Getting Sprites…' : 'Get Sprites'}
        </button>

        {/* Progress readout */}
        <span style={{ fontSize: 12, opacity: 0.8, minWidth: 110, textAlign: 'right' }}>
          {spritesLoading || totalSprites
            ? `${loadedSprites} / ${totalSprites}${spritesLoading ? ` (${pct}%)` : ''}`
            : '0 / 0'}
        </span>

        {/* keep New Card here or move to sidebar; still available */}
        <button onClick={onNewCard}>New Card</button>
      </div>
    </header>
  );
}
