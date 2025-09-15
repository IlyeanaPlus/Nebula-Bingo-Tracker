// components/Controls.jsx
import React, { useState } from "react";

export default function Controls({
  rows, setRows,
  cols, setCols,
  inset, setInset,
  threshold, onThresholdChange,
  advanced, setAdvanced,
  startX, setStartX,
  startY, setStartY,
  cellW, setCellW,
  cellH, setCellH,
  gapX, setGapX,
  gapY, setGapY,
}) {
  return (
    <section id="controls" className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-2">2) Controls</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-slate-600">Rows</label>
          <input className="w-full border rounded px-2 py-1" type="number" value={rows} min={1} onChange={(e)=>setRows(parseInt(e.target.value||"1"))} />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Cols</label>
          <input className="w-full border rounded px-2 py-1" type="number" value={cols} min={1} onChange={(e)=>setCols(parseInt(e.target.value||"1"))} />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Inset (px)</label>
          <input className="w-full border rounded px-2 py-1" type="number" value={inset} min={0} onChange={(e)=>setInset(parseInt(e.target.value||"0"))} />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Threshold (Hamming)</label>
          <input className="w-full" type="range" min={4} max={24} value={threshold} onChange={(e)=>onThresholdChange(parseInt(e.target.value))} />
          <div className="text-xs text-slate-600">{threshold}</div>
        </div>
      </div>
      <button className="mt-3 text-sm underline" onClick={()=>setAdvanced(v=>!v)}>{advanced ? "Hide" : "Show"} advanced geometry</button>
      {advanced && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-slate-600">startX</label>
            <input className="w-full border rounded px-2 py-1" type="number" value={startX} onChange={(e)=>setStartX(parseInt(e.target.value||"0"))} />
          </div>
          <div>
            <label className="block text-xs text-slate-600">startY</label>
            <input className="w-full border rounded px-2 py-1" type="number" value={startY} onChange={(e)=>setStartY(parseInt(e.target.value||"0"))} />
          </div>
          <div>
            <label className="block text-xs text-slate-600">cellW</label>
            <input className="w-full border rounded px-2 py-1" type="number" value={cellW} onChange={(e)=>setCellW(parseInt(e.target.value||"0"))} />
          </div>
          <div>
            <label className="block text-xs text-slate-600">cellH</label>
            <input className="w-full border rounded px-2 py-1" type="number" value={cellH} onChange={(e)=>setCellH(parseInt(e.target.value||"0"))} />
          </div>
          <div>
            <label className="block text-xs text-slate-600">gapX</label>
            <input className="w-full border rounded px-2 py-1" type="number" value={gapX} onChange={(e)=>setGapX(parseInt(e.target.value||"0"))} />
          </div>
          <div>
            <label className="block text-xs text-slate-600">gapY</label>
            <input className="w-full border rounded px-2 py-1" type="number" value={gapY} onChange={(e)=>setGapY(parseInt(e.target.value||"0"))} />
          </div>
        </div>
      )}
    </section>
  );
}
