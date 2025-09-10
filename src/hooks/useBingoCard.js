// src/hooks/useBingoCard.js
import { useRef, useState } from "react";
import { fileToImage, computeCrops25, loadFractions, saveFractions } from "../utils/image";
import { prepareRefIndex, findBestMatch } from "../utils/matchers";

/**
 * useBingoCard()
 * Drives the card state (title/rename), tuner flow, and analyze/fill pipeline.
 */
export default function useBingoCard({ card, manifest, onChange, onRemove }) {
  // --- Title / rename ---
  const [title, setTitle] = useState(card?.title ?? "New Card");
  const [renaming, setRenaming] = useState(false);

  function startRenaming() { setRenaming(true); }
  function cancelRenaming() { setRenaming(false); }
  function commitRenaming(nextTitle) {
    const t = (nextTitle ?? title ?? "").trim() || "New Card";
    setTitle(t);
    setRenaming(false);
    onChange?.({ ...card, title: t });
  }

  // Compatibility shim for older consumers (BingoCard.jsx checks titleEditing?)
  const titleEditing = {
    renaming,
    onTitleClick: startRenaming,
    onTitleInputChange: (e) => setTitle(e?.target?.value ?? ""),
    onTitleInputBlur: (e) => commitRenaming(e?.currentTarget?.value),
  };

  // --- Card results / checkmarks ---
  const [results, setResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));
  const [analyzedOnce, setAnalyzedOnce] = useState(false);

  function toggleChecked(i) {
    setChecked((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      return next;
    });
  }

  // --- Tuner & Fractions ---
  const [fractions, setFractions] = useState(loadFractions());
  const [tunerFractions, setTunerFractions] = useState(fractions);
  const [tunerImage, setTunerImage] = useState(null);
  const [showTuner, setShowTuner] = useState(false);

  // --- File input ---
  const fileInputRef = useRef(null);

  function pickImage() {
    fileInputRef.current?.click();
  }

  async function onFileChange(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const img = await fileToImage(file);
    setTunerImage(img);
    setTunerFractions(fractions || loadFractions());
    setShowTuner(true);           // <-- open tuner BEFORE analyzing
  }

  function cancelTuner() {
    setShowTuner(false);
    setTunerImage(null);
    // clear the input so picking the same file again still triggers change
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function confirmTuner() {
    // Save chosen fractions and run analyze
    const chosen = tunerFractions || fractions || loadFractions();
    saveFractions(chosen);
    setFractions(chosen);
    setShowTuner(false);
    await analyzeFromImage(tunerImage, chosen);
    // don't clear tunerImage until analyze kicks off safely
    setTunerImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // --- Analyze / Fill pipeline ---
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function analyzeFromImage(img, fracs) {
    if (!img) return;
    setAnalyzing(true);
    setProgress(1);
    try {
      // Prepare reference index (vectors + meta). No-op if already prepped.
      await prepareRefIndex();
      setProgress(5);

      // Compute crops (data URLs) from the provided image and fractions.
      const crops = await computeCrops25(img, fracs);
      setProgress(15);

      // For each crop, find best match. Update progress along the way.
      const nextResults = new Array(25);
      for (let i = 0; i < 25; i++) {
        const crop = crops?.[i];
        const r = await findBestMatch(crop);
        nextResults[i] = r || { noMatch: true, label: "", spriteUrl: "" };
        setProgress(15 + Math.round(((i + 1) / 25) * 80)); // 15→95%
      }

      setResults(nextResults);
      setAnalyzedOnce(true);
      setProgress(100);
    } catch (err) {
      console.error(err);
      setResults((prev) => prev?.length === 25 ? prev : Array(25).fill(null));
      setProgress(0);
    } finally {
      // brief delay so users can see 100%
      setTimeout(() => setAnalyzing(false), 150);
    }
  }

  // --- Remove card ---
  function handleRemove() {
    onRemove?.();
  }

  return {
    // title / rename
    title, setTitle, renaming, startRenaming, commitRenaming, cancelRenaming, titleEditing,
    // results / checks
    results, analyzedOnce, checked, toggleChecked,
    // analyze pipeline
    analyzing, progress,
    // file pick + tuner flow
    fileInputRef, onFileChange, pickImage,
    showTuner, tunerImage, tunerFractions, setTunerFractions,
    confirmTuner, cancelTuner,
    // fractions
    fractions, setFractions,
    // remove
    onRemove: handleRemove,
  };
}
