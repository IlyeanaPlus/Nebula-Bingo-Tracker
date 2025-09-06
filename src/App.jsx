// src/App.jsx
import React,{useEffect,useMemo,useRef,useState} from "react";
import BingoCard from "./components/BingoCard.jsx";
import {loadImageFromFile,computeAHash,computeDHashX,computeDHashY,detectGridCrops} from "./utils/image.js";
import {tryLoadDriveCacheJSON} from "./services/drive.js";
import {useCards} from "./hooks/useCards.js";
import {findBestMatch} from "./utils/match.js";

const ABS_THRESH=8,MIN_GAP=4,PAD_FRAC=0.07;

export default function App(){
  const {cards,activeId,activeCard,setActiveId,addCard,renameCard,toggleCell,removeCard}=useCards();
  const [cache,setCache]=useState([]);
  const [debug,setDebug]=useState(false);
  const inputRef=useRef();

  useEffect(()=>{tryLoadDriveCacheJSON().then(setCache).catch(()=>setCache([]))},[]);
  const savedList=useMemo(()=>cards,[cards]);

  async function handleNewCard(e){
    const f=e.target.files?.[0]; if(!f) return;
    const img=await loadImageFromFile(f);
    const crops=detectGridCrops(img,{padFrac:PAD_FRAC,minGap:MIN_GAP,debug});
    const tiles=await Promise.all(crops.map(async (crop)=>{
      const ah=await computeAHash(crop);
      const dx=await computeDHashX(crop),dy=await computeDHashY(crop);
      const match=findBestMatch({ah,dx,dy},cache,ABS_THRESH);
      return {ah,dx,dy,match};
    }));
    const title=f.name.replace(/\.\w+$/,"");
    const id=addCard(title,tiles);
    setActiveId(id);
    e.target.value="";
  }

  return (
    <div className="min-h-screen grid md:grid-cols-[320px_1fr] gap-4 p-4 text-sm text-white bg-neutral-900">
      <aside className="space-y-3">
        <h1 className="text-lg font-semibold">Nebula Bingo Tracker</h1>
        <button onClick={()=>inputRef.current?.click()} className="w-full px-3 py-2 bg-indigo-600 rounded">New Card</button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleNewCard}/>
        <label className="flex items-center gap-2 text-neutral-300">
          <input type="checkbox" checked={debug} onChange={e=>setDebug(e.target.checked)}/><span>Debug</span>
        </label>
        <div className="border border-neutral-700 rounded">
          <div className="px-3 py-2 border-b border-neutral-700 text-neutral-300">Saved Cards</div>
          <ul className="max-h-[50vh] overflow-auto">
            {savedList.map(c=>(
              <li key={c.id} className={`flex items-center justify-between px-3 py-2 hover:bg-neutral-800 ${c.id===activeId?"bg-neutral-800":""}`}>
                <button className="truncate text-left" onClick={()=>setActiveId(c.id)} title={c.title}>{c.title}</button>
                <button onClick={()=>removeCard(c.id)} className="text-red-400 ml-2">✕</button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="grid place-items-start">
        {activeCard?
          <BingoCard card={activeCard} onRename={renameCard} onToggle={i=>toggleCell(activeCard.id,i)} debug={debug}/>:
          <div className="opacity-70">Create a card from a screenshot to begin.</div>}
      </main>
    </div>
  );
}
