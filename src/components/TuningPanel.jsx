// src/components/TuningPanel.jsx
import React, { useEffect, useState } from "react";
import { tuning } from "../tuning/tuningStore";

export default function TuningPanel() {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState(tuning.get());

  // keep in sync if other tabs/components change it
  useEffect(() => tuning.subscribe(setVals), []);

  // global hotkey “T” to toggle
  useEffect(() => {
    const onKey = (e) => {
      if (e.key?.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const apply = (next) => tuning.set(next);

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #999",
          background: "#111",
          color: "#eee",
          cursor: "pointer",
        }}
        title="Tuning (press T)"
      >
        {open ? "Close Tuning" : "Open Tuning"}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            width: 280,
            borderRadius: 12,
            border: "1px solid #666",
            background: "rgba(20,20,20,0.95)",
            color: "#eee",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Tuning</div>

          {/* Score threshold */}
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Score threshold: <b>{vals.scoreThreshold.toFixed(3)}</b>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.95}
              step={0.005}
              value={vals.scoreThreshold}
              onChange={(e) => apply({ scoreThreshold: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </label>

          {/* Unboarding epsilon */}
          <div style={{ marginTop: 10, marginBottom: 8, fontSize: 12, opacity: 0.8 }}>
            Unboarding ε (background removal)
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[0, 0.02, 0.06].map(eps => (
              <button
                key={eps}
                onClick={() => apply({ unboardEps: eps })}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  borderRadius: 8,
                  border: "1px solid #777",
                  background: vals.unboardEps === eps ? "#2b6" : "#222",
                  color: vals.unboardEps === eps ? "#000" : "#ddd",
                  cursor: "pointer",
                }}
              >
                {eps}
              </button>
            ))}
          </div>

          {/* Crop drift */}
          <label style={{ display: "block", marginBottom: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Crop drift (px): <b>{vals.cropJitter}</b>
            </div>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={vals.cropJitter}
              onChange={(e) => apply({ cropJitter: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={() => tuning.reset()}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #999", background: "#222", color: "#ddd", cursor: "pointer" }}
            >
              Reset
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #999", background: "#333", color: "#ddd", cursor: "pointer" }}
            >
              Close
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>
            Tip: press <b>T</b> to toggle this panel.
          </div>
        </div>
      )}
    </div>
  );
}
