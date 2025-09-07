// src/components/BingoCard.jsx
import React, { useRef, useState } from "react";
import { computeCrops25, loadFractions, saveFractions } from "../utils/image";
import GridTunerModal from "./GridTunerModal";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

export default function BingoCard({ id, title, spritesIndex, onRemove, onRename }) {
  const [name, setName] = useState(title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const [spritesReady, setSpritesReady] = useState(!!spritesIndex && Object.keys(spritesIndex || {}).length > 0);
  const [matchResults, setMatchResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));
  const [showTuner, setShowTuner] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState(null);
  const [fractions, setFractions] = useState(loadFractions());
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  // --- Rename ---
  function handleRenameClick() { setRenaming(true); }
  function handleRenameSubmit(e) { e.preventDefault(); setRenaming(false); onRename?.(id, name); }

  // --- Fill pipeline ---
  function handlePickImage() { fileInputRef.current?.click(); }
  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPendingImageSrc(url);
    setShowTuner(true);
  }

  async function onTunerConfirm(newFractions) {
    setShowTuner(false);
    setFractions(newFractions);
    saveFractions(newFractions);
    if (!pendingImageSrc) return;

    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = pendingImageSrc; });

    console.log(`[Card ${id}] GridTuner confirm with fractions`, newFractions, "image size", img.width, "x", img.height);

    const crops = computeCrops25(img, newFractions);
    console.log(`[Card ${id}] computeCrops25 produced ${crops.length} crops`, crops[0]);

    setAnalyzing(true);
    setProgress(0);
    try {
      const t0 = performance.now();
      const results = await matchAll(crops, (i) => setProgress(Math.round(((i + 1) / 25) * 100)));
      const t1 = performance.now();
      console.log(`[Card ${id}] matchAll finished in ${(t1 - t0).toFixed(1)} ms`);
      setMatchResults(results);
    } finally {
      setAnalyzing(false);
    }
  }
  function onTunerCancel() { setShowTuner(false); setPendingImageSrc(null); }

  // --- Check/uncheck cells ---
  function toggleCell(i) {
    setChecked((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      return next;
    });
  }

  // --- Save card ---
  function handleSave() {
    const payload = { id, name, fractions, matches: matchResults, checked, ts: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_").toLowerCase() || "card"}_${id}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // --- Matcher ---
  async function matchAll(crops, onStep) {
    if (!spritesIndex) {
      console.warn(`[Card ${id}] matchAll aborted: no sprites loaded`);
      return Array(25).fill(null);
    }
    const prepared = prepareRefIndex(spritesIndex);
    console.log(`[Card ${id}] Ref index prepared with ${Object.keys(spritesIndex).length} sprites`);

    const out = [];
    for (let i = 0; i < 25; i++) {
      const cropCanvas = crops[i];
      const dataURL = cropCanvas.toDataURL("image/png");
      const start = performance.now();
      const best = await findBestMatch(dataURL, prepared);
      const end = performance.now();

      if (best) {
        console.log(
          `[Card ${id}] Cell ${i + 1}/25 matched ${best.name} in ${(end - start).toFixed(1)} ms`,
          { mse: best.mse, ssim: best.ssim, ncc: best.ncc }
        );
      } else {
        console.log(`[Card ${id}] Cell ${i + 1}/25 → no match in ${(end - start).toFixed(1)} ms`);
      }

      out.push(best || null);
      onStep?.(i);
    }
    return out;
  }

  return (
    <div className="card">
      {showTuner && (
        <GridTunerModal
          imageSrc={pendingImageSrc}
          initialFractions={fractions}
          onConfirm={onTunerConfirm}
          onCancel={onTunerCancel}
        />
      )}
    </div>
  );
}
