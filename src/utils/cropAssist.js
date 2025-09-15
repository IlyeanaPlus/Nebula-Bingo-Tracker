// src/utils/cropAssist.js
// Edge-aware auto-trim for screenshots with grid/tile bleed.
// Finds the dominant border color and trims a small ring where pixels match it.

export function estimateUnboardPx(canvas, {
  maxPx = 14,          // hard cap (≈6% of a 224 crop)
  sampleRing = 2,      // how many outer rows/cols to sample for bg estimation
  tol = 14,            // per-channel tolerance (0..255) for "bg-like" pixels
  targetBgFrac = 0.20, // stop when bg-like pixels in the current ring drop below this
} = {}) {
  if (!canvas) return { top:0, right:0, bottom:0, left:0, bg:[0,0,0] };
  const w = canvas.width|0, h = canvas.height|0;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0,0,w,h).data;

  // helper to read r,g,b at (x,y)
  const rgb = (x,y) => {
    const i = ((y*w)+x)*4;
    return [img[i], img[i+1], img[i+2]];
  };

  // 1) estimate bg color using a 1-2px ring around all sides
  const samples = [];
  const sr = Math.max(1, sampleRing|0);
  for (let y = 0; y < sr; y++) for (let x=0; x<w; x++) samples.push(rgb(x,y));             // top
  for (let y = h-sr; y < h; y++) for (let x=0; x<w; x++) samples.push(rgb(x,y));          // bottom
  for (let x = 0; x < sr; x++) for (let y=0; y<h; y++) samples.push(rgb(x,y));            // left
  for (let x = w-sr; x < w; x++) for (let y=0; y<h; y++) samples.push(rgb(x,y));          // right

  const mean = [0,0,0];
  for (const [r,g,b] of samples) { mean[0]+=r; mean[1]+=g; mean[2]+=b; }
  mean[0]/=samples.length; mean[1]/=samples.length; mean[2]/=samples.length;

  // 2) grow inward symmetrically until bg-like frac drops below target
  const within = (c, m) => Math.abs(c-m) <= tol;
  const isBg = (r,g,b) => within(r,mean[0]) && within(g,mean[1]) && within(b,mean[2]);

  let t=0,bm=0,l=0,rh=0;
  const cap = Math.min(maxPx, (Math.min(w,h)/2)|0);

  const fracBgRow = (yy, x0, x1) => {
    let bg=0, n=0;
    for (let x=x0;x<x1;x++){ const [r,g,b]=rgb(x,yy); if (isBg(r,g,b)) bg++; n++; }
    return n? bg/n : 1;
  };
  const fracBgCol = (xx, y0, y1) => {
    let bg=0, n=0;
    for (let y=y0;y<y1;y++){ const [r,g,b]=rgb(xx,y); if (isBg(r,g,b)) bg++; n++; }
    return n? bg/n : 1;
  };

  while (t<cap || bm<cap || l<cap || rh<cap) {
    let moved=false;
    // top
    if (t<cap) {
      const f = fracBgRow(t, l, w-rh);
      if (f >= targetBgFrac) { t++; moved=true; } 
    }
    // bottom
    if (bm<cap) {
      const f = fracBgRow(h-1-bm, l, w-rh);
      if (f >= targetBgFrac) { bm++; moved=true; }
    }
    // left
    if (l<cap) {
      const f = fracBgCol(l, t, h-bm);
      if (f >= targetBgFrac) { l++; moved=true; }
    }
    // right
    if (rh<cap) {
      const f = fracBgCol(w-1-rh, t, h-bm);
      if (f >= targetBgFrac) { rh++; moved=true; }
    }
    if (!moved) break;
  }

  // keep symmetric-ish crop; don’t invert
  t = Math.min(t, h-2); bm = Math.min(bm, h-2);
  l = Math.min(l, w-2); rh = Math.min(rh, w-2);
  const rect = { top:t, right:rh, bottom:bm, left:l, bg: mean.map(v=>Math.round(v)) };
  return rect;
}

export function autoUnboard(canvas, {
  maxPct = 0.06, // cap relative to min(w,h)
  params,        // forward to estimateUnboardPx
} = {}) {
  if (!canvas) return { canvas, rect:{top:0,right:0,bottom:0,left:0,bg:[0,0,0]}, px:0, pct:0 };
  const s = Math.min(canvas.width, canvas.height);
  const maxPx = Math.max(1, Math.floor(s * maxPct));
  const rect = estimateUnboardPx(canvas, { ...params, maxPx });

  const x = rect.left, y = rect.top;
  const w = Math.max(1, canvas.width  - rect.left - rect.right);
  const h = Math.max(1, canvas.height - rect.top  - rect.bottom);

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const octx = out.getContext("2d");
  octx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

  return { canvas: out, rect, px: Math.max(rect.left, rect.right, rect.top, rect.bottom), pct: (Math.max(rect.left, rect.right, rect.top, rect.bottom) / s) };
}

// Visual debug: draw a red rectangle around the retained region on top of the original element.
export function previewTrimOnElement(imgOrCanvas, rect, { ms = 900 } = {}) {
  const el = imgOrCanvas;
  if (!el || !el.getBoundingClientRect) return;
  const bb = el.getBoundingClientRect();
  const border = document.createElement("div");
  border.style.position = "fixed";
  border.style.left = `${bb.left + rect.left}px`;
  border.style.top = `${bb.top + rect.top}px`;
  border.style.width = `${Math.max(1, bb.width - rect.left - rect.right)}px`;
  border.style.height= `${Math.max(1, bb.height - rect.top  - rect.bottom)}px`;
  border.style.border = "2px solid rgba(255,99,99,0.95)";
  border.style.borderRadius = "6px";
  border.style.pointerEvents = "none";
  border.style.zIndex = 9999;
  document.body.appendChild(border);
  setTimeout(()=>border.remove(), ms);
}
