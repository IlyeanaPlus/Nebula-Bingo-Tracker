// src/hooks/useBingoCard.js
import { useCallback, useMemo, useState } from "react";
import { getClipSession, embedImage } from "../utils/clipSession";
import { loadSpriteIndex, getSpriteIndex } from "../utils/sprites";
import { cosineHead, rerankTopByShape } from "../utils/matchers";
import { excludeRef } from "../utils/speciesFilter";

// Always use the bridge that opens the legacy modal
import refineGridFractions from "../utils/gridRefine";

// Cropper stays tolerant (default or named)
import * as CropsMod from "../utils/computeCrops25Squares";
const computeCrops25Squares =
  CropsMod.default ||
  CropsMod.computeCrops25Squares ||
  CropsMod.crops25 ||
  CropsMod.computeCrops;

// Optional debug export to get Raw/Pass1/Pass2; falls back if absent
const computeCrops25SquaresDebug =
  CropsMod.computeCrops25SquaresDebug || null;

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

  const [checked, setChecked]     = useState(card?.checked || Array(25).fill(false));
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

      // knobs for both code paths
      const knobs = getKnobs() || {};
      const innerInset = knobs.cropInsetPct ?? 0.04;

      // crops for matcher + optional debug previews
      setProgress(30);
      let debugPerCell = null;
      let cropsForMatcher = null;

      if (typeof computeCrops25SquaresDebug === "function") {
        // three previews per cell: raw, pass1, pass2 (+ alpha64 if provided)
        debugPerCell = computeCrops25SquaresDebug(srcCanvas, fractions, {
          lineInsetPx: 0,
          innerInsetPct: innerInset,
          padRatio: 1.10,
          feather: 0,
        });
        cropsForMatcher = debugPerCell.map(d => d.pass2);
      } else {
        // fallback: single crop used as all three to keep panel from being empty
        const crops = computeCrops25Squares(srcCanvas, fractions, {
          lineInsetPx: 0,
          innerInsetPct: innerInset,
          padRatio: 1.10,
          feather: 0,
        });
        cropsForMatcher = crops;
        debugPerCell = (crops || []).map(cv => ({
          raw: cv, pass1: cv, pass2: cv, alpha64: [], stats: {}, params: {}
        }));
      }

      // Build preview-friendly result objects FIRST so DevDebugPanel has something to show
      const initialResults = new Array(25).fill(null).map((_, i) => {
        const d = debugPerCell[i] || {};
        return {
          best: null,
          top: [],
          debug: {
            raw: d.raw || null,
            pass1: d.pass1 || null,
            pass2: d.pass2 || null,
            alpha64: d.alpha64 || [],
            stats: d.stats || {},
            params: d.params || {},
          },
        };
      });

      // ✅ Show previews immediately (and broadcast for any listeners)
      setResults(initialResults);
      try { window.dispatchEvent(new CustomEvent("nbt:debugResults", { detail: initialResults })); } catch {}

      // index + session (with legendary/UB/paradox filter)
      await loadSpriteIndex();
      const index   = getSpriteIndex();
      const session = await getClipSession();
      const head    = cosineHead(index, { excludeRef });

      // embed + match (progressively update results so previews never disappear)
      const nextResults = initialResults.slice();
      for (let i = 0; i < 25; i++) {
        const vec = await embedImage(cropsForMatcher[i], session);
        const k   = Math.max(1, Math.min(10, Number(knobs.debugTopK ?? 5)));
        let top   = head.query(vec, k);

        // optional shape re-rank if alpha64 is present
        try {
          if (typeof rerankTopByShape === "function" && debugPerCell[i]?.alpha64?.length) {
            top = rerankTopByShape(top, debugPerCell[i].alpha64, index, {
              wClip: 0.70, wShape: 0.30, minShape: 0.12, ignoreBorder: 2,
            });
          }
        } catch {}

        const best = top && top[0] ? {
          score: top[0].score,
          ref: {
            key:  top[0].ref?.key,
            name: top[0].ref?.name,
            slug: top[0].ref?.slug,
            url:  top[0].ref?.url || (top[0].ref?.path ? `/${top[0].ref.path}` : ""),
          }
        } : null;

        nextResults[i] = { ...nextResults[i], top, best };

        // keep previews alive + incremental updates
        setResults(nextResults.slice());
        try { window.dispatchEvent(new CustomEvent("nbt:debugResults", { detail: nextResults })); } catch {}

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

      // final broadcast
      try { window.dispatchEvent(new CustomEvent("nbt:debugResults", { detail: nextResults })); } catch {}

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
