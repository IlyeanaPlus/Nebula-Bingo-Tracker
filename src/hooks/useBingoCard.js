// src/hooks/useBingoCard.js
import { useRef, useState } from "react";
import { fileToImage, computeCrops25 } from "../utils/image";
import { getClipSession, embedImage } from "../utils/clipSession";
import { getSpriteIndex } from "../utils/sprites";
import { findBestMatch } from "../utils/matchers";
import { tuning } from "../tuning/tuningStore";
import { spriteUrlFromMeta } from "../utils/imageHosts";

/** Cache the sprite index across cards */
let spriteIndexPromise = null;
async function ensureSpriteIndex() {
  if (!spriteIndexPromise) spriteIndexPromise = getSpriteIndex();
  return spriteIndexPromise;
}
const log = (...a) => console.log(...a);

// ---- helpers: normalize tiles → Canvas ----
function tileToCanvasSync(tile) {
  if (!tile) return null;
  if (tile && typeof tile.getContext === "function") return tile;
  if (tile && tile.data && Number.isFinite(tile.width) && Number.isFinite(tile.height)) {
    const c = document.createElement("canvas");
    c.width = tile.width; c.height = tile.height;
    c.getContext("2d").putImageData(tile, 0, 0);
    return c;
  }
  if (tile instanceof Image) {
    const c = document.createElement("canvas");
    c.width = tile.naturalWidth || tile.width || 224;
    c.height = tile.naturalHeight || tile.height || 224;
    c.getContext("2d").drawImage(tile, 0, 0, c.width, c.height);
    return c;
  }
  return null;
}
function dataUrlToCanvas(dataUrl) {
  return new Promise((res, rej) => {
    try {
      const img = new Image();
      img.onload = () => res(tileToCanvasSync(img));
      img.onerror = rej;
      img.src = dataUrl;
    } catch (e) { rej(e); }
  });
}
async function tileToCanvas(tile) {
  if (typeof tile === "string" && tile.startsWith("data:")) {
    return await dataUrlToCanvas(tile);
  }
  return tileToCanvasSync(tile);
}

// Test-time augmentation: average N crops per tile, then L2-norm
async function embedWithAug(canvas, session, times = 5) {
  const crops = [canvas]; // (we can add offsets later if needed)
  let acc = null, used = 0;
  for (const c of crops) {
    const out = await embedImage(c, session); // respects tuning.unboardEps internally
    const vec =
      (out && out.data && out.data instanceof Float32Array && out.data) ||
      (out instanceof Float32Array ? out : new Float32Array(out?.data || []));
    if (!vec || !vec.length) continue;
    if (!acc) acc = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) acc[i] += vec[i];
    used++;
  }
  if (!acc || used === 0) return null;
  // L2-norm
  let sum = 0.0; for (let i = 0; i < acc.length; i++) sum += acc[i] * acc[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  for (let i = 0; i < acc.length; i++) acc[i] *= inv;
  return acc;
}

export default function useBingoCard({ card, manifest, onChange, onRemove }) {
  // --- Title / rename ---
  const [title, setTitle] = useState(card?.title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const startRenaming = () => setRenaming(true);
  const commitRenaming = (nextTitle) => {
    const finalTitle = (nextTitle ?? "").trim();
    setTitle(finalTitle || "New Card");
    setRenaming(false);
    if (typeof onChange === "function") onChange({ ...(card || {}), title: finalTitle || "New Card" });
  };
  const titleEditing = {
    renaming,
    onTitleClick: startRenaming,
    onTitleInputBlur: (e) => commitRenaming(e?.currentTarget?.value ?? title),
  };

  // ---- preview state for CropPreviewModal (optional) ----
  if (typeof window !== "undefined") {
    window.__BINGO_PREVIEW_STATE__ = {
      getImage: () => tunerImage,
      getFractions: () => tunerFractions || fractions || { left:0, top:0, width:1, height:1 },
      getTuning: () => (tuning.get?.() || {}),
    };
  }

  // --- Grid data ---
  const [results, setResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));
  const toggleChecked = (i) => setChecked((prev) => {
    const next = prev.slice();
    if (i >= 0 && i < 25) next[i] = !next[i];
    return next;
  });

  // --- Fill / analyze scaffolding ---
  const fileInputRef = useRef(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedOnce, setAnalyzedOnce] = useState(false);
  const [progress, setProgress] = useState(0);

  // Tuner controls
  const [showTuner, setShowTuner] = useState(false);
  const [tunerImage, setTunerImage] = useState(null);
  const [tunerImageSrc, setTunerImageSrc] = useState(null);
  const [fractions, setFractions] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [tunerFractions, setTunerFractions] = useState(null);

  const pickImage = () => fileInputRef.current?.click?.();

  const onFileChange = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    try {
      setAnalyzing(false);
      setProgress(0);
      const img = await fileToImage(file);
      setTunerImage(img);
      setTunerImageSrc(img?.src || null);
      setTunerFractions(fractions || { left: 0, top: 0, width: 1, height: 1 });
      setShowTuner(true);
    } catch (err) {
      console.warn("[useBingoCard] Failed to load image:", err);
    } finally {
      if (e?.target) e.target.value = ""; // allow re-pick same file
    }
  };

  /** Confirm → crop → embed → match → results */
  const onTunerConfirm = async (finalFractions) => {
    const f = finalFractions || tunerFractions || fractions || { left: 0, top: 0, width: 1, height: 1 };

    // Show HUD immediately so user sees progress even as modal closes
    setAnalyzing(true);
    setProgress(5);
    setFractions(f);
    setShowTuner(false);

    try {
      // 1) Crop 25 tiles
      if (!tunerImage) throw new Error("No tuner image set");
      const rawTiles = computeCrops25(tunerImage, f);
      const canvases = await Promise.all((rawTiles || []).map(tileToCanvas));
      const sizes = canvases.slice(0, 3).map(c => (c ? `${c.width}x${c.height}` : "null")).join(", ");
      log("[useBingoCard] crops:", canvases.length, "example sizes:", sizes);
      setProgress(15);

      // 2) CLIP session
      const session = await getClipSession();
      setProgress(30);

      // 3) Sprite index (512-D rows)
      const index = await ensureSpriteIndex(); // { dim, count, vectors, meta, normalized:true }
      log("[useBingoCard] index shape:", { dim: index?.dim || 0, count: index?.count || 0 });
      setProgress(35);

      // 4) Embed & match
      const { scoreThreshold = 0.28 } = (tuning.get?.() || {});
      const nextResults = Array(25).fill(null);

      for (let i = 0; i < 25; i += 1) {
        const canvas = canvases[i];
        if (!canvas) {
          nextResults[i] = { id: String(i + 1), value: "", noMatch: true };
          continue;
        }

        try {
          const vec = await embedWithAug(canvas, session, 1);
          if (!vec) throw new Error("Empty embedding");
          if (index?.dim && vec.length !== index.dim) {
            log("[useBingoCard] embed dim vs index dim:", vec.length, index.dim);
          }

          const match = findBestMatch(vec, index, scoreThreshold);
          if (match) {
            const refMeta = match.ref || match.meta || {};
            nextResults[i] = {
              id: String(i + 1),
              value: refMeta.name || refMeta.key || "",
              match,
              spriteUrl: spriteUrlFromMeta(refMeta),
            };
          } else {
            nextResults[i] = { id: String(i + 1), value: "", noMatch: true };
          }
        } catch (err) {
          console.warn(`[useBingoCard] Embed/match failed at tile ${i}:`, err);
          nextResults[i] = { id: String(i + 1), value: "", noMatch: true };
        }

        setProgress(35 + Math.round(((i + 1) / 25) * 60));
      }

      // 5) Commit results
      setResults(nextResults);
      setAnalyzedOnce(true);
      setProgress(100);
    } catch (err) {
      console.warn("[useBingoCard] onTunerConfirm pipeline error:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const onTunerCancel = () => {
    setShowTuner(false);
    setTunerImage(null);
    setTunerImageSrc(null);
    setTunerFractions(null);
  };

  const removeSelf = () => { if (typeof onRemove === "function") onRemove(card); };

  return {
    // Read
    title, renaming, analyzing, analyzedOnce, progress, results, checked,
    showTuner, tunerImage, tunerImageSrc, fractions, tunerFractions,

    // Actions
    startRenaming, setTitle, commitRenaming, pickImage, onFileChange,
    onTunerConfirm, onTunerCancel, setFractions, setTunerFractions,
    toggleChecked, setResults, onRemove: removeSelf,

    // Legacy bundle
    titleEditing, fileInputRef,
  };
}
