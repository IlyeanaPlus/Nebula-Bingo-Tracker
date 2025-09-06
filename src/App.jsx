import React,{useEffect,useMemo,useRef,useState} from "react";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";
import {
  loadImageFromFile,detectGridCrops,
  computeAHash,computeDHashX,computeDHashY,
  computeAHashRGB,computeDHashXRGB,computeDHashYRGB
} from "./utils/image.js";
import {findBestMatch} from "./utils/match.js";
import {tryLoadDriveCacheJSON} from "./services/drive.js";
import {useCards} from "./hooks/useCards.js";

export const ABS_LUMA=8,ABS_RGB=20,COLOR_W=0.5,MIN_GAP=4,PAD_FRAC=0.07;

export default function App(){
  const {cards,activeCard,activeId,setActiveId,addCard,renameCard,toggleCell,removeCard} = useCards();
  const [cache,setCache] = useState([]);
  const [maxCache,setMaxCache] = useState(()=>Number(localStorage.getItem("max_cache_seen")||"0"));
  const [debug,setDebug] = useState(false);
  const inputRef = useRef();

  useEffect(()=>{
    tryLoadDriveCacheJSON().then(arr=>{
      setCache(arr||[]);
      const m=Math.max(Number(localStorage.getItem("max_cache_seen")||"0"),(arr||[]).length);
      localStorage.setItem("max_cache_seen",String(m)); setMaxCache(m);
    }).catch(()=>setCache([]));
  },[]);

  async function handleNewCard(e){
    const f=e.target.files?.[0]; if(!f) return;
    const img=await loadImageFromFile(f);
    const crops=detectGridCrops(img,{padFrac:PAD_FRAC,minGap:MIN_GAP,debug});
    const tiles=await Promise.all(crops.map(async crop=>{
      const ah=await computeAHash(crop);
      const dx=await computeDHashX(crop),dy=await computeDHashY(crop);
      const ahRGB=await computeAHashRGB(crop);
      const dxRGB=await computeDHashXRGB(crop),dyRGB=await computeDHashYRGB(crop);
      const match=findBestMatch({ah,dx,dy,ahRGB,dxRGB,dyRGB},cache,{ABS_LUMA,ABS_RGB,COLOR_W});
      return {ah,dx,dy,ahRGB,dxRGB,dyRGB,match};
    }));
    const id=addCard(f.name.replace(/\.\w+$/,""),tiles);
    setActiveId(id);
    e.target.value="";
  }

  function handleBlankCard(){
    const tiles=Array.from({length:25},()=>({ah:0,dx:0,dy:0,ahRGB:null,dxRGB:null,dyRGB:null,match:null}));
    const id=addCard("Blank Card",tiles);
    setActiveId(id);
  }

  const cachePct=maxCache?Math.min(100,Math.round((cache.length/maxCache)*100)):(cache.length?100:0);
  const matched=activeCard?activeCard.tiles.filter(t=>t.match).length:0;

  return (
    <div className="min-h-screen grid md:grid-cols-[320px_1fr] gap-4 p-4 text-sm text-white bg-neutral-900">
      <Sidebar
        onNew={()=>inputRef.current?.click()}
        onBlank={handleBlankCard}
        inputRef={inputRef}
        onFile={handleNewCard}
        debug={debug}
        setDebug={setDebug}
        cards={cards}
        activeId={activeId}
        setActiveId={setActiveId}
        removeCard={removeCard}
        cacheLen={cache.length}
        cachePct={cachePct}
        matched={matched}
      />
      <main className="grid place-items-start">
        {activeCard?
          <BingoCard card={activeCard} onRename={renameCard} onToggle={i=>toggleCell(activeCard.id,i)} debug={debug}/>:
          <div className="opacity-70">Create a card from a screenshot or start with a blank card.</div>}
      </main>
    </div>
  );
}
