// src/components/DevDebugPanel.jsx
import React, { useEffect, useState } from "react";

export default function DevDebugPanel() {
  const [open, setOpen] = useState(true);
  const [crops, setCrops] = useState(() => window.__NBT_DEV?.crops || []);
  const count = crops?.length || 0;

  useEffect(() => {
    const t = setInterval(() => {
      const next = window.__NBT_DEV?.crops || [];
      if (next !== crops && next.length) setCrops(next);
    }, 300);
    return () => clearInterval(t);
  }, [crops]);

  return (
    <div style={wrap}>
      <button style={header} onClick={() => setOpen(v => !v)}>
        <span>Dev</span>
        <span style={{opacity:.7,fontSize:12}}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{display:"grid", gap:10}}>
          <div style={row}>
            <strong>Crops</strong>
            <span style={{opacity:.8}}>{count ? `${count}/25` : "—"}</span>
            <button className="btn" onClick={() => setCrops(window.__NBT_DEV?.crops || [])}>Refresh</button>
          </div>

          {!!count && (
            <div style={grid}>
              {crops.map((cv, i) => (
                <div key={i} style={cell}>
                  <canvas
                    width={cv.width}
                    height={cv.height}
                    ref={(node) => {
                      if (!node) return;
                      const g = node.getContext("2d", { willReadFrequently: true });
                      g.imageSmoothingEnabled = false;
                      g.clearRect(0, 0, node.width, node.height);
                      g.drawImage(cv, 0, 0);
                    }}
                    style={{ width: "100%", height: "auto", display: "block" }}
                  />
                  <div style={idx}>{i+1}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const wrap = { padding: 10, background: "var(--panel-bg,#121212)", border: "1px solid #2a2a2a", borderRadius: 10 };
const header = { width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center",
  background:"transparent", color:"inherit", border:"1px solid #2a2a2a", borderRadius:8, padding:"8px 10px", cursor:"pointer" };
const row = { display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, alignItems:"center" };
const grid = { display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:6 };
const cell = { position:"relative", background:"#000", borderRadius:6, overflow:"hidden", border:"1px solid #333" };
const idx = { position:"absolute", right:4, bottom:2, fontSize:11, opacity:.75 };
