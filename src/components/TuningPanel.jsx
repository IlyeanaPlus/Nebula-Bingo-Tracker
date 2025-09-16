// src/components/TuningPanel.jsx
import React, { useEffect, useState } from "react";
import { getTuning, setTuning, subscribe, clampTuning, TuningKeys } from "../store/tuningStore";

export default function TuningPanel() {
  const [state, setState] = useState(() => clampTuning());
  useEffect(() => subscribe((s) => setState({ ...s })), []);

  const patch = (obj) => setTuning(obj);

  return (
    <div className="tuning-panel" style={panelStyle}>
      <h3 style={{ margin: "0 0 8px" }}>Tuning</h3>

      <Row label="Score Threshold" hint="min cosine to accept">
        <CtrlCol>
          <input
            type="range" min={0} max={1} step={0.01}
            value={state.scoreThreshold}
            onChange={(e) => patch({ [TuningKeys.ScoreThreshold]: Number(e.target.value) })}
          />
          <Num
            value={state.scoreThreshold}
            onChange={(n) => patch({ [TuningKeys.ScoreThreshold]: clamp01(n) })}
            min={0} max={1} step={0.01}
          />
        </CtrlCol>
      </Row>

      <Row label="Crop Inset %" hint="shrink crops inward">
        <CtrlCol>
          <input
            type="range" min={0} max={0.1} step={0.005}
            value={state.cropInsetPct}
            onChange={(e) => patch({ [TuningKeys.CropInsetPct]: Number(e.target.value) })}
          />
          <Num
            value={state.cropInsetPct}
            onChange={(n) => patch({ [TuningKeys.CropInsetPct]: clamp(n, 0, 0.1) })}
            min={0} max={0.1} step={0.005}
          />
        </CtrlCol>
      </Row>

      <Row label="Background Attenuation" hint="soften BG toward gray">
        <CtrlCol single>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!state.bgAtten}
              onChange={(e) => patch({ [TuningKeys.BgAtten]: !!e.target.checked })}
            />
            <span>{state.bgAtten ? "On" : "Off"}</span>
          </label>
        </CtrlCol>
      </Row>

      <Row label="BG Sigma" hint="higher = softer">
        <CtrlCol>
          <input
            type="range" min={6} max={32} step={1} disabled={!state.bgAtten}
            value={state.bgSigma}
            onChange={(e) => patch({ [TuningKeys.BgSigma]: Math.round(Number(e.target.value)) })}
          />
          <Num
            value={state.bgSigma}
            onChange={(n) => patch({ [TuningKeys.BgSigma]: clampInt(n, 6, 32) })}
            min={6} max={32} step={1} disabled={!state.bgAtten}
          />
        </CtrlCol>
      </Row>

      <Row label="Jitter Level" hint="1× / 2×2 / 3×3 avg">
        <CtrlCol single>
          <select
            value={String(state.jitterFrac)}
            onChange={(e) => patch({ [TuningKeys.JitterFrac]: parseJitter(e.target.value) })}
            style={selectStyle}
          >
            <option value="0">0 — single crop</option>
            <option value="0.5">0.5 — 4 crops</option>
            <option value="1">1 — 9 crops</option>
          </select>
        </CtrlCol>
      </Row>

      <Row label="Top-K (debug)" hint="alternatives shown">
        <CtrlCol>
          <input
            type="range" min={1} max={10} step={1}
            value={state.debugTopK}
            onChange={(e) => patch({ [TuningKeys.DebugTopK]: Math.round(Number(e.target.value)) })}
          />
          <Num
            value={state.debugTopK}
            onChange={(n) => patch({ [TuningKeys.DebugTopK]: clampInt(n, 1, 10) })}
            min={1} max={10} step={1}
          />
        </CtrlCol>
      </Row>
    </div>
  );
}

/* ---------- layout helpers ---------- */
function Row({ label, hint, children }) {
  return (
    <div style={rowStyle}>
      <label style={labelStyle}>
        {label}
        {hint && <small style={smallStyle}>{hint}</small>}
      </label>
      {children}
    </div>
  );
}
function CtrlCol({ children, single = false }) {
  return <div style={single ? ctrlSingleStyle : ctrlColStyle}>{children}</div>;
}
function Num({ value, onChange, min, max, step, disabled }) {
  return (
    <input
      type="number" min={min} max={max} step={step} disabled={disabled}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={numStyle}
    />
  );
}

/* ---------- utils ---------- */
function clamp01(v) { const n = Number(v); return isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
function clamp(v, lo, hi) { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
function clampInt(v, lo, hi) { const n = Math.round(Number(v)); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
function parseJitter(val) { const n = Number(val); return [0, 0.5, 1].includes(n) ? n : 0; }

/* ---------- styles (anti-squish) ---------- */
const panelStyle = {
  border: "1px solid var(--border-color, #333)",
  borderRadius: 10,
  padding: 12,
  background: "var(--panel-bg, #151515)",
  display: "grid",
  gap: 10,
  minWidth: 340,               // ⬅️ prevents squish
};

const rowStyle = {
  display: "grid",
  // label column won’t shrink below 140px, controls won’t shrink below 220px
  gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 1.4fr)",
  alignItems: "center",
  gap: 10,
};

const labelStyle = { display: "flex", flexDirection: "column", gap: 2, fontWeight: 600 };
const smallStyle = { fontWeight: 400, opacity: 0.7, fontSize: 12 };

// For rows with slider + number
const ctrlColStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 84px",
  gap: 8,
  alignItems: "center",
};
// For single control rows (checkbox/select)
const ctrlSingleStyle = { display: "flex", alignItems: "center" };

const numStyle = {
  width: 84,
  padding: "4px 6px",
  background: "transparent",
  color: "inherit",
  border: "1px solid var(--border-color, #333)",
  borderRadius: 6,
};
const selectStyle = {
  padding: "6px 8px",
  background: "transparent",
  color: "inherit",
  border: "1px solid var(--border-color, #333)",
  borderRadius: 6,
};

/* Tiny responsive fallback: stack rows when super narrow */
if (typeof document !== "undefined" && !document.getElementById("nbt-tuning-media")) {
  const style = document.createElement("style");
  style.id = "nbt-tuning-media";
  style.textContent = `
@media (max-width: 520px) {
  .tuning-panel > div { 
    grid-template-columns: 1fr !important; 
  }
}`;
  document.head.appendChild(style);
}
