// src/hooks/useBingoCard.js
// Hook: compute 25 crops → CLIP embeddings → match against sprite index.

import { useRef, useState } from "react";
import { computeCrops25, fileToImage, loadFractions } from "../utils/image";
import { getSpriteIndex } from "../utils/sprites";
import { dataUrlToImage } from "../utils/clip";
import { getClipSession, embedImage } from "../utils/clipSession";
import { findBestMatch } from "../utils/matchers";

export default function useBingoCard({ card, manifest, onChange, onRemove }) {
  const [title, setTitle] = useState(card?.title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const [results, setResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));
  const [fractions, setFractions] = useState(loadFractions());
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showTuner, setShowTuner] = useState(false);

  // Public actions
  async function analyzeScreenshot(file) {
    setAnalyzing(true);
    setProgress(0);
    try {
      const img = await fileToImage(file);
      const crops = computeCrops25(img, fractions);       // 25 dataURLs
      const session = await getClipSession();
      const index = await getSpriteIndex();

      const newResults = [];
      for (let i = 0; i < crops.length; i++) {
        try {
          const cropImg = await dataUrlToImage(crops[i]);
          const tensor = await embedImage(cropImg, session); // returns Tensor
          const best = findBestMatch(tensor.data, index);
          newResults.push(best);
        } catch (e) {
          console.warn(`[useBingoCard] match failed for cell ${i}`, e);
          newResults.push(null);
        }
        setProgress(Math.round(((i + 1) / crops.length) * 100));
      }

      setResults(newResults);
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleChecked(idx) {
    setChecked(prev => {
      const next = prev.slice();
      next[idx] = !next[idx];
      return next;
    });
  }

  function clearResults() {
    setResults(Array(25).fill(null));
    setChecked(Array(25).fill(false));
  }

  return {
    title, setTitle, renaming, setRenaming,
    results, checked, fractions, setFractions,
    analyzing, progress, showTuner, setShowTuner,
    analyzeScreenshot, toggleChecked, clearResults,
    onRemove,
  };
}