// src/components/Header.jsx
import React from "react";

export default function Header({total,done,loading,cacheLen,onGetSprites,onNewCard}){
  const pct = total? Math.round((done/total)*100) : (cacheLen?100:0);
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
      <div className="text-lg font-semibold">Nebula Bingo Tracker</div>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 min-w-[240px]">
          <div className="text-xs text-neutral-300">Sprites: {cacheLen}</div>
          <div className="w-48 h-2 bg-neutral-800 rounded overflow-hidden">
            <div className="h-full bg-neutral-500" style={{width:`${pct}%`}}/>
          </div>
        </div>
        <button onClick={onGetSprites} className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded">Get Sprites</button>
        <button onClick={onNewCard} className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded">New Card</button>
      </div>
    </header>
  );
}
