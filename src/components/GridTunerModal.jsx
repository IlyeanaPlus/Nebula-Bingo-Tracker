// src/components/GridTunerModal.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

const LAYOUT = "square";
const GRID_GREEN = "rgb(0,255,0)";

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const toRect = (f, W, H) => ({
  l: (f.left ?? 0) * W,
  t: (f.top ?? 0) * H,
  w: (f.width ?? 1) * W,
  h: (f.height ?? 1) * H,
});
const toFrac = (r, W, H) => ({
  left: clamp(r.l / W, 0, 1),
  top: clamp(r.t / H, 0, 1),
  width: clamp(r.w / W, 0, 1),
  height: clamp(r.h / H, 0, 1),
});

export default function GridTunerModal({
  image,
  imageSrc,
  initialFractions,
  fractions,
  onChange,
  onConfirm,
  onCancel,
}) {
  const src = imageSrc ?? image?.src ?? null;

  // fractions (image-space)
  const [frac, setFrac] = useState(
    initialFractions ?? fractions ?? { left: 0, top: 0, width: 1, height: 1 }
  );
  useEffect(() => {
    onChange?.(frac);
  }, [frac, onChange]);

  // image natural size
  const [imgSize, setImgSize] = useState({ w: 1000, h: 1000 });
  useEffect(() => {
    if (!src) return;
    const i = new Image();
    i.onload = () =>
      setImgSize({ w: i.naturalWidth || 1000, h: i.naturalHeight || 1000 });
    i.src = src;
  }, [src]);

  // zoom & fit
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => {
      const { w, h } = imgSize;
      if (!w || !h) return;
      if (LAYOUT === "square") {
        const side = Math.min(window.innerWidth, window.innerHeight) * 0.92;
        setZoom(clamp(Math.min(side / w, side / h), 0.1, 4));
      } else {
        const vw = window.innerWidth * 0.96;
        const vh = window.innerHeight * 0.92;
        setZoom(clamp(Math.min(vw / w, vh / h), 0.1, 4));
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [imgSize]);

  // center small / scroll-center large
  const viewportRef = useRef(null);
  const [pad, setPad] = useState({ x: 0, y: 0 });
  const scaled = useMemo(
    () => ({
      w: Math.max(1, imgSize.w * zoom),
      h: Math.max(1, imgSize.h * zoom),
    }),
    [imgSize, zoom]
  );
  const recenter = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth,
      vh = vp.clientHeight;
    const padX = Math.max((vw - scaled.w) / 2, 0);
    const padY = Math.max((vh - scaled.h) / 2, 0);
    setPad({ x: padX, y: padY });
    vp.scrollLeft = scaled.w > vw ? (scaled.w - vw) / 2 : 0;
    vp.scrollTop = scaled.h > vh ? (scaled.h - vh) / 2 : 0;
  }, [scaled.w, scaled.h]);
  useEffect(() => {
    recenter();
  }, [recenter]);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(recenter);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [recenter]);

  // stage (image space, scaled by CSS)
  const innerScaledWrapper = useMemo(
    () => ({
      position: "relative",
      width: `${scaled.w}px`,
      height: `${scaled.h}px`,
    }),
    [scaled]
  );
  const stageRef = useRef(null);
  const stageStyle = useMemo(
    () => ({
      position: "absolute",
      top: 0,
      left: 0,
      width: imgSize.w,
      height: imgSize.h,
      transform: `scale(${zoom})`,
      transformOrigin: "top left",
    }),
    [imgSize, zoom]
  );
  const stroke = 2 / Math.max(zoom, 1e-6);

  // current rect (force 1:1)
  const rect = useMemo(() => {
    const r0 = toRect(frac, imgSize.w, imgSize.h);
    const s = Math.min(r0.w, r0.h);
    return { l: r0.l, t: r0.t, w: s, h: s };
  }, [frac, imgSize]);

  // pointer helpers
  const clientToImage = useCallback(
    (clientX, clientY) => {
      const stage = stageRef.current;
      if (!stage) return { x: 0, y: 0 };
      const r = stage.getBoundingClientRect();
      const x = (clientX - r.left) / zoom;
      const y = (clientY - r.top) / zoom;
      return { x: clamp(x, 0, imgSize.w), y: clamp(y, 0, imgSize.h) };
    },
    [zoom, imgSize]
  );

  // drag state
  const [drag, setDrag] = useState(null);
  const endDrag = useCallback(() => setDrag(null), []);
  const onMovePointer = useCallback(
    (e) => {
      if (!drag) return;
      const p = clientToImage(e.clientX, e.clientY);
      const { mode, start, r0 } = drag;

      if (mode === "move") {
        const l = clamp(r0.l + (p.x - start.x), 0, imgSize.w - r0.w);
        const t = clamp(r0.t + (p.y - start.y), 0, imgSize.h - r0.h);
        setFrac(toFrac({ l, t, w: r0.w, h: r0.h }, imgSize.w, imgSize.h));
        return;
      }

      // corner-resize (1:1) using opposite anchor
      let ax, ay;
      if (mode === "nw") {
        ax = r0.l + r0.w;
        ay = r0.t + r0.h;
      }
      if (mode === "ne") {
        ax = r0.l;
        ay = r0.t + r0.h;
      }
      if (mode === "sw") {
        ax = r0.l + r0.w;
        ay = r0.t;
      }
      if (mode === "se") {
        ax = r0.l;
        ay = r0.t;
      }

      const dx = p.x - ax,
        dy = p.y - ay;
      let s = Math.max(Math.abs(dx), Math.abs(dy));
      if (s < 1) s = 1;

      let nl = Math.min(ax, ax + Math.sign(dx || 1) * s);
      let nt = Math.min(ay, ay + Math.sign(dy || 1) * s);
      if (nl < 0) {
        s += nl;
        nl = 0;
      }
      if (nt < 0) {
        s += nt;
        nt = 0;
      }
      if (nl + s > imgSize.w) s = imgSize.w - nl;
      if (nt + s > imgSize.h) s = imgSize.h - nt;
      s = Math.max(1, s);

      setFrac(toFrac({ l: nl, t: nt, w: s, h: s }, imgSize.w, imgSize.h));
    },
    [drag, clientToImage, imgSize]
  );

  const startResize = useCallback(
    (mode) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = clientToImage(e.clientX, e.clientY);
      setDrag({ mode, start: p, r0: { ...rect } });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [clientToImage, rect]
  );

  // move from crop center
  const startMoveFromCrosshair = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = clientToImage(e.clientX, e.clientY);
      setDrag({ mode: "move", start: p, r0: { ...rect } });
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [clientToImage, rect]
  );

  // handle size: 1/32 of a grid cell
  const cell = (rect.w || 1) / 5;
  const handleSide = Math.max(1, cell / 16);

  // crop center
  const cx = rect.l + rect.w / 2;
  const cy = rect.t + rect.h / 2;
  const crossLen = Math.max(4 / stroke, cell * 0.15);
  const crossHit = Math.max(10 / stroke, cell * 0.35);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: "#111",
          color: "#eee",
          padding: 12,
          borderRadius: 12,
          width: "92vmin",
          height: "92vmin",
          maxWidth: "1400px",
          maxHeight: "900px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              const ev = new Event("resize");
              window.dispatchEvent(ev);
              recenter();
            }}
            className="btn"
          >
            Fit
          </button>
          <span style={{ fontSize: 12, opacity: 0.8, width: 100 }}>
            Zoom: {(zoom * 100) | 0}%
          </span>
          <input
            type="range"
            min={0.1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <div style={{ flex: 1 }} />
          <button onClick={onCancel} className="btn">
            Cancel
          </button>
          <button onClick={() => onConfirm?.(frac)} className="btn btn--primary">
            Confirm
          </button>
        </div>

        {/* Stage */}
        <div
          ref={viewportRef}
          style={{
            position: "relative",
            flex: "1 1 auto",
            minHeight: 0,
            overflow: "auto",
            background: "#000",
            borderRadius: 8,
            padding: `${pad.y}px ${pad.x}px`,
          }}
        >
          <div style={innerScaledWrapper}>
            <div ref={stageRef} style={stageStyle}>
              {src && (
                <img src={src} alt="" draggable={false} style={{ display: "block" }} />
              )}

              {/* Grid INSIDE crop rect */}
              <svg
                width={imgSize.w}
                height={imgSize.h}
                onPointerMove={onMovePointer}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
              >
                {/* 5×5 grid drawn inside the crop rect */}
                <g style={{ pointerEvents: "none" }}>
                  {Array.from({ length: 6 }).map((_, i) => {
                    const x = rect.l + (rect.w * i) / 5;
                    const y = rect.t + (rect.h * i) / 5;
                    return (
                      <React.Fragment key={i}>
                        <line
                          x1={x}
                          y1={rect.t}
                          x2={x}
                          y2={rect.t + rect.h}
                          stroke={GRID_GREEN}
                          strokeWidth={stroke}
                        />
                        <line
                          x1={rect.l}
                          y1={y}
                          x2={rect.l + rect.w}
                          y2={y}
                          stroke={GRID_GREEN}
                          strokeWidth={stroke}
                        />
                      </React.Fragment>
                    );
                  })}
                </g>

                {/* Corner handles */}
                {[
                  ["nw", rect.l, rect.t, "nwse-resize"],
                  ["ne", rect.l + rect.w, rect.t, "nesw-resize"],
                  ["sw", rect.l, rect.t + rect.h, "nesw-resize"],
                  ["se", rect.l + rect.w, rect.t + rect.h, "nwse-resize"],
                ].map(([mode, hx, hy, cursor]) => (
                  <rect
                    key={mode}
                    x={hx - handleSide / 2}
                    y={hy - handleSide / 2}
                    width={handleSide}
                    height={handleSide}
                    fill={GRID_GREEN}
                    stroke={GRID_GREEN}
                    strokeWidth={stroke}
                    style={{ cursor, pointerEvents: "auto" }}
                    onPointerDown={startResize(mode)}
                  />
                ))}

                {/* Move handle: crosshair at crop center */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={crossHit}
                  fill="transparent"
                  style={{ cursor: "move" }}
                  onPointerDown={startMoveFromCrosshair}
                />
                <line
                  x1={cx - crossLen}
                  y1={cy}
                  x2={cx + crossLen}
                  y2={cy}
                  stroke={GRID_GREEN}
                  strokeWidth={stroke}
                />
                <line
                  x1={cx}
                  y1={cy - crossLen}
                  x2={cx}
                  y2={cy + crossLen}
                  stroke={GRID_GREEN}
                  strokeWidth={stroke}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={Math.max(1 / stroke, handleSide * 0.25)}
                  fill={GRID_GREEN}
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
