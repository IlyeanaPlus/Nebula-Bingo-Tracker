// src/components/SpriteImg.jsx
import React from "react";

/** Robust image that understands many common cell shapes */
export default function SpriteImg({ cell, style, className }) {
  const src =
    cell?.spriteUrl ||
    cell?.imageUrl ||
    cell?.matchUrl ||
    cell?.src ||
    cell?.sprite ||
    cell?.url ||
    cell?.img?.src ||
    "";

  if (!src) return null;

  return (
    <img
      src={src}
      alt={cell?.label || ""}
      decoding="async"
      loading="eager"
      draggable={false}
      onError={(e) => {
        console.warn("[SpriteImg] failed:", src);
        e.currentTarget.style.display = "none";
      }}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        imageRendering: "pixelated",
        pointerEvents: "none",
        ...style,
      }}
      className={className}
      data-role="sprite"
    />
  );
}
