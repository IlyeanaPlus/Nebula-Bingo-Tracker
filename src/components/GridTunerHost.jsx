// src/components/GridTunerHost.jsx
import React, { useEffect, useState, useCallback } from "react";
import GridTunerModal from "./GridTunerModal.jsx";
import { _onOpenGridTuner, _resolveGridTuner } from "../utils/gridTunerBus";

async function toDataURLFromImage(imgEl) {
  try {
    if (imgEl?.src && !imgEl.src.startsWith("blob:")) return imgEl.src;
  } catch {}
  if (!imgEl) return null;
  const w = imgEl.naturalWidth || imgEl.width || 1;
  const h = imgEl.naturalHeight || imgEl.height || 1;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(imgEl, 0, 0);
  return c.toDataURL("image/png");
}

export default function GridTunerHost() {
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [frac, setFrac] = useState({ left: 0, top: 0, width: 1, height: 1 });

  useEffect(() => {
    return _onOpenGridTuner(async ({ image, frac }) => {
      const safeSrc = image ? await toDataURLFromImage(image) : null;
      setImageSrc(safeSrc);

      if (frac && typeof frac.width !== "number") {
        const f = {
          left: frac.left ?? 0,
          top: frac.top ?? 0,
          width: Math.max(0, (frac.right ?? 1) - (frac.left ?? 0)),
          height: Math.max(0, (frac.bottom ?? 1) - (frac.top ?? 0)),
        };
        setFrac(f);
      } else {
        setFrac(frac ?? { left: 0, top: 0, width: 1, height: 1 });
      }
      setOpen(true);
    });
  }, []);

  const handleChange = useCallback((f) => setFrac(f), []);

  const handleConfirm = useCallback((f) => {
    const out = {
      left: f.left,
      top: f.top,
      right: f.left + f.width,
      bottom: f.top + f.height,
      cols: 5,
      rows: 5,
    };
    // Resolve first so the pipeline can proceed, then close host on next tick.
    _resolveGridTuner({ frac: out });
    setTimeout(() => setOpen(false), 0);
  }, []);

  const handleCancel = useCallback(() => {
    _resolveGridTuner(null);
    setTimeout(() => setOpen(false), 0);
  }, []);

  if (!open) return null;

  return (
    <GridTunerModal
      imageSrc={imageSrc}
      initialFractions={frac}
      onChange={handleChange}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
