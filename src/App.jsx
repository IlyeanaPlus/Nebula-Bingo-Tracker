// src/App.jsx
import React,{useEffect,useMemo,useRef,useState} from "react";
import BingoCard from "./components/BingoCard.jsx";
import {
  loadImageFromFile, detectGridCrops,
  computeAHash, computeDHashX, computeDHashY,
  computeAHashRGB, computeDHashXRGB, computeDHashYRGB
} from "./utils/image.js";
import {tryLoadDriveCacheJSON} from "./services/drive.js";

const ABS_LUMA=8, ABS_RGB=20, COLOR_W=0.5; // tuning: luma thresh, rgb thresh (sum of 3 chans), and rgb weight
const MIN_GAP=4, PAD_FRAC=0.07;

export default function App(){
  const [cards,setCards]=useState(()=>JSON.parse(localStorage.getItem("cards_v2")||"[]"));
  const [activeId,setActiveId]=useState(cards[0]?.id||null);
  const [cache,setCache]=useState([]);
  const [debug,setDebug]=useState(false);
  const inputRef=useRef();
  useEffect(()=>{tryLoadDriveCacheJSON().then(setCache).catch(()=>setCache([]))},[]);
  useEffect(()=>{localStorage.setItem("cards_v2",JSON.stringify(cards))},[cards]);
  const activeCard=useMemo(()=>cards.find(c=>c.id===activeId)||null,[cards,activeId]);

  async function handleNewCard(e){
    const f=e.target.files?.[0]; if(!f) return;
    const img=await loadImageFromFile(f);
    const crops=detectGridCrops(img,{padFrac:PAD_FRAC,minGap:MIN_GAP,debug});
    const tiles=await Promise.all(crops.map(async (crop)=>{
      const ah=await computeAHash(crop);
      const dx=await computeDHashX(crop), dy=await computeDHashY(crop);
      const ahRGB=await computeAHashRGB(crop);
      const dxRGB=await computeDHashXRGB(crop), dyRGB=await computeDHashYRGB(crop);
      const match=findBestMatch({ah,dx,dy,ahRGB,dxRGB,dyRGB});
      return {ah,dx,dy,ahRGB,dxRGB,dyRGB,match};
    }));
    const id=`card_${Date.now()}`;
    const title=f.name.replace(/\.\w+$/,"");
    const toggles=Array(25).fill(false);
    const card={id,title,tiles,toggles};
    setCards(cs=>[card,...cs]); setActiveId(id);
    e.target.value="";
  }

  function findBestMatch(sig){
    let best=null,bScore=1e9;
    for(const it of cache){
      const a=it.ahash??it.ah, x=it.dhashX??it.dx, y=it.dhashY??it.dy;
      if(a==null||x==null||y==null) continue;
      const sL = pop(a^sig.ah)+pop(x^sig.dx)+pop(y^sig.dy);
      let sC = 0, rgbOK=false;
      if(hasRGB(it) && hasRGB(sig)){
        sC =
          pop((it.ahashR??it.ahr)^sig.ahRGB.r)+
          pop((it.ahashG??it.ahg)^sig.ahRGB.g)+
          pop((it.ahashB??it.ahb)^sig.ahRGB.b)+
          pop((it.dhashXR??it.dxr)^sig.dxRGB.r)+
          pop((it.dhashXG??it.dxg)^sig.dxRGB.g)+
          pop((it.dhashXB??it.dxb)^sig.dxRGB.b)+
          pop((it.dhashYR??it.dyr)^sig.dyRGB.r)+
          pop((it.dhashYG??it.dyg)^sig.dyRGB.g)+
          pop((it.dhashYB??it.dyb)^sig.dyRGB.b);
        rgbOK = sC<=ABS_RGB;
      }
      const total = sL + (rgbOK ? COLOR_W*sC : 9999); // prefer items with valid colour match
      if(total<bScore){bScore=total; best=it}
    }
    if(!best) return null;
    // gate on luminance to avoid false positives
    const sLum = pop((best.ahash??best.ah)^sig.ah)+pop((best.dhashX??best.dx)^sig.dx)+pop((best.dhashY??best.dy)^sig.dy);
    if(sLum>ABS_LUMA) return null;
    return {name:best.name,id:best.id||best.name,score:Math.round(bScore)};
  }
  function hasRGB(o){
    return ["ahashR","ahashG","ahashB","dhashXR","dhashXG","dhashXB","dhashYR","dhashYG","dhashYB"]
      .every(k=>o[k]!=null || o[k.replace("hash","").toLowerCase()]!=null || o[k.slice(0,5).toLowerCase()]!=null);
  }
  function pop(n){n=n>>>0;let c=0;while(n){n&=n-1;c++}return c}

  function renameCard(id,newTitle){setCards(cs=>cs.map(c=>c.id===id?{...c,title:newTitle}:c))}
  function toggleCell(idx){
    if(!activeCard) return;
    setCards(cs=>cs.map(c=>{
      if(c.id!==activeCard.id) return c;
      const t=[...c.toggles]; t[idx]=!t[idx];
      return {...c,toggles:t};
    }));
  }
  function removeCard(id){
    setCards(cs=>cs.filter(c=>c.id!==id));
    if(activeId===id) setActiveId(cs=> (cards.filter(c=>c.id!==id)[0]?.id||null));
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
            {cards.map(c=>(
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
          <BingoCard card={activeCard} onRename={renameCard} onToggle={toggleCell} debug={debug}/>:
          <div className="opacity-70">Create a card from a screenshot to begin.</div>}
      </main>
    </div>
  );
}
