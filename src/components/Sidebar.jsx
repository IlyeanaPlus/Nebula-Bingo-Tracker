// src/components/Sidebar.jsx
import React, { useState } from "react";
import { getSpriteIndex } from "../utils/sprites";

export default function Sidebar({
  cards = [],
  currentIndex = 0,
  onSelect,
  onNewCard,
  onGetSprites,          // parent callback receives the loaded meta (or full index if you prefer)
  // spritesLoaded,      // no longer used (preloading removed)
  // spritesTotal,       // no longer used (preloading removed)
  spritesReady = false,  // parent can still reflect readiness if desired
}) {
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!!spritesReady);
  const [error, setError] = useState("");

  async function handleGetSprites() {
    setError("");
    setLoading(true);
    try {
      // Load CLIP index (vectors + meta). Matching uses vectors internally;
      // Sidebar only needs meta for listing, so we forward meta by default.
      const index = await getSpriteIndex();
      const meta = index?.meta || [];

      if (!meta.length) {
        setError("No sprites found (sprite_index_clip.json missing or empty).");
        setReady(false);
        return;
      }

      // Notify parent (keep old prop name). If your parent wants full index, pass `index`.
      onGetSprites?.(meta);
      setReady(true);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to load sprites");
      setReady(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="panel">

        <div className="row small">
          {ready ? (
            <div>Sprites ready ✔</div>
          ) : (
            <div style={{ color: "#fbbf24" }}>Sprites not loaded</div>
          )}
        </div>

        <div className="row">
          <button className="btn" onClick={onNewCard}>New Card</button>
        </div>

        <div className="divider" />

        <div className="panel-title">Card Library</div>
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
