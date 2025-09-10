import { useCallback, useMemo, useRef, useState } from "react";

import { getSpriteIndex } from "../utils/sprites";
import { findBestMatch } from "../utils/matchers";
import { getClipSession, embedImage } from "../utils/clipSession";
import { tuning } from "../tuning/tuningStore";

const N = 25;

/** Robust image loader for: File/Blob | HTMLImageElement | http(s) | /path | data:URL */
function fileToImage(srcLike) {
  return new Promise((resolve, reject) => {
    if (!srcLike) return reject(new Error("No image source provided"));
    if (srcLike instanceof HTMLImageElement) return resolve(srcLike);

    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));

    if (typeof srcLike === "string") {
      // direct string (http(s), /path, data:URL)
      img.src = srcLike;
    } else if (srcLike instanceof Blob) {
      const url = URL.createObjectURL(srcLike);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.src = url;
    } else {
      reject(new Error("Unsupported image source type"));
    }
  });
}

// simple 5x5 equal grid cropper (use your own if you have one)
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
  return new Promise((resolve) => {
    const out = new Image();
    out.onload = () => resolve(out);
    out.src = c.toDataURL("image/png");
  });
}

export default function useBingoCard() {
  const [results, setResults] = useState(() =>
    Array.from({ length: N }, (_, i) => ({
      idx: i,
      score: 0,
      spriteUrl: "",
      ref: null,
      noMatch: false,
    })),
  );
  const [checked, setChecked] = useState(() => Array(N).fill(false));
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analyzedOnce, setAnalyzedOnce] = useState(false);

  const lastImageRef = useRef(null);

  // hidden file input to trigger picker from the Fill button
  const fileInputRef = useRef(null);
  const pickImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const onFileChange = useCallback((e) => {
    const f = e.target.files && e.target.files[0];
    if (f) fillCard(f);
    // reset so selecting the same file again still fires change
    e.target.value = "";
  }, []);

  const toggleChecked = useCallback((i) => {
    setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));
  }, []);

  // Main analyze function; accepts File/Blob, HTMLImageElement, or URL/data: string.
  const fillCard = useCallback(async (fileOrImage) => {
    try {
      // If called with an event or nothing: route to picker to avoid bad src to createObjectURL
      if (!fileOrImage || (fileOrImage && fileOrImage.target)) {
        pickImage();
        return;
      }

      setAnalyzing(true);
      setAnalyzedOnce(false);
      setProgress(0);

      const img = await fileToImage(fileOrImage);
      lastImageRef.current = img;

      const { cropJitter } = tuning.get();
      const crops = computeCrops25(img, { driftPx: cropJitter || 0 });

      const [session, index] = await Promise.all([getClipSession(), getSpriteIndex()]);
      const out = new Array(N);
      let done = 0;

      for (let i = 0; i < N; i++) {
        const crop = crops[i];
        const cropImg = await cropToImageElement(img, crop);
        const embed = await embedImage(cropImg, session);
        const best = findBestMatch(embed.data || embed, index);

        const cell = {
          idx: i,
          score: best?.score ?? 0,
          ref: best?.ref ?? null,
          spriteUrl: best?.spriteUrl ?? "",
          noMatch: !best?.spriteUrl,
        };

        if (i < 5) {
          console.log("[match] cell", i, {
            idx: best?.idx,
            score: Number((cell.score || 0).toFixed(3)),
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
          score: Number((c.score || 0).toFixed(3)),
          url: c.spriteUrl ? c.spriteUrl.slice(0, 48) + "…" : "<empty>",
        })),
      );

      setResults(out);
      setAnalyzedOnce(true);
      setAnalyzing(false);
    } catch (err) {
      console.error("[useBingoCard] analyze fatal error:", err);
      setAnalyzing(false);
      setAnalyzedOnce(true);
    }
  }, [pickImage]);

  return useMemo(
    () => ({
      // state
      analyzing,
      progress,
      results,
      analyzedOnce,
      checked,

      // refs (wire these into your container/Sidebar)
      fileInputRef,
      onFileChange,

      // actions
      pickImage,   // open file picker
      fillCard,    // can still be called with File/URL/HTMLImageElement
      toggleChecked,
      setResults,
    }),
    [analyzing, progress, results, analyzedOnce, checked, pickImage, fillCard, toggleChecked],
  );
}
