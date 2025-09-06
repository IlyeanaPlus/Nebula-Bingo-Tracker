import React from 'react';

export default function Header({ loadingCount, total, onGetSprites, onNewCard }) {
  const showProgress = total > 0 && loadingCount >= 0 && loadingCount <= total;

  return (
    <header className="app-header">
      <div className="title">Nebula Bingo Tracker</div>
      <div className="spacer" />
      <div className="controls">
        <button onClick={onGetSprites}>Get Sprites</button>
        <button onClick={onNewCard}>New Card</button>
      </div>
      {showProgress && (
        <div className="manifest-progress" title="Loading sprite manifest">
          {loadingCount} / {total}
        </div>
      )}
    </header>
  );
}
