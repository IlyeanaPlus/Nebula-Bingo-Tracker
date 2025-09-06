// src/components/BingoCard.jsx
import React,{useMemo,useState} from "react";

export default function BingoCard({card,onRename,onToggle,debug}){
  const [edit,setEdit]=useState(false);
  const [name,setName]=useState(card.title);
  const hits=useMemo(()=>card.tiles.map(t=>!!t.match),[card]);
  const rows=[0,1,2,3,4];
  const score=card.toggles.filter(Boolean).length;
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-3">
        {edit?(
          <>
            <input className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700" value={name} onChange={e=>setName(e.target.value)}/>
            <button className="px-2 py-1 bg-indigo-600 rounded" onClick={()=>{onRename(card.id,name);setEdit(false)}}>Save</button>
            <button className="px-2 py-1 bg-neutral-700 rounded" onClick={()=>{setName(card.title);setEdit(false)}}>Cancel</button>
          </>
        ):(
          <>
            <h2 className="text-xl font-semibold">{card.title}</h2>
            <button className="px-2 py-1 bg-neutral-700 rounded" onClick={()=>setEdit(true)}>Rename</button>
            <span className="opacity-70">• Toggles: {score}/25</span>
          </>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2 w-full max-w-3xl">
        {rows.flatMap(r=>rows.map(c=>{
          const i=r*5+c;
          const t=card.tiles[i]; const on=card.toggles[i];
          return (
            <button key={i} onClick={()=>onToggle(i)} className={`relative aspect-square rounded grid place-items-center border ${on?"bg-emerald-600/70 border-emerald-400":"bg-neutral-800 border-neutral-700"} overflow-hidden`}>
              <div className="absolute inset-0 grid place-items-center text-[10px] leading-tight p-1 text-center">
                <div className="opacity-90">{t?.match?.name||"—"}</div>
              </div>
              {debug&&(
                <div className="absolute bottom-1 left-1 right-1 text-[9px] opacity-70">
                  <div>hit:{hits[i]?"Y":"N"} score:{t?.match?.score??"-"}</div>
                </div>
              )}
            </button>
          )
        }))}
      </div>
    </div>
  )
}
