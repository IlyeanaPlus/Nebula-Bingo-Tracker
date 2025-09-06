// src/App.jsx
import React,{useEffect,useMemo,useRef,useState} from "react";
import Header from "./components/Header.jsx";
import BingoCard from "./components/BingoCard.jsx";
import {
  loadImageFromFile, detectGridCrops,
  computeAHash, computeDHashX, computeDHashY
} from "./utils/image.js";

const ABS_THRESH=8, MIN_GAP=4, PAD_FRAC=0.07;

export default function App(){
  const [cards,setCards]=useState(()=>JSON.parse(localStorage.getItem("cards_v2")||"[]"));
  const [activeId,setActiveId]=useState(cards[0]?.id||null);
  const [cache,setCache]=useState([]);
  const [loadProg,setLoadProg]=useState({total:0,done:0,loading:false});
  const fileRef=useRef();

  // persist only saved cards
  useEffect(()=>{
    const saved=cards.filter(c=>c.saved!==false);
    localStorage.setItem("cards_v2",JSON.stringify(saved));
  },[cards]);

  const activeCard=useMemo(()=>cards.find(c=>c.id===activeId)||null,[cards,activeId]);

  async function forceLoadSprites(){
    setLoadProg({total:0,done:0,loading:true});
    try{
      const r=await fetch("/drive_cache.json",{cache:"reload"});
      const j=await r.json();
      // simulate progress while validating/normalizing
      const norm=[]; let i=0;
      for(const it of j){
        norm.push({
          id:it.id??it.name, name:it.name??String(it.id),
          ahash:it.ahash??it.ah, dhashX:it.dhashX??it.dx, dhashY:it.dhashY??it.dy,
          ahashR:it.ahashR, ahashG:it.ahashG, ahashB:it.ahashB,
          dhashXR:it.dhashXR, dhashXG:it.dhashXG, dhashXB:it.dhashXB,
          dhashYR:it.dhashYR, dhashYG:it.dhashYG, dhashYB:it.dhashYB
        });
        i++; if(i%25===0) setLoadProg({total:j.length,done:i,loading:true});
      }
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
    const card={id,title:`Card ${cards.length+1}`,tiles,toggles,saved:false};
    setCards(cs=>[card,...cs]); setActiveId(id);
  }

  async function fillFromScreenshot(cardId, file){
    if(!file) return;
    const img=await loadImageFromFile(file);
    const crops=detectGridCrops(img,{padFrac:PAD_FRAC,minGap:MIN_GAP});
    const tiles=await Promise.all(crops.map(async (crop)=>{
      const ah=await computeAHash(crop);
      const dx=await computeDHashX(crop),dy=await computeDHashY(crop);
      const match=findBestMatch({ah,dx,dy});
      return {ah,dx,dy,match};
    }));
    setCards(cs=>cs.map(c=>c.id===cardId?{...c,tiles}:c));
  }

  function saveCard(cardId){
    setCards(cs=>cs.map(c=>c.id===cardId?{...c,saved:true}:c));
  }
  function removeCard(cardId){
    setCards(cs=>cs.filter(c=>c.id!==cardId));
    if(activeId===cardId){
      const next=cards.find(c=>c.id!==cardId)?.id||null;
      setActiveId(next);
    }
  }
  function renameCard(id,newTitle){
    setCards(cs=>cs.map(c=>c.id===id?{...c,title:newTitle}:c));
  }
  function toggleCell(idx){
    const card=activeCard; if(!card) return;
    setCards(cs=>cs.map(c=>{
      if(c.id!==card.id) return c;
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
      <div className="p-4 grid md:grid-cols-[1fr]">
        {activeCard?(
          <BingoCard
            key={activeCard.id}
            card={activeCard}
            onRename={renameCard}
            onFill={(file)=>fillFromScreenshot(activeCard.id,file)}
            onSave={()=>saveCard(activeCard.id)}
            onRemove={()=>removeCard(activeCard.id)}
            onToggle={toggleCell}
          />
        ):(
          <div className="opacity-70">Create a blank card to begin.</div>
        )}
      </div>
      {/* hidden file input for Fill (handled in BingoCard) but kept here for safety */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden"/>
    </div>
  );
}
