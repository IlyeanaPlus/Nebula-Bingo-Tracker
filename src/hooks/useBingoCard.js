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

  // Tuner modal + file input state
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const fileRef = useRef(null);

  const spritesReady = !!manifest && Object.keys(manifest).length > 0;

  // --- Title rename flow ---
  function startRename() { setRenaming(true); }

  function submitRename(e) {
    e?.preventDefault?.();
    setRenaming(false);
    onChange?.({ ...(card || {}), title });
  }

  function onTitleChange(e) {
    const t = e.target.value;
    setTitle(t);
    // Auto-persist as you type
    onChange?.({ ...(card || {}), title: t, cells: results, checked });
  }

  // --- Pick image flow (opens OS picker reliably) ---
  function pickImage() {
    if (fileRef.current) {
      // Ensure onChange fires even if the user re-selects the same file
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke any previous object URL to avoid memory leaks
    if (pendingImageSrc) {
      try { URL.revokeObjectURL(pendingImageSrc); } catch {}
    }

    const url = URL.createObjectURL(file);
    setPendingImageSrc(url);
    setShowTuner(true);
  }

  // --- Tuner confirm/cancel ---
  async function confirmTuner(newFractions) {
    setShowTuner(false);
    setFractions(newFractions);
    saveFractions(newFractions);
    if (!pendingImageSrc) return;

    try {
      setAnalyzing(true);
      setProgress(0);

      const crops = await computeCrops25(pendingImageSrc, newFractions);

      // Free the blob URL now that we've read it
      try { URL.revokeObjectURL(pendingImageSrc); } catch {}
      setPendingImageSrc(null);

      let next = Array(25).fill(null);

      if (spritesReady) {
        const refs = await prepareRefIndex(manifest);
        for (let i = 0; i < 25; i++) {
          const best = await findBestMatch(crops[i], refs);
          next[i] = best ? { label: best.name, matchKey: best.key, matchUrl: best.src } : null;
          setProgress(Math.round(((i + 1) / 25) * 100));
        }
      } else {
        // No sprites yet; fill stays empty but we still complete progress
        setProgress(100);
      }

      setResults(next);
      onChange?.({ ...(card || {}), title, cells: next, fractions: newFractions });
    } finally {
      setAnalyzing(false);
    }
  }

  function cancelTuner() {
    setShowTuner(false);
    if (pendingImageSrc) {
      try { URL.revokeObjectURL(pendingImageSrc); } catch {}
    }
    setPendingImageSrc(null);
  }

  // --- Cell toggle ---
  function toggleCell(i) {
    setChecked(prev => {
      const copy = prev.slice();
      copy[i] = !copy[i];
      onChange?.({ ...(card || {}), title, cells: results, checked: copy });
      return copy;
    });
  }

  // Provide props for a hidden file input (render it in the view)
  const fileInputProps = {
    ref: fileRef,
    type: "file",
    accept: "image/*",
    style: { display: "none" },
    onChange: onPickFile,
  };

  return {
    // State for the view
    title,
    renaming,
    analyzing,
    progress,
    spritesReady,
    cells: results,
    checked,

    // Actions
    startRename,
    submitRename,
    onTitleChange,
    pickImage,
    onRemove, // passed through for the header Remove button
    toggleCell,

    // Hidden file input props (render with: <input {...h.fileInputProps} />)
    fileInputProps,

    // Tuner modal plumbing
    showTuner,
    pendingImageSrc,
    fractions,
    confirmTuner,
    cancelTuner,
  };
}
