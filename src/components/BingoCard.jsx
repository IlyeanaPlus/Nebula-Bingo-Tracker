// src/components/BingoCard.jsx
import React,{useRef,useState} from "react";

export default function BingoCard({card,onTitle,onFill,onSave,onRemove,onToggle}){
  const rows=[0,1,2,3,4];
  const [editing,setEditing]=useState(false);
  const [title,setTitle]=useState(card.title);
  const inputRef=useRef();

  function chooseFile(){ inputRef.current?.click(); }
  function onFile(e){ const f=e.target.files?.[0]; if(f) onFill(f); e.target.value=""; }

  return (
    <div className="border border-neutral-800 rounded-2xl p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]">
      <div className="flex items-center gap-2 mb-3">
        {editing?(
          <input
            autoFocus
            className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
            value={title}
            onChange={e=>setTitle(e.target.value)}
            onBlur={()=>{onTitle(title);setEditing(false)}}
            onKeyDown={e=>{if(e.key==="Enter"){onTitle(title);setEditing(false)}}}
          />
        ):(
          <button
            className="text-lg font-semibold hover:underline text-left"
            onClick={()=>setEditing(true)}
            title="Click to rename"
          >
            {card.title}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded" onClick={chooseFile}>Fill</button>
          {!card.saved && <button className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded" onClick={onSave}>Save</button>}
          <button className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded" onClick={onRemove}>Remove</button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {rows.flatMap(r=>rows.map(c=>{
          const i=r*5+c;
          const on=card.toggles[i];
          const name=card.tiles[i]?.match?.name||"empty";
          return (
            <button
              key={i}
              onClick={()=>onToggle(i)}
              className={`relative aspect-square rounded-xl border ${on?"bg-emerald-600/60 border-emerald-400":"bg-neutral-800 border-neutral-700"} grid place-items-center overflow-hidden`}
              title={name}
            >
              <span className="text-[11px] text-neutral-300 px-1 truncate w-[90%] text-center">{name}</span>
            </button>
          );
        }))}
      </div>
    </div>
  );
}
