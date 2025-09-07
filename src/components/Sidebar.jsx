// src/components/Sidebar.jsx
import React, { useState } from "react";
import { getSprites } from "../utils/sprites";

export default function Sidebar({
  cards = [],
  currentIndex = 0,
  onSelect,
  onNewCard,
  onClearSaved,
  onGetSprites,          // parent callback will receive the loaded index
  spritesLoaded = 0,     // optional live preload progress from parent
  spritesTotal = 0,      // optional live preload total from parent
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedMeta, setLoadedMeta] = useState(null); // { count, ts }

  const savedCount = cards.filter((c) => c?.saved).length;

  // Prefer parent progress if provided; fall back to the count we just fetched
  const haveParentProgress = spritesTotal > 0;
  const pct = haveParentProgress
    ? Math.round((spritesLoaded / spritesTotal) * 100)
    : (loadedMeta ? 100 : 0);

  async function handleGetSprites() {
    setError("");
    setLoading(true);
    try {
      // Load /drive_cache.json and filter to .png URLs
      const index = await getSprites();
      // Update local meta for display
      setLoadedMeta({ count: Object.keys(index).length, ts: new Date().toLocaleTimeString() });
      // Hand off to parent (app state owns spritesIndex)
      onGetSprites?.(index);
    } catch (e) {
      setError(e?.message ? String(e.message) : "Failed to load drive_cache.json");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="panel">
        <div className="panel-title">Controls</div>

        <div className="row">
          <button className="btn" onClick={handleGetSprites} disabled={loading}>
            {loading ? "Loading…" : "Get Sprites"}
          </button>
        </div>

        <div className="row">
          <button className="btn" onClick={onNewCard}>New Card</button>
        </div>

        {/* Progress for sprite loading/preloading */}
        {(haveParentProgress || loadedMeta) && (
          <div className="progress-wrap" aria-label="Sprites preload progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="progress-meta" title="Sprite load status">
              {haveParentProgress ? (
                <>
                  {spritesLoaded} / {spritesTotal} ({pct}%)
                </>
              ) : loadedMeta ? (
                <>
                  Loaded {loadedMeta.count} sprites @ {loadedMeta.ts}
                </>
              ) : null}
            </div>
          </div>
        )}

        {error && (
          <div className="meta" style={{ color: "#ff6b6b" }}>
            {error}
          </div>
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
