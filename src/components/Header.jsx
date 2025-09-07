// src/components/Header.jsx
import React from "react";

export default function Header({ title = "Nebula Bingo Tracker", spritesCount = 0, onGetSprites }) {
  return (
    <header className="app-header">
      <div className="title">{title}</div>
      <div className="spacer" />
      <button className="btn" onClick={onGetSprites}>
        Get Sprites
      </button>
      <div className="badge">{spritesCount} / 2047</div>
    </header>
  );
}
