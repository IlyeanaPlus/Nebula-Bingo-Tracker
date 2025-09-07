// src/components/Sidebar.jsx
import React, { useState } from "react";
import { getSprites, preloadSprites } from "../utils/sprites";

export default function Sidebar({
  cards = [],
  currentIndex = 0,
  onSelect,
  onNewCard,
  onClearSaved,
  onGetSprites,          // parent callback receives loaded sprite index
  spritesLoaded = 0,     // optional live preload progress from parent
  spritesTotal = 0,      // optional live preload total from parent
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [localProgress, setLocalProgress] = useState({ loaded: 0, total: 0 });
  const [loadedMeta, setLoadedMeta] = useState(null); // { count, ts }

  const savedCount = cards.filter((c) => c?.saved).length;

  // Prefer parent progress if provided; otherwise use local preload progress
  const haveParentProgress = spritesTotal > 0;
  const loaded = haveParentProgress ? spritesLoaded : localProgress.loaded;
  const total = haveParentProgress ? spritesTotal : localProgress.total;
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  const showProgress = total > 0 || haveParentProgress;

  async function handleGetSprites() {
    setError("");
    setLoading(true);
    setLocalProgress({ loaded: 0, total: 0 });
    try {
      // 1) Load drive_cache.json (path-safe for GH Pages & local dev)
      const index = await getSprites();
      setLoadedMeta({ count: Object.keys(index).length, ts: new Date().toLocaleTimeString() });
      // Hand off to parent so App can store spritesIndex
      onGetSprites?.(index);

      // 2) Optionally warm the browser cache with preload progress
      await preloadSprites(index, (l, t) => setLocalProgress({ loaded: l, total: t }));
    } catch (e) {
      setError(
        e?.message?.includes("404")
          ? "drive_cache.json not found in /public (404)"
          : e?.message || "Failed to load sprites"
      );
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

        {showProgress && (
          <div className="progress-wrap" aria-label="Sprites preload progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-meta">
              {loaded} / {total} ({pct}%)
            </div>
          </div>
        )}

        {loadedMeta && !haveParentProgress && (
          <div className="meta">Loaded {loadedMeta.count} sprites @ {loadedMeta.ts}</div>
        )}

        {error && <div className="meta" style={{ color: "#ff6b6b" }}>{error}</div>}

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
