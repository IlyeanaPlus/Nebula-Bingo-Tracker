// src/components/Sidebar.jsx
import React, { useState } from "react";
import { getSpriteIndex } from "../utils/sprites";
import SidebarTuning from "./SidebarTuning.jsx";

export default function Sidebar({
  cards = [],
  currentIndex = 0,
  onSelect,
  onNewCard,
  onGetSprites,
  spritesReady = false,
}) {
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!!spritesReady);
  const [error, setError] = useState("");

  async function handleGetSprites() {
    setError("");
    setLoading(true);
    try {
      const index = await getSpriteIndex();
      const meta = index?.meta || [];

      if (!meta.length) {
        setError("No sprites found (sprite_index_clip.json missing or empty).");
        setReady(false);
        return;
      }

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
      <SidebarTuning />
      <div className="panel">

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
