// src/components/SpriteBoard.jsx
import React from "react";
import SpriteImg from "./SpriteImg.jsx";

/**
 * Read-only board that shows matched sprites for a card (5×5).
 * Pass it any card object that has `cells[25]`.
 */
export default function SpriteBoard({ card, title = "Matched Sprites" }) {
  const cells = card?.cells || [];

  if (!cells.length) return (
    <div style={wrap}>
      <h4 style={h4}>{title}</h4>
      <div style={{ opacity: 0.7, fontSize: 13 }}>No cells yet.</div>
    </div>
  );

  return (
    <div style={wrap}>
      <h4 style={h4}>{title}</h4>
      <div style={grid}>
        {cells.map((cell, i) => (
          <div key={i} style={cellBox}>
            <SpriteImg cell={cell} />
            <div style={idx}>{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const wrap   = { padding: 10, background: "var(--panel-bg,#121212)", border: "1px solid #2a2a2a", borderRadius: 10 };
const h4     = { margin: "0 0 8px" };
const grid   = { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 };
const cellBox= {
  position: "relative",
  aspectRatio: "1 / 1",
  background: "#000",
  borderRadius: 6,
  overflow: "hidden",
  border: "1px solid #333",
  display: "grid",
  placeItems: "center",
};
const idx    = { position: "absolute", right: 4, bottom: 2, fontSize: 11, opacity: 0.75 };
