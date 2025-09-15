// src/hooks/useBingoCard.js
import { useRef, useState } from "react";
import { fileToImage } from "../utils/image";
import { computeCrops25Squares } from "../utils/computeCrops25Squares";
import { getClipSession, embedImage } from "../utils/clipSession";
import { getSpriteIndex } from "../utils/sprites";
import { prepForClip } from "../utils/cropFx";
import { findBestMatch } from "../utils/matchers";
import { tuning } from "../tuning/tuningStore";
import { spriteUrlFromMeta } from "../utils/imageHosts";
import { refineGridFractions } from "../utils/gridRefine";

let spriteIndexPromise = null;
async function ensureSpriteIndex() {
  if (!spriteIndexPromise) spriteIndexPromise = getSpriteIndex();
  return spriteIndexPromise;
}
const log = (...a) => console.log(...a);

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

async function embedWithAug(canvas, session, times = 1, tagHint = null) {
  function jitterCanvas(src, j) {
    if (j === 0) return src;
    const dx = ((j % 3) - 1);
    const dy = (((j / 3) | 0) - 1);
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    c.getContext("2d").drawImage(src, dx, dy);
    return c;
  }

  const N = Math.max(1, times);
  let acc = null, used = 0, dim = 0;

  for (let i = 0; i < N; i++) {
    const jcan = jitterCanvas(canvas, i);
    const fx = prepForClip(jcan, (tuning.get?.() || {}));
    const vec = await embedImage(fx.embedCanvas, session, tagHint);
    if (!vec || !vec.length) continue;
    if (!acc) { acc = new Float32Array(vec.length); dim = vec.length; }
    for (let k = 0; k < dim; k++) acc[k] += vec[k];
    used++;
  }

  if (!acc || used === 0) return null;
  for (let k = 0; k < acc.length; k++) acc[k] /= used;
  let s = 0; for (let k = 0; k < acc.length; k++) s += acc[k] * acc[k];
  if (s > 0) {
    const inv = 1 / Math.sqrt(s);
    for (let k = 0; k < acc.length; k++) acc[k] *= inv;
  }
  return acc;
}

export default function useBingoCard({ card, manifest, onChange, onRemove }) {
  const [title, setTitle] = useState(card?.title || "New Card");
  const [renaming, setRenaming] = useState(false);
  const startRenaming = () => setRenaming(true);
  const commitRenaming = (nextTitle) => {
    const finalTitle = (nextTitle ?? "").trim();
    setTitle(finalTitle || "New Card"); setRenaming(false);
    if (typeof onChange === "function")
      onChange({ ...(card || {}), title: finalTitle || "New Card" });
  };
  const titleEditing = { renaming, onTitleClick: startRenaming, onTitleInputBlur: (e) => commitRenaming(e?.currentTarget?.value ?? title) };

  const [results, setResults] = useState(Array(25).fill(null));
  const [checked, setChecked] = useState(Array(25).fill(false));
  const toggleChecked = (i) => setChecked((prev) => {
    const next = prev.slice();
    if (i >= 0 && i < 25) next[i] = !next[i];
    return next;
  });

  const fileInputRef = useRef(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedOnce, setAnalyzedOnce] = useState(false);
  const [progress, setProgress] = useState(0);

  const [showTuner, setShowTuner] = useState(false);
  const [tunerImage, setTunerImage] = useState(null);
  const [tunerImageSrc, setTunerImageSrc] = useState(null);
  const [fractions, setFractions] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [tunerFractions, setTunerFractions] = useState(null);

  if (typeof window !== "undefined") {
    window.__BINGO_PREVIEW_STATE__ = {
      getImage: () => tunerImage,
      getFractions: () => tunerFractions || fractions || { left:0, top:0, width:1, height:1 },
      getTuning: () => (tuning.get?.() || {}),
    };
  }

  const pickImage = () => fileInputRef.current?.click?.();

  const onFileChange = async (e) => {
    const file = e?.target?.files?.[0]; if (!file) return;
    try {
      setAnalyzing(false); setProgress(0);
      const img = await fileToImage(file);
      setTunerImage(img); setTunerImageSrc(img?.src || null);
      setTunerFractions(fractions || { left: 0, top: 0, width: 1, height: 1 });
      setShowTuner(true);
    } catch (err) {
      console.warn("[useBingoCard] Failed to load image:", err);
    } finally {
      if (e?.target) e.target.value = "";
    }
  };

  const onTunerConfirm = async (finalFractions) => {
    let f = finalFractions || tunerFractions || fractions || { left: 0, top: 0, width: 1, height: 1 };

    setAnalyzing(true);
    setProgress(3);

    const sessionPromise = getClipSession()
      .then(s => (console.log("[useBingoCard] session ready"), s))
      .catch(e => { console.error("[useBingoCard] session error:", e); throw e; });

    try {
      f = await refineGridFractions(tunerImage, f, { rows: 5, cols: 5 });
      setFractions(f);
      console.log("[useBingoCard] refined fractions:", f);
    } catch (e) {
      console.warn("[gridRefine] using coarse fractions:", e);
      setFractions(f);
    }

    setProgress(8);
    setShowTuner(false);

    try {
      if (!tunerImage) throw new Error("No tuner image set");
      const rawTiles = computeCrops25Squares(tunerImage, f, {
        lineInsetPx: 2,
        innerInsetPct: 0.00,
      });
      const canvases = await Promise.all((rawTiles || []).map(tileToCanvas));
      console.log("[useBingoCard] crops:", canvases.length, "example sizes:", canvases.slice(0,3).map(c=>c?`${c.width}x${c.height}`:"null").join(", "));
      setProgress(15);

      const session = await sessionPromise;
      setProgress(30);

      const index = await ensureSpriteIndex();
      console.log("[useBingoCard] index shape:", { dim: index?.dim || 0, count: index?.count || 0 });
      setProgress(35);

      const { scoreThreshold = 0.28, jitterFrac = 0.0 } = (tuning.get?.() || {});
      const multi = Math.max(1, Math.round((jitterFrac || 0) > 0 ? 9 : 1));
      const nextResults = Array(25).fill(null);

      for (let i = 0; i < 25; i++) {
        const canvas = canvases[i];
        if (!canvas) { nextResults[i] = { id: String(i + 1), value: "", noMatch: true }; continue; }

        try {
          window.__NBT_DEV = window.__NBT_DEV || {};
          window.__NBT_DEV.lastCell = i + 1;
          const vec = await embedWithAug(canvas, session, multi, i + 1);
          if (!vec) throw new Error("Empty embedding");

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

      setResults(nextResults);
      setAnalyzedOnce(true);
      setProgress(100);
    } catch (err) {
      console.warn("[useBingoCard] onTunerConfirm error:", err);
      alert(`Analyzer error: ${err?.message || err}`);
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
    title, renaming, analyzing, analyzedOnce, progress, results, checked,
    showTuner, tunerImage, tunerImageSrc, fractions, tunerFractions,
    startRenaming, setTitle, commitRenaming, pickImage,
    onFileChange, onTunerConfirm, onTunerCancel, setFractions, setTunerFractions,
    toggleChecked, setResults, onRemove: removeSelf, titleEditing, fileInputRef,
  };
}
