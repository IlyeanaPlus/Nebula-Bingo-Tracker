// src/components/Sidebar.jsx
import React, { useState } from "react";
import TuningPanel from "./TuningPanel.jsx";
import DevDebugPanel from "./DevDebugPanel.jsx";

export default function Sidebar({
  cards,
  onNewCard,     // renamed to match App.jsx
  onRemoveAll,
  cardsCount,    // accepted for future use if you want to disable buttons
  debugResults,
}) {
  const [showDev, setShowDev] = useState(false);

  return (
    <aside id="app-sidebar" className="sidebar">
      <div className="sidebar-header">
        <h2>Controls</h2>
      </div>

      {/* Primary actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button className="btn btn--primary" onClick={onNewCard}>New Card</button>
        <button className="btn" onClick={onRemoveAll}>Remove All</button>
      </div>

      {/* Tuning Panel */}
      <div style={{ marginTop: 16 }}>
        <TuningPanel />
      </div>

      {/* Dev Panel toggle */}
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button
          className="btn"
          aria-expanded={showDev}
          aria-controls="dev-panel"
          onClick={() => setShowDev((v) => !v)}
        >
          {showDev ? "Hide Dev Panel" : "Show Dev Panel"}
        </button>
      </div>

      {showDev && (
        <div id="dev-panel" style={{ marginTop: 12 }}>
          <div
            role="region"
            aria-label="Developer Debug Panel"
            style={{
              border: "1px solid #333",
              borderRadius: 8,
              background: "#111",
              padding: 12,
            }}
          >
            <DevDebugPanel results={debugResults || []} cellIdx={0} />
          </div>
        </div>
      )}
    </aside>
  );
}
