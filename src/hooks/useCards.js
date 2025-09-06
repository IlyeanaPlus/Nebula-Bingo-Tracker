import {useCallback,useEffect,useMemo,useState} from "react";

export function useCards(){
  const [cards,setCards]=useState(()=>JSON.parse(localStorage.getItem("cards_v2")||"[]"));
  const [activeId,setActiveId]=useState(cards[0]?.id||null);
  useEffect(()=>{localStorage.setItem("cards_v2",JSON.stringify(cards))},[cards]);
  const activeCard=useMemo(()=>cards.find(c=>c.id===activeId)||null,[cards,activeId]);

  const addCard=useCallback((title,tiles)=>{
    const id=`card_${Date.now()}`;
    const toggles=Array(25).fill(false);
    const card={id,title,tiles,toggles};
    setCards(cs=>[card,...cs]);
    return id;
  },[]);

  const renameCard=useCallback((id,newTitle)=>{
    setCards(cs=>cs.map(c=>c.id===id?{...c,title:newTitle}:c));
  },[]);

  const toggleCell=useCallback((id,idx)=>{
    setCards(cs=>cs.map(c=>{
      if(c.id!==id) return c;
      const t=[...c.toggles]; t[idx]=!t[idx];
      return {...c,toggles:t};
    }));
  },[]);

  const removeCard=useCallback((id)=>{
    setCards(cs=>cs.filter(c=>c.id!==id));
  },[]);

  return {cards,activeId,activeCard,setActiveId,addCard,renameCard,toggleCell,removeCard};
}
