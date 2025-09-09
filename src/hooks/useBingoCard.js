// src/hooks/useBingoCard.js
import { useCallback, useMemo, useRef, useState } from "react";

import { getSpriteIndex } from "../utils/sprites";
import { findBestMatch } from "../utils/matchers";
import { getClipSession, embedImage } from "../utils/clipSession";
import { tuning } from "../tuning/tuningStore";

// If you already import grid helpers elsewhere, keep those instead:
import "../utils/gridBox.js"; // side-effects (keep if your app relies on it)

// --- tiny helpers ------------------------------------------------------------

const N = 25;

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = typeof file === "string" ? file : URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

// simple 5x5 equal grid cropper (fallback)
// If you have a project-specific cropper, replace this with it.
function computeCrops25(img, { driftPx = 0 } = {}) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const cw = Math.floor(w / 5);
  const ch = Math.floor(h / 5);

  const crops = [];
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      const x = gx * cw;
      const y = gy * ch;
      crops.push({
        x: Math.max(0, x - driftPx),
        y: Math.max(0, y - driftPx),
        w: Math.min(w - x + driftPx, cw + 2 * driftPx),
        h: Math.min(h - y + driftPx, ch + 2 * driftPx),
        // a dataURL for logging/debug (optional)
        toDataURL: () => {
          const c = document.createElement("canvas");
          c.width = cw;
          c.height = ch;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, x, y, cw, ch, 0, 0, cw, ch);
          return c.toDataURL("image/png");
        },
      });
    }
  }
  return crops;
}

async function cropToImageElement(img, crop) {
  const c = document.createElement("canvas");
  c.width = crop.w;
  c.height = crop.h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

  // convert canvas to Image (for embedImage)
  return new Promise((resolve) => {
    const out = new Image();
    out.onload = () => resolve(out);
    out.src = c.toDataURL("image/png");
  });
}

// --- the hook ----------------------------------------------------------------

export default function useBingoCard() {
  const [results, setResults] = useState(() =>
    Array.from({ length: N }, (_, i) => ({
      idx: i,
      score: 0,
      spriteUrl: "",
      ref: null,
      noMatch: false,
    }))
  );
  const [checked, setChecked] = useState(() => Array(N).fill(false));

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analyzedOnce, setAnalyzedOnce] = useState(false);

  const lastImageRef = useRef(null);

  const toggleChecked = useCallback((i) => {
    setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));
  }, []);

  // Main entrypoint from the UI: takes a File, URL, or HTMLImageElement.
  const fillCard = useCallback(
    async (fileOrImage) => {
      if (!fileOrImage) return;

      setAnalyzing(true);
      setAnalyzedOnce(false);
      setProgress(0);

      try {
        const img =
          fileOrImage instanceof HTMLImageElement
            ? fileOrImage
            : await fileToImage(fileOrImage);
        lastImageRef.current = img;

        // 1) crops
        const { cropJitter } = tuning.get();
        const crops = computeCrops25(img, { driftPx: cropJitter || 0 });

        // 2) model + index
        const [session, index] = await Promise.all([
          getClipSession(),
          getSpriteIndex(),
        ]);

        // sanity log
        console.log("[useBingoCard] crops:", crops.length, "index entries:", index?.meta?.length || 0);

        const out = new Array(N);
        let done = 0;

        // 3) process each crop → embed → best match
        for (let i = 0; i < N; i++) {
          const crop = crops[i];
          const cropImg = await cropToImageElement(img, crop);

          // embed (uses unboardEps from tuning inside embedImage via clipSession)
          const embed = await embedImage(cropImg, session);
          // find best (uses live scoreThreshold from tuning by default)
          const best = findBestMatch(embed.data || embed, index);

          let cell = {
            idx: i,
            score: best?.score ?? 0,
            ref: best?.ref ?? null,
            spriteUrl: best?.spriteUrl ?? "",
            noMatch: false,
          };

          if (!best?.spriteUrl) {
            cell.noMatch = true;
          }

          // Optional: log a compact summary for the first few
          if (i < 5) {
            console.log("[match]", "cell", i, {
              idx: best?.idx,
              score: Number(cell.score.toFixed(3)),
              url: cell.spriteUrl ? "(url)" : "",
            });
          }

          out[i] = cell;
          done++;
          setProgress(Math.round((done / N) * 100));
        }

        console.table(
          out.slice(0, 5).map((c, i) => ({
            index: i,
            cell: c.idx,
            score: Number(c.score?.toFixed?.(3) ?? 0),
            url: c.spriteUrl ? c.spriteUrl.slice(0, 48) + "…" : "<empty>",
          }))
        );

        setResults(out);
        setAnalyzedOnce(true);
        setAnalyzing(false);
      } catch (err) {
        console.error("[useBingoCard] analyze fatal error:", err);
        setAnalyzing(false);
        setAnalyzedOnce(true); // ran, but failed—let UI show no-match where appropriate
      }
    },
    []
  );

  const api = useMemo(
    () => ({
      // state for UI
      analyzing,
      progress,
      results,
      analyzedOnce,
      checked,

      // actions
      toggleChecked,
      setResults, // allow external card edits if needed
      fillCard,
    }),
    [analyzing, progress, results, analyzedOnce, checked, toggleChecked]
  );

  return api;
}
