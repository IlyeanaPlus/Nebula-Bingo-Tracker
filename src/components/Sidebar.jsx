import React from 'react';

export default function Sidebar({ onGetSprites, onNewCard, progress }) {
  const { loaded, total } = progress || { loaded: 0, total: 0 };
  const pct = total ? Math.round((loaded / total) * 100) : 0;

  return (
    <aside className="sidebar">
      <h2>Controls</h2>
      <div className="stack">
        <button onClick={onGetSprites}>Get Sprites</button>
        <button onClick={onNewCard}>New Card</button>
        {total > 0 && (
          <>
            <div className="fill-bar"><div className="fill-bar-inner" style={{width:`${pct}%`}} /></div>
            <div className="progress-line">{loaded} / {total} ({pct}%)</div>
          </>
        )}
      </div>
    </aside>
  );
}
