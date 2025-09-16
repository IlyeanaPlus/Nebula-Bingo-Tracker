// src/hooks/useBingoCard.js
import { useCallback, useMemo, useState } from "react";
import { getClipSession, embedImage } from "../utils/clipSession";
import { loadSpriteIndex, getSpriteIndex } from "../utils/sprites";
import { cosineHead } from "../utils/matchers";

// Always use the bridge that opens the legacy modal
import refineGridFractions from "../utils/gridRefine";

// Cropper stays tolerant (default or named)
import * as CropsMod from "../utils/computeCrops25Squares";
const computeCrops25Squares =
  CropsMod.default ||
  CropsMod.computeCrops25Squares ||
  CropsMod.crops25 ||
  CropsMod.computeCrops;

import * as Store from "../store/tuningStore";
function getKnobs() {
  const t = Store.tuning || Store.default || Store;
  try { return t?.get ? t.get() : (t?.state ?? {}); } catch { return {}; }
}

export default function useBingoCard({ card, onChange }) {
  const [title, setTitle] = useState(card?.title || "Card 1");
  const [renaming, setRenaming] = useState(false);
  const onRenameStart  = () => setRenaming(true);
  const onRenameCancel = () => { setTitle(card?.title || "Card 1"); setRenaming(false); };
  const onRenameSubmit = (e) => { e?.preventDefault?.(); setRenaming(false); onChange?.({ ...card, title }); };

  const [checked, setChecked]   = useState(card?.checked || Array(25).fill(false));
  const [analyzing, setAnalyzing] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [results,   setResults]   = useState([]);

  const onFileChosen = useCallback(async (file) => {
    if (!file) return;
    try {
      if (typeof computeCrops25Squares !== "function") {
        throw new Error("computeCrops25Squares module missing a callable export");
      }

      setAnalyzing(true);
      setProgress(5);

      // file -> image -> canvas
      const imgUrl = URL.createObjectURL(file);
      const img = await loadImage(imgUrl);
      const srcCanvas = imageToCanvas(img);

      // 🔵 Legacy modal (unchanged) opens here; no local clamping!
      setProgress(15);
      const fractions = await refineGridFractions(srcCanvas);

      // 25 square crops from fractions
      setProgress(30);
      const knobs = getKnobs() || {};
      const crops = computeCrops25Squares(srcCanvas, fractions, {
        lineInsetPx: 0,
        innerInsetPct: knobs.cropInsetPct ?? 0.04,
      });

      // index + session
      await loadSpriteIndex();
      const index   = getSpriteIndex();
      const session = await getClipSession();
      const head    = cosineHead(index);

      // embed + match
      const nextResults = new Array(25);
      for (let i = 0; i < 25; i++) {
        const vec = await embedImage(crops[i], session);
        const k   = Math.max(1, Math.min(10, Number(knobs.debugTopK ?? 1)));
        const top = head.query(vec, k);
        const best = top && top[0] ? {
          score: top[0].score,
          ref: {
            key:  top[0].ref?.key,
            name: top[0].ref?.name,
            slug: top[0].ref?.slug,
            url:  top[0].ref?.url || (top[0].ref?.path ? `/${top[0].ref.path}` : ""),
          }
        } : null;
        nextResults[i] = { best, top };
        setProgress(35 + Math.round((i / 25) * 60));
      }

      // write minimal render data into cells
      const nextCells = (card?.cells?.slice?.() || Array(25).fill(null)).map((c, i) => {
        const r = nextResults[i]?.best;
        const url = r?.ref?.url || "";
        return {
          ...(c || {}),
          label:    r?.ref?.name || (c?.label ?? ""),
          matchKey: r?.ref?.key  || c?.matchKey || "",
          spriteUrl: url, imageUrl: url, matchUrl: url, src: url,
        };
      });

      onChange?.({ ...(card || {}), title, cells: nextCells, checked });
      setResults(nextResults);
      setProgress(100);
    } catch (err) {
      // If user cancels legacy modal, we get a reject: stop gracefully.
      console.warn("Analysis aborted:", err?.message || err);
      setProgress(0);
    } finally {
      setAnalyzing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, title, checked]);

  return useMemo(() => ({
    title, setTitle, renaming, onRenameStart, onRenameCancel, onRenameSubmit,
    analyzing, progress, checked, setChecked,
    onFileChosen, results,
  }), [title, renaming, analyzing, progress, checked, onFileChosen, results]);
}

/* tiny utils */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });
}
function imageToCanvas(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return c;
}
