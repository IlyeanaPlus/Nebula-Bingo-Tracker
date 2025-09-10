// src/components/SidebarTuning.jsx
import React, { useEffect, useState } from "react";
import { tuning } from "../tuning/tuningStore";

export default function SidebarTuning() {
  const [vals, setVals] = useState(tuning.get());
  const [open, setOpen] = useState(false);

  useEffect(() => tuning.subscribe(setVals), []);

  const apply = (next) => tuning.set(next);

  return (
    <div style={{ marginTop: 12, padding: 10, borderTop: "1px solid #333" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #444",
          background: "#1c1c1c",
          color: "#eee",
          cursor: "pointer",
        }}
      >
        {open ? "Hide Tuning" : "Show Tuning"}
      </button>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {/* Score threshold */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              Score threshold: <b>{vals.scoreThreshold.toFixed(3)}</b>
            </span>
            <input
              type="range"
              min={0.1}
              max={0.95}
              step={0.005}
              value={vals.scoreThreshold}
              onChange={(e) => apply({ scoreThreshold: Number(e.target.value) })}
            />
          </label>

          {/* Unboarding ε */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
              Unboarding ε
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[0, 0.02, 0.06].map((eps) => (
                <button
                  key={eps}
                  onClick={() => apply({ unboardEps: eps })}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    borderRadius: 8,
                    border: "1px solid #555",
                    background: vals.unboardEps === eps ? "#2b6" : "#222",
                    color: vals.unboardEps === eps ? "#000" : "#ddd",
                    cursor: "pointer",
                  }}
                >
                  {eps}
                </button>
              ))}
            </div>
          </div>

          {/* Crop drift */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              Crop drift (px): <b>{vals.cropJitter}</b>
            </span>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={vals.cropJitter}
              onChange={(e) => apply({ cropJitter: Number(e.target.value) })}
            />
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => tuning.reset()}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #444",
                background: "#222",
                color: "#ddd",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
