// src/components/TuningPanel.jsx
import React, { useEffect, useState } from "react";
import { autoUnboard, previewTrimOnElement } from "../utils/cropAssist.js"; // <-- remove if not using cropAssist

const LS_KEY = "nbt.tuner.v1";
const DEFAULTS = {
  scoreThreshold: 0.25,
  unboardPct:     0.00,  // cap for auto-trim if enabled
  jitterFrac:     0.00,
  multiCrop:      1,
  shapeWeight:    0.00,
  scale:          30.0,
  topK:           1,
  bgAtten:        true,  // read by clipSession.js
  bgSigma:        18,
  autoUnboardOn:  false, // UI/dev toggle for preview
};

const toNum = (v,f)=>{ const n=typeof v==="string"?(v.trim()===""?NaN:Number(v)):Number(v); return Number.isFinite(n)?n:f; };
const loadState = ()=>{ try{ return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(LS_KEY)||"{}")) }; }catch{ return { ...DEFAULTS }; } };
const saveState = (values)=>{ try{ localStorage.setItem(LS_KEY, JSON.stringify(values)); }catch{}; try{ window.dispatchEvent(new CustomEvent("nbt:tuner-change",{detail:{...values}})); }catch{}; };

function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

const cardStyle = { background:"rgba(20,20,20,0.8)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:12, margin:8, color:"#eee", maxWidth:520 };

function getInput224(cell) {
  const DBG = window.__NBT_DEV || {};
  const store = DBG.input224 || {};
  return store[String(cell)] || null;
}

export default function TuningPanel() {
  const [values, setValues] = useState(() => loadState());
  const [debugOut, setDebugOut] = useState("");
  const [cellPick, setCellPick] = useState(1);
  const [input224, setInput224] = useState(null);

  const setVal = (p)=>setValues(prev=>{ const next={...prev,...p}; saveState(next); return next; });
  const resetAll = ()=> setValues(()=>{ const next={...DEFAULTS}; saveState(next); return next; });
  useEffect(()=>{ saveState(values); },[]);

  // Update preview when a new input224 is recorded
  useEffect(()=>{
    const onEvt = (e)=>{ if (String(e?.detail?.tag) === String(cellPick)) setInput224(getInput224(cellPick)); };
    window.addEventListener("nbt:input224", onEvt);
    return ()=> window.removeEventListener("nbt:input224", onEvt);
  }, [cellPick]);

  useEffect(()=>{ setInput224(getInput224(cellPick)); }, [cellPick]);

  const inputW = { width: 80 };

  async function showLatestForCell() {
    try {
      const matchers = await import("../utils/matchers.js");
      const rec = matchers.getLatestTopKFor(cellPick);
      if (!rec) { setDebugOut(`Cell ${cellPick}: no recorded Top-K yet.`); return; }
      const lines = [];
      lines.push(`Latest Top-K for cell ${cellPick} (${rec.mode}) — best=${(rec.scoreBest??0).toFixed(3)}`);
      lines.push("");
      (rec.rows||[]).forEach((r, i)=>{
        const name = r?.ref?.name ?? r?.key ?? "?";
        const key  = r?.key ?? r?.ref?.key ?? "?";
        const sc   = (r?.score ?? 0).toFixed(3);
        lines.push(`${String(i+1).padStart(2," ")}. ${key}  ${name}  score=${sc}`);
      });
      setDebugOut(lines.join("\n"));
    } catch (e) {
      setDebugOut(String(e?.message||e));
    }
  }

  function previewBgTrim() {
    const els = document.querySelectorAll(".bingo-card .cell img.bingo-sprite");
    const el = els[Math.max(0, Math.min(24, (cellPick|0)-1))];
    if (!el) { setDebugOut(`Cell ${cellPick}: image not found.`); return; }

    try {
      if (values.autoUnboardOn) {
        // Build a temp canvas and show the retained region (requires cropAssist; remove if you don't use it)
        const c = document.createElement("canvas");
        const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(el, 0, 0, w, h);
        const cap = Math.max(0.0, values.unboardPct || 0.06);
        const auto = autoUnboard(c, { maxPct: cap });
        previewTrimOnElement(el, auto.rect);
        setDebugOut(`Cell ${cellPick}: auto-trim px ≈ ${Math.round(auto.px)} (${(auto.pct*100).toFixed(1)}%)`);
      } else {
        setDebugOut(`Cell ${cellPick}: auto-trim disabled`);
      }
    } catch (e) {
      setDebugOut(String(e?.message||e));
    }
  }

  function showInput224() {
    const rec = getInput224(cellPick);
    setInput224(rec);
    if (!rec) setDebugOut(`Cell ${cellPick}: no input capture yet (run matching).`);
  }

  return (
    <div style={cardStyle}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <strong>Matching Tuner</strong>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={resetAll} type="button">Reset</button>
        </div>
      </div>

      {/* Core matching knobs */}
      <Row label={`Score Threshold: ${values.scoreThreshold}`}>
        <input type="range" min="0" max="1" step="0.01" value={values.scoreThreshold}
          onChange={(e)=>setVal({scoreThreshold:toNum(e.target.value,values.scoreThreshold)})} style={{flex:1}} />
        <input type="number" min="0" max="1" step="0.01" value={values.scoreThreshold}
          onChange={(e)=>setVal({scoreThreshold:toNum(e.target.value,values.scoreThreshold)})} style={inputW} />
      </Row>

      <Row label={`Unboard % (cap for auto-trim): ${Math.round((values.unboardPct||0)*100)}%`}>
        <input type="range" min="0" max="0.49" step="0.01" value={values.unboardPct}
          onChange={(e)=>setVal({unboardPct:toNum(e.target.value,values.unboardPct)})} style={{flex:1}} />
        <input type="number" min="0" max="0.49" step="0.01" value={values.unboardPct}
          onChange={(e)=>setVal({unboardPct:toNum(e.target.value,values.unboardPct)})} style={inputW} />
      </Row>

      <Row label={`Jitter: ${values.jitterFrac}`}>
        <input type="range" min="0" max="0.5" step="0.01" value={values.jitterFrac}
          onChange={(e)=>setVal({jitterFrac:toNum(e.target.value,values.jitterFrac)})} style={{flex:1}} />
        <input type="number" min="0" max="0.5" step="0.01" value={values.jitterFrac}
          onChange={(e)=>setVal({jitterFrac:toNum(e.target.value,values.jitterFrac)})} style={inputW} />
      </Row>

      <Row label={`Multi-crop: ${values.multiCrop}`}>
        <input type="range" min="0" max="16" step="1" value={values.multiCrop}
          onChange={(e)=>setVal({multiCrop:Math.max(0,parseInt(e.target.value||"0",10))})} style={{flex:1}} />
        <input type="number" min="0" max="999" step="1" value={values.multiCrop}
          onChange={(e)=>setVal({multiCrop:Math.max(0,parseInt(e.target.value||"0",10))})} style={inputW} />
      </Row>

      <Row label={`Shape Weight: ${values.shapeWeight}`}>
        <input type="range" min="0" max="1" step="0.01" value={values.shapeWeight}
          onChange={(e)=>setVal({shapeWeight:toNum(e.target.value,values.shapeWeight)})} style={{flex:1}} />
        <input type="number" min="0" max="1" step="0.01" value={values.shapeWeight}
          onChange={(e)=>setVal({shapeWeight:toNum(e.target.value,values.shapeWeight)})} style={inputW} />
      </Row>

      <Row label={`Head Scale: ${values.scale}`}>
        <input type="range" min="0" max="60" step="1" value={values.scale}
          onChange={(e)=>setVal({scale:toNum(e.target.value,values.scale)})} style={{flex:1}} />
        <input type="number" min="0" max="999" step="1" value={values.scale}
          onChange={(e)=>setVal({scale:toNum(e.target.value,values.scale)})} style={inputW} />
      </Row>

      <Row label={`Top-K: ${values.topK}`}>
        <input type="range" min="0" max="10" step="1" value={values.topK}
          onChange={(e)=>setVal({topK:Math.max(0,parseInt(e.target.value||"0",10))})} style={{flex:1}} />
        <input type="number" min="0" max="999" step="1" value={values.topK}
          onChange={(e)=>setVal({topK:Math.max(0,parseInt(e.target.value||"0",10))})} style={inputW} />
      </Row>

      {/* BG Attenuation + Auto-trim toggles */}
      <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)", marginTop:10, paddingTop:10 }}>
        <Row label="Background Attenuation (dominant-color soft matte)">
          <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
            <input type="checkbox" checked={!!values.bgAtten} onChange={(e)=>setVal({ bgAtten: !!e.target.checked })} />
            <span>Enable</span>
          </label>
          <span style={{ opacity:0.8 }}>Sigma</span>
          <input type="range" min="8" max="40" step="1" value={values.bgSigma}
                 onChange={(e)=>setVal({ bgSigma: Math.max(1, parseInt(e.target.value||"18",10)) })} style={{ flex:1 }} />
          <input type="number" min="1" max="999" step="1" value={values.bgSigma}
                 onChange={(e)=>setVal({ bgSigma: Math.max(1, parseInt(e.target.value||"18",10)) })} style={{ width:80 }} />
        </Row>

        <Row label="Auto-trim (Unboard)">
          <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
            <input type="checkbox" checked={!!values.autoUnboardOn}
                   onChange={(e)=>setVal({ autoUnboardOn: !!e.target.checked })} />
            <span>Enable (crop border up to cap above — dev preview)</span>
          </label>
        </Row>

        {/* Cell picker + actions */}
        <Row label="Analyze card cell (1–25)">
          <input type="number" min="1" max="25" step="1" value={cellPick}
                 onChange={(e)=>setCellPick(Math.max(1, Math.min(25, parseInt(e.target.value||"1",10))))}
                 style={{ width: 80 }} />
          <button className="btn" type="button" onClick={showLatestForCell}>Show Latest Top-K</button>
          <button className="btn" type="button" onClick={previewBgTrim}>Preview BG Trim</button>
          <button className="btn" type="button" onClick={showInput224}>Show Input 224</button>
        </Row>
      </div>

      {/* Input 224 preview */}
      {input224?.dataUrl && (
        <div style={{ marginTop: 8, display:"flex", alignItems:"center", gap:12 }}>
          <img src={input224.dataUrl} alt={`cell ${cellPick} input224`} width={112} height={112}
               style={{ imageRendering:"pixelated", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8 }} />
          <div style={{ fontSize:12, opacity:0.9 }}>
            <div><b>Input 224</b> sent to encoder (after any attenuation)</div>
            {"bg" in input224 && input224.bg && (
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
                <div style={{ width:14, height:14, borderRadius:3, border:"1px solid rgba(255,255,255,0.3)",
                              background:`rgb(${input224.bg[0]},${input224.bg[1]},${input224.bg[2]})` }} />
                <span>BG {input224.bg.join(",")} · {Math.round((input224.bgFrac||0)*100)}% {input224.attenuated ? "· attenuated" : "· not attenuated"}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug output */}
      <pre style={{
        whiteSpace:"pre-wrap",
        fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        background:"rgba(255,255,255,0.05)",
        border:"1px solid rgba(255,255,255,0.08)",
        borderRadius:8,
        padding:8,
        maxHeight:260,
        overflow:"auto",
        marginTop:8
      }}>{debugOut}</pre>

      <div style={{ opacity:0.7, fontSize:12, marginTop:6 }}>
        Changes save automatically. All fields accept <b>0</b>.
      </div>
    </div>
  );
}

export function getTunerValues(){ return loadState(); }
