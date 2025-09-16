// src/components/DevSpritesPanel.jsx
import React, { useMemo } from "react";
import SpriteBoard from "./SpriteBoard.jsx";

/**
 * Tiny developer panel. Give it your "active card" object.
 * Example: <DevSpritesPanel card={myCard} />
 */
export default function DevSpritesPanel({ card }) {
  const c = useMemo(() => card, [card]);
  if (!c) return null;
  return <SpriteBoard card={c} title="Dev • Matched Sprites (5×5)" />;
}
