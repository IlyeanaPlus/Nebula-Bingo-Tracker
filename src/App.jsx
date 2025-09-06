// src/App.jsx
import React,{useEffect,useRef,useState} from "react";
import Header from "./components/Header.jsx";
import BingoCard from "./components/BingoCard.jsx";
import { loadImageFromFile, detectGridCrops, computeAHash, computeDHashX, computeDHashY } from "./utils/image.js";

const ABS_THRESH=8, MIN_GAP=4, PAD_FRAC=0.07;

export default function App(){
  const [cards,setCards]=useState(()=>JSON.parse(localStorage.getItem("cards_v2")||"[]"));
  const [cache,setCache]=useState([]);
  const [loadProg,setLoadProg]=useState({total:0,done:0,loading:false});

  useEffect(()=>{
    const saved=cards.filter(c=>c.saved!==false);
    localStorage.setItem("cards_v2",JSON.stringify(saved));
  },[cards]);

  async function forceLoadSprites(){
    setLoadProg({total:0,done:0,loading:true});
    try{
      const base = (import.meta?.env?.BASE_URL) || document.querySelector("base")?.getAttribute("href") || "./";
      let r = await fetch("drive_cache.json",{cache:"reload"});
      if(!r.ok) r = await fetch(`${base.replace(/\/?$/,"/")}drive_cache.json`,{cache:"reload"});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const j=await r.json();
      const norm=j.map(it=>({
        id:it.id??it.name, name:it.name??String(it.id),
        ahash:it.ahash??it.ah, dhashX:it.dhashX??it.dx, dhashY:it.dhashY??it.dy,
        ahashR:it.ahashR, ahashG:it.ahashG, ahashB:it.ahashB,
        dhashXR:it.dhashXR, dhashXG:it.dhashXG, dhashXB:it.dhashXB,
        dhashYR:it.dhashYR, dhashYG:it.dhashYG, dhashYB:it.dhashYB
      }));
      setCache(norm);
      setLoadProg({total:norm.length,done:norm.length,loading:false});
    }catch{
      setCache([]); setLoadProg({total:0,done:0,loading:false});
    }
  }

  function newBlankCard(){
    const id=`card_${Date.now()}`;
    const tiles=Array.from({length:25},()=>({match:null,ah:0,dx:0,dy:0}));
    const toggles=Array(25).fill(false);
    setCards(cs=>[...cs,{id,title:`Card ${cs.length+1}`,tiles,toggles,saved:false}]);
  }

  async function fillFromScreenshot(cardId,file){
    if(!file) return;
    const img=await loadImageFromFile(file); // ImageBitmap
    const crops=detectGridCrops(img,{padFrac:PAD_FRAC,minGap:MIN_GAP}); // canvases
    const tiles=await Promise.all(crops.map(async (cv)=>{
      const ah=await computeAHash(cv);
      const dx=await computeDHashX(cv), dy=await computeDHashY(cv);
      const match=findBestMatch({ah,dx,dy});
      return {ah,dx,dy,match};
    }));
    setCards(cs=>cs.map(c=>c.id===cardId?{...c,tiles}:c));
  }

  function saveCard(cardId){ setCards(cs=>cs.map(c=>c.id===cardId?{...c,saved:true}:c)) }
  function removeCard(cardId){ setCards(cs=>cs.filter(c=>c.id!==cardId)) }
  function renameCard(cardId,title){ setCards(cs=>cs.map(c=>c.id===cardId?{...c,title}:c)) }
  function toggleCell(cardId,idx){
    setCards(cs=>cs.map(c=>{
      if(c.id!==cardId) return c;
      const t=[...c.toggles]; t[idx]=!t[idx];
      return {...c,toggles:t};
    }));
  }

  function popcnt(n){n=n>>>0;let c=0;while(n){n&=n-1;c++}return c}
  function findBestMatch(sig){
    let best=null,score=1e9;
    for(const it of cache){
      const a=it.ahash, x=it.dhashX, y=it.dhashY;
      if(a==null||x==null||y==null) continue;
      const s=popcnt(sig.ah^a)+popcnt(sig.dx^x)+popcnt(sig.dy^y);
      if(s<score){score=s;best=it}
    }
    return score<=ABS_THRESH?{name:best.name,id:best.id,score}:null;
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <Header
        total={loadProg.total} done={loadProg.done} loading={loadProg.loading}
        cacheLen={cache.length}
        onGetSprites={forceLoadSprites}
        onNewCard={newBlankCard}
      />
      <div className="p-4 grid lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {cards.map(card=>(
          <BingoCard
            key={card.id}
            card={card}
            onTitle={(t)=>renameCard(card.id,t)}
            onFill={(file)=>fillFromScreenshot(card.id,file)}
            onSave={()=>saveCard(card.id)}
            onRemove={()=>removeCard(card.id)}
            onToggle={(i)=>toggleCell(card.id,i)}
          />
        ))}
        {!cards.length && <div className="opacity-70">Create a blank card to begin.</div>}
      </div>
    </div>
  );
}
