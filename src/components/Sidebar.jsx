import React from "react";

export default function Sidebar({
  onNew,onBlank,inputRef,onFile,debug,setDebug,
  cards,activeId,setActiveId,removeCard,
  cacheLen,cachePct,matched
}){
  return (
    <aside className="space-y-3">
      <h1 className="text-lg font-semibold">Nebula Bingo Tracker</h1>
      <div className="space-y-2">
        <button onClick={onNew} className="w-full px-3 py-2 bg-indigo-600 rounded">New Card</button>
        <button onClick={onBlank} className="w-full px-3 py-2 bg-neutral-700 rounded">Blank Card</button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
      </div>
      <label className="flex items-center gap-2 text-neutral-300">
        <input type="checkbox" checked={debug} onChange={e=>setDebug(e.target.checked)}/><span>Debug</span>
      </label>
      <div className="space-y-1">
        <div className="text-neutral-300">Sprites Indexed: {cacheLen}</div>
        <div className="h-2 bg-neutral-800 rounded overflow-hidden">
          <div className="h-full bg-emerald-500" style={{width:`${cachePct}%`}}/>
        </div>
      </div>
      {typeof matched==="number"&&(
        <div className="space-y-1">
          <div className="text-neutral-300">Matches on Card: {matched}/25</div>
          <div className="h-2 bg-neutral-800 rounded overflow-hidden">
            <div className="h-full bg-indigo-500" style={{width:`${Math.round((matched/25)*100)}%`}}/>
          </div>
        </div>
      )}
      <div className="border border-neutral-700 rounded">
        <div className="px-3 py-2 border-b border-neutral-700 text-neutral-300">Saved Cards</div>
        <ul className="max-h-[50vh] overflow-auto">
          {cards.map(c=>(
            <li key={c.id} className={`flex items-center justify-between px-3 py-2 hover:bg-neutral-800 ${c.id===activeId?"bg-neutral-800":""}`}>
              <button className="truncate text-left" onClick={()=>setActiveId(c.id)} title={c.title}>{c.title}</button>
              <button onClick={()=>removeCard(c.id)} className="text-red-400 ml-2">✕</button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
