// src/hooks/useBingoCard.js
import { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

/**
 * Encapsulates all BingoCard logic; keeps UI separate and stable.
 * Consumer provides: card, manifest, onChange, onRemove
 */
export default function useBingoCard({ card, manifest, onChange, onRemove }) {
  const [title, setTitle] = useState(card?.title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const [results, setResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));
  const [fractions, setFractions] = useState(loadFractions());
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const fileRef = useRef(null);

  const spritesReady = !!manifest && Object.keys(manifest).length > 0;

  function startRename(){ setRenaming(true); }
  function submitRename(e){ e?.preventDefault?.(); setRenaming(false); onChange?.({ ...(card||{}), title }); }
  function onTitleChange(e){ setTitle(e.target.value); onChange?.({ ...(card||{}), title: e.target.value, cells: results, checked }); }

  function pickImage(){ fileRef.current?.click(); }
  function onPickFile(e){
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPendingImageSrc(url);
    setShowTuner(true);
  }

  async function confirmTuner(newFractions){
    setShowTuner(false);
    setFractions(newFractions);
    saveFractions(newFractions);
    if (!pendingImageSrc) return;
    try {
      setAnalyzing(true); setProgress(0);
      const crops = await computeCrops25(pendingImageSrc, newFractions);
      URL.revokeObjectURL(pendingImageSrc); setPendingImageSrc(null);
      let next = Array(25).fill(null);
      if (spritesReady){
        const refs = await prepareRefIndex(manifest);
        for (let i=0;i<25;i++){ 
          const best = await findBestMatch(crops[i], refs);
          next[i] = best ? { label: best.name, matchKey: best.key, matchUrl: best.src } : null;
          setProgress(Math.round(((i+1)/25)*100));
        }
      } else { setProgress(100); }
      setResults(next);
      onChange?.({ ...(card||{}), title, cells: next, saved:false });
    } finally { setAnalyzing(false); }
  }
  function cancelTuner(){ setShowTuner(false); if (pendingImageSrc) URL.revokeObjectURL(pendingImageSrc); setPendingImageSrc(null); }

  function toggleCell(i){ setChecked(prev=>{ const copy=prev.slice(); copy[i]=!copy[i]; onChange?.({ ...(card||{}), title, cells: results, checked: copy }); return copy; }); }

  return { title, renaming, analyzing, progress, spritesReady, cells:results, checked,
    startRename, submitRename, onTitleChange, pickImage, onRemove, toggleCell,
    fileInputProps:{ ref:fileRef, type:'file', accept:'image/*', style:{display:'none'}, onChange:onPickFile },
    showTuner, pendingImageSrc, fractions, confirmTuner, cancelTuner };
}
