// src/components/Sidebar.jsx
import React, { useState } from "react";
import { getSprites, preloadSprites } from "../utils/sprites";

export default function Sidebar({
  cards = [],
  currentIndex = 0,
  onSelect,
  onNewCard,
  onGetSprites,          // parent callback receives the loaded index
  spritesLoaded = 0,     // parent-provided live progress (optional)
  spritesTotal = 0,      // parent-provided live progress (optional)
  spritesReady = false,  // NEW: whether manifest is loaded
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGetSprites() {
    setError("");
    setLoading(true);
    try {
      const index = await getSprites();
      if (!index || Object.keys(index).length === 0) {
        setError("No sprites found in drive_cache.json");
        return;
      }

      await preloadSprites(index, { concurrency: 8 });
      onGetSprites?.(index);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to load sprites");
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
            {loading ? "Loading Sprites…" : "Get Sprites"}
          </button>
        </div>

        <div className="row small">
          {error ? (
            <div className="row error">{error}</div>
          ) : spritesReady ? (
            <div>Sprites loaded ✔</div>
          ) : (
            <div style={{ color: "#fbbf24" }}>Load sprites to enable matching</div>
          )}
        </div>

        <div className="row">
          <button className="btn" onClick={onNewCard}>New Card</button>
        </div>

        {typeof spritesTotal === "number" && spritesTotal > 0 ? (
          <div className="row small">
            <div>Sprite Cache: {spritesLoaded} / {spritesTotal}</div>
          </div>
        ) : null}

        <div className="divider" />

        <div className="panel-title">Cards</div>
        <div className="list">
          {cards.length === 0 ? (
            <div className="empty">No cards yet.</div>
          ) : (
            cards.map((c, i) => (
              <button
                key={i}
                className={`list-item ${i === currentIndex ? "active" : ""}`}
                onClick={() => onSelect?.(i)}
                title={c?.title || `Card ${i + 1}`}
              >
                <div className="name">{c?.title || `Card ${i + 1}`}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
