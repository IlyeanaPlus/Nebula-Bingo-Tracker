// src/components/Sidebar.jsx
import React, { useEffect, useState } from "react";
import TuningPanel from "./TuningPanel.jsx";
import { loadSpriteIndex, getSpriteIndex } from "../utils/sprites";
import DevDebugPanel from "./DevDebugPanel.jsx";

export default function Sidebar({
  cards,
  currentIndex,
  onSelect,
  onNewCard,
  onGetSprites,
  spritesReady,
}) {
  const [loadingIdx, setLoadingIdx] = useState(false);
  const [idxInfo, setIdxInfo] = useState(null);

  useEffect(() => {
    try {
      const idx = getSpriteIndex();
      setIdxInfo({ dim: idx.dim, count: idx.count, mapped: idx.mapped });
    } catch {}
  }, []);

  async function handleLoadSprites() {
    setLoadingIdx(true);
    try {
      const idx = await loadSpriteIndex();
      setIdxInfo({ dim: idx.dim, count: idx.count, mapped: idx.mapped });
      onGetSprites?.(idx);
    } catch (e) {
      console.warn("Sprite index load failed:", e);
      setIdxInfo(null);
    } finally {
      setLoadingIdx(false);
    }
  }

  return (
    <div className="sidebar" style={wrap}>
      <section style={section}>
        <h3 style={h3}>Actions</h3>
        <div style={row}>
          <button className="btn" onClick={onNewCard}>New Card</button>
          <button className="btn" onClick={handleLoadSprites} disabled={loadingIdx}>
            {loadingIdx ? "Loading…" : spritesReady ? "Reload Sprites" : "Load Sprites"}
          </button>
        </div>

        <div style={statusBox}>
          {idxInfo ? (
            <div style={muted}>
              <div>Index: <strong>v3</strong></div>
              <div>Dim: {idxInfo.dim}</div>
              <div>Count: {idxInfo.count}</div>
              <div>Mapped: {idxInfo.mapped}</div>
              <div>Status: <strong style={{ color: "var(--ok, #61d095)" }}>Ready</strong></div>
            </div>
          ) : (
            <div style={muted}>
              <div>Index: <strong>not loaded</strong></div>
              <div>Status: <strong style={{ color: "var(--warn, #e0b05c)" }}>Awaiting load</strong></div>
            </div>
          )}
        </div>
      </section>

      <section style={section}>
        <h3 style={h3}>Cards</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {cards?.length ? cards.map((c, i) => (
            <button
              key={i}
              className="btn"
              onClick={() => onSelect?.(i)}
              aria-current={currentIndex === i ? "true" : "false"}
              style={{
                ...listBtn,
                ...(currentIndex === i ? currentBtn : {})
              }}
            >
              {c.title || `Card ${i + 1}`}
            </button>
          )) : (
            <div style={muted}>No cards yet.</div>
          )}
        </div>
      </section>

      <section style={section}>
        <h3 style={h3}>Tuning</h3>
        <TuningPanel />
      </section>
      <DevDebugPanel />
    </div>
  );
}

/* ---------- styles ---------- */
const wrap = {
  display: "grid",
  gap: 14,
  padding: 12,
  width: 360,         // ⬅️ wider base width
  minWidth: 340,      // ⬅️ hard floor to prevent squish
  maxWidth: "100%",
  alignSelf: "start",
};
const section = { display: "grid", gap: 8, padding: 10, border: "1px solid #2a2a2a", borderRadius: 10, background: "var(--panel-bg, #131313)" };
const h3 = { margin: 0, fontSize: 14, fontWeight: 700, opacity: 0.9 };
const row = { display: "flex", gap: 8, flexWrap: "wrap" };
const statusBox = { padding: 8, border: "1px dashed #2a2a2a", borderRadius: 8, background: "rgba(255,255,255,0.03)" };
const muted = { opacity: 0.8, fontSize: 12, display: "grid", gap: 2 };
const listBtn = { textAlign: "left", padding: "6px 8px", borderRadius: 8, border: "1px solid #2a2a2a", background: "transparent" };
const currentBtn = { borderColor: "var(--accent,#61d095)", boxShadow: "0 0 0 1px var(--accent,#61d095) inset" };
