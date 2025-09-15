// src/components/CropPreviewModal.jsx
import { useEffect, useMemo, useState } from "react";
import { computeCrops25 } from "../utils/image";

// ——— tiny helpers ———
function tileToCanvas(tile) {
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
  if (typeof tile === "string" && tile.startsWith("data:")) {
    const img = new Image();
    img.src = tile;
    return new Promise((res, rej) => {
      img.onload = () => res(tileToCanvas(img)); img.onerror = rej;
    });
  }
  return null;
}
function toThumb(canvas, size = 96) {
  if (!canvas) return "";
  const t = document.createElement("canvas");
  t.width = size; t.height = size;
  t.getContext("2d").drawImage(canvas, 0, 0, size, size);
  return t.toDataURL("image/png");
}
function cropCanvas(src, x, y, w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w|0); c.height = Math.max(1, h|0);
  c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}
function makeAugCrops(baseCanvas, { unboardPct = 0.12, jitterFrac = 0.04, multiCrop = 5 } = {}) {
  const w = baseCanvas.width|0, h = baseCanvas.height|0;
  const mx = Math.round(w * Math.max(0, Math.min(unboardPct, 0.4)));
  const my = Math.round(h * Math.max(0, Math.min(unboardPct, 0.4)));
  let x = mx, y = my, cw = Math.max(1, w - 2*mx), ch = Math.max(1, h - 2*my);
  const side = Math.min(cw, ch);
  x += Math.floor((cw - side) / 2);
  y += Math.floor((ch - side) / 2);

  const j = Math.round(side * Math.max(0, Math.min(jitterFrac, 0.15)));
  const centers = [{dx:0,dy:0}];
  if (multiCrop > 1) centers.push({dx:j,dy:0},{dx:-j,dy:0},{dx:0,dy:j},{dx:0,dy:-j});
  const out = [];
  for (let k = 0; k < Math.min(multiCrop, centers.length); k++) {
    const {dx,dy} = centers[k];
    const cx = Math.max(0, Math.min(w - side, x + dx));
    const cy = Math.max(0, Math.min(h - side, y + dy));
    out.push(cropCanvas(baseCanvas, cx, cy, side, side));
  }
  return out;
}

/**
 * Preview modal:
 * - Reads image/fractions from window.__BINGO_PREVIEW_STATE__ (exported by useBingoCard)
 * - Shows 25 base crops (what we feed to CLIP)
 * - For a selected tile, shows unboard+jitter augments with current tuning values
 */
export default function CropPreviewModal({ onClose }) {
  const [tiles, setTiles] = useState([]);       // base canvases (25)
  const [thumbs, setThumbs] = useState([]);     // data-urls for grid
  const [sel, setSel] = useState(0);            // selected tile
  const [augThumbs, setAugThumbs] = useState([]); // selected tile aug previews

  // pull live tuning values if present
  const tuning = useMemo(() => (window?.__BINGO_PREVIEW_STATE__?.getTuning?.() || {}), []);
  const aug = useMemo(() => ({
    unboardPct: tuning.unboardPct ?? 0.12,
    jitterFrac: tuning.jitterFrac ?? 0.04,
    multiCrop: tuning.multiCrop ?? 5,
  }), [tuning]);

  useEffect(() => {
    (async () => {
      const api = window.__BINGO_PREVIEW_STATE__;
      const img = api?.getImage?.();
      const fr = api?.getFractions?.();
      if (!img) return;

      const raw = computeCrops25(img, fr || { left:0, top:0, width:1, height:1 }) || [];
      const canv = [];
      for (const t of raw) canv.push(await tileToCanvas(t));
      setTiles(canv);

      setThumbs(canv.map((c, i) => c ? toThumb(c, 96) : ""));
    })();
  }, []);

  useEffect(() => {
    const c = tiles[sel];
    if (!c) { setAugThumbs([]); return; }
    const crops = makeAugCrops(c, aug);
    setAugThumbs(crops.map(cc => toThumb(cc, 128)));
  }, [tiles, sel, aug]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="absolute inset-4 md:inset-10 rounded-xl border border-white/10 bg-[#111] p-4 overflow-auto shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Crop Preview</h2>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        {/* 25 grid */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {thumbs.map((src, i) => (
            <button
              key={i}
              className={`relative aspect-square rounded-md overflow-hidden border ${i===sel ? "border-emerald-400" : "border-white/10"}`}
              onClick={() => setSel(i)}
              title={`Tile ${i+1}`}
            >
              {src ? <img src={src} alt={`tile-${i+1}`} className="w-full h-full object-cover" /> : (
                <div className="w-full h-full grid place-items-center text-xs opacity-60">empty</div>
              )}
              <div className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60">{i+1}</div>
            </button>
          ))}
        </div>

        {/* aug section */}
        <div className="mb-2 text-sm opacity-80">
          Selected tile: <strong>{sel+1}</strong> • Unboard {(aug.unboardPct*100).toFixed(0)}% • Jitter {(aug.jitterFrac*100).toFixed(1)}% • Multi-crop {aug.multiCrop}×
        </div>
        <div className="flex flex-wrap gap-2">
          {augThumbs.length ? augThumbs.map((src, i) => (
            <img key={i} src={src} alt={`aug-${i}`} className="w-32 h-32 rounded-md border border-white/10 object-cover" />
          )) : <div className="text-sm opacity-60">No aug crops</div>}
        </div>
      </div>
    </div>
  );
}
