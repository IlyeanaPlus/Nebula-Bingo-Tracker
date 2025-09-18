// src/components/DevDebugPanel.jsx
// Titles: Raw / First Pass / Second Pass / Mask (64×64)
// Reads new keys res.debug.raw/pass1/pass2/alpha64 with legacy fallbacks.

import React, { useMemo, useState } from "react";

export default function DevDebugPanel({ results = [], cellIdx = 0 }) {
  const [idx, setIdx] = useState(cellIdx);

  const res = useMemo(() => results?.[idx], [results, idx]);
  const top = res?.top || [];
  const caption = res?.best?.ref?.name || "—";
  const stats = res?.debug?.stats || {};
  const params = res?.debug?.params || {};

  // New keys with legacy fallback
  const rawCv =  res?.debug?.raw    || res?.debug?.crop    || null;
  const p1Cv  =  res?.debug?.pass1  || res?.debug?.neutral || null;
  const p2Cv  =  res?.debug?.pass2  || res?.debug?.matte   || null;

  // Build a mask preview from res.debug.alpha64 (Float32Array or Array length 4096)
  const maskUrl = useMemo(() => {
    const a = res?.debug?.alpha64;
    if (!a || !a.length) return null;
    const dim = 64;
    // Ensure we can index as a dense array
    const arr = Array.isArray(a) ? a : Array.from(a);
    // Create RGBA image data, green where mask=1, dark elsewhere
    const c = document.createElement("canvas");
    c.width = dim; c.height = dim;
    const g = c.getContext("2d");
    const id = g.createImageData(dim, dim);
    for (let i = 0; i < arr.length && i < dim * dim; i++) {
      const v = Math.max(0, Math.min(1, arr[i]));   // clamp 0..1
      const r = Math.round(40 * (1 - v));
      const gr = Math.round(255 * v);
      const b = Math.round(40 * (1 - v));
      const o = i * 4;
      id.data[o + 0] = r;
      id.data[o + 1] = gr;
      id.data[o + 2] = b;
      id.data[o + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c.toDataURL();
  }, [res]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Cell:
          <input
            type="number"
            min="1"
            max="25"
            value={idx + 1}
            onChange={(e) =>
              setIdx(Math.max(0, Math.min(24, Number(e.target.value) - 1)))
            }
            style={{ width: 64 }}
          />
        </label>
        <div style={{ opacity: 0.8, fontSize: 12 }}>
          Best: <strong>{caption}</strong>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
          marginTop: 10,
          alignItems: "center",
        }}
      >
        <Preview title="Raw"           src={rawCv?.toDataURL?.()} />
        <Preview title="First Pass"    src={p1Cv?.toDataURL?.()} />
        <Preview title="Second Pass"   src={p2Cv?.toDataURL?.()} />
        <Preview title="Mask (64×64)"  src={maskUrl} />
      </div>

      <h4 style={{ marginTop: 12 }}>Top-K</h4>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {top.length ? (
          top.map((t, i) => (
            <li key={i}>
              {t.ref?.name || t.ref?.key} — {t.score?.toFixed?.(3) ?? "—"}
            </li>
          ))
        ) : (
          <li style={{ opacity: 0.7 }}>No matches yet.</li>
        )}
      </ol>

      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button
          className="btn"
          onClick={() => saveCanvas(p1Cv, `cell-${idx + 1}-pass1.png`)}
          disabled={!p1Cv}
        >
          Save First Pass
        </button>
        <button
          className="btn"
          onClick={() => saveCanvas(p2Cv, `cell-${idx + 1}-pass2.png`)}
          disabled={!p2Cv}
        >
          Save Second Pass
        </button>
      </div>
    </div>
  );
}

function Preview({ title, src }) {
  return (
    <div style={{ display: "grid", gap: 4, fontSize: 11 }}>
      <strong>{title}</strong>
      {src ? (
        <img
          src={src}
          alt={title}
          style={{
            width: 96,
            height: 96,
            objectFit: "contain",
            background:
              "repeating-conic-gradient(#222 0% 25%, #2a2a2a 0% 50%) 50% / 12px 12px",
            borderRadius: 4,
          }}
        />
      ) : (
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 4,
            display: "grid",
            placeItems: "center",
            background: "#1a1a1a",
            color: "#888",
          }}
        >
          —
        </div>
      )}
    </div>
  );
}

function saveCanvas(canvas, filename) {
  if (!canvas) return;
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.png";
  a.click();
}
