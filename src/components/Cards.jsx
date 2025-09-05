import React from 'react';

export default function Cards({ cards, copyTSV, downloadCSV, resetCard, updateCellName, toggleCheck }) {
  if (!cards.length) return (<section className="space-y-6"><div className="text-sm text-slate-500">No cards yet. Upload a screenshot to create one.</div></section>);
  return (
    <section className="space-y-6">
      {cards.map((card) => (
        <div key={card.id} className="p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-base font-semibold">Card: {card.title}</div>
            <div className="ml-auto flex gap-2">
              <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={()=>copyTSV(card)}>Copy TSV</button>
              <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={()=>downloadCSV(card)}>Download CSV</button>
              <button className="px-3 py-1 rounded bg-amber-100 hover:bg-amber-200" onClick={()=>resetCard(card.id,"checks")}>Reset checks</button>
              <button className="px-3 py-1 rounded bg-rose-100 hover:bg-rose-200" onClick={()=>resetCard(card.id,"all")}>Clear names</button>
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${card.cols}, minmax(0, 1fr))`, gap: "8px" }}>
            {card.grid.map((cell, i) => {
              const r = Math.floor(i / card.cols) + 1; const c = (i % card.cols) + 1;
              return (
                <div key={i} className={`p-2 rounded-2xl border ${cell.checked ? "bg-green-200 border-green-300" : "bg-white border-slate-200"}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-12 shrink-0 border rounded-lg bg-white flex items-center justify-center overflow-hidden">
                      {cell.refUrl ? (<img src={cell.refUrl} className="max-w-full max-h-full object-contain"/>) : (<span className="text-[10px] text-slate-400">no match</span>)}
                    </div>
                    <div className="flex-1">
                      <input className="w-full text-sm border rounded px-2 py-1" value={cell.name} placeholder="(name)" onChange={(e)=>updateCellName(card.id, i, e.target.value)} />
                      <div className="text-[10px] text-slate-500">r{r}c{c} · dist {Number.isFinite(cell.dist) ? cell.dist : "-"}</div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={cell.checked} onChange={()=>toggleCheck(card.id, i)} />
                      <span>done</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
