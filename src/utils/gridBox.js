// src/utils/gridBox.js
// Centered reference image + square (1:1) draggable/resizable 5x5 grid overlay.
// Buttons: Open File, Pick Image, Snap to Image, Show/Hide Lines, Report, Save Fractions, Fill, Remove Image, Close.
// Events emitted:
//   - "nbt:gridFractionsUpdated"  -> { xf, yf }
//   - "nbt:gridBoxFill"           -> { file, xf, yf }
// Optional callback your app can define:
//   - window.NBT.onGridBoxFill(file, { xf, yf })
// Hotkey: Alt+Shift+B

(function () {
  // -----------------------------
  // Z-order & global state
  // -----------------------------
  const Z_PANEL = 999999;
  const Z_OVERLAY = 999998;

  let panel = null;              // tuner panel
  let overlayCanvas = null;      // grid drawing canvas
  let box = null;                // draggable/resizable HTML box
  let handles = [];
  let targetImg = null;          // chosen <img>
  let backdrop = null;
  let objectURL = null;

  let showLines = true;

  // Box state in overlay px (NOT natural image px)
  const boxState = { x: 40, y: 40, w: 300, h: 300 };

  // Drag/resize
  let dragging = false, resizing = false;
  let dragOffsetX = 0, dragOffsetY = 0;
  let resizeDir = "";

  // Square lock
  const LOCK_SQUARE = true;
  let resizeAnchorX = 0, resizeAnchorY = 0;

  // Listener flags
  let globalListeners = false;
  let pagePickActive = false;

  // -----------------------------
  // Styles
  // -----------------------------
  function ensureStyles() {
    if (document.getElementById("nbt-gridbox-style")) return;
    const s = document.createElement("style");
    s.id = "nbt-gridbox-style";
    s.textContent = `
#nbt-gridbox-panel {
  position: fixed; right: 16px; top: 16px; z-index: ${Z_PANEL};
  width: 328px; background:#1e1f22; color:#eee;
  border:1px solid #333; border-radius:10px; padding:12px;
  font: 12px/1.4 system-ui, sans-serif; box-shadow:0 8px 24px rgba(0,0,0,.5);
}
#nbt-gridbox-panel h3 { margin:0 0 8px; font-size:13px; }
#nbt-gridbox-panel .row { display:flex; gap:8px; margin-top:8px; }
#nbt-gridbox-panel button {
  flex:1; background:#2a2a2a; color:#fff; border:1px solid #444;
  border-radius:8px; padding:6px 8px; cursor:pointer;
}
#nbt-gridbox-panel button:hover { background:#333; }
#nbt-gridbox-panel .hint { margin-top: 6px; opacity:.8; font-size:11px; }

#nbt-gridbox-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  z-index: ${Z_OVERLAY - 2};
}

#nbt-gridbox-overlay {
  position:absolute; left:0; top:0; z-index:${Z_OVERLAY}; pointer-events:none;
}

#nbt-gridbox-rect {
  position:absolute; border:2px solid #0f8; box-shadow:0 0 0 1px rgba(0,0,0,.4);
  pointer-events:auto; cursor:move; border-radius:6px; background:transparent;
  z-index: ${Z_PANEL}; /* ensure drag box is above everything */
}
.nbt-handle {
  position:absolute; width:12px; height:12px; background:#0f8; border:1px solid #063;
  border-radius:3px; pointer-events:auto;
}
.nbt-handle.n { top:-7px; left:calc(50% - 6px); cursor:n-resize; }
.nbt-handle.s { bottom:-7px; left:calc(50% - 6px); cursor:s-resize; }
.nbt-handle.e { right:-7px; top:calc(50% - 6px); cursor:e-resize; }
.nbt-handle.w { left:-7px; top:calc(50% - 6px); cursor:w-resize; }
.nbt-handle.nw { top:-7px; left:-7px; cursor:nw-resize; }
.nbt-handle.ne { top:-7px; right:-7px; cursor:ne-resize; }
.nbt-handle.sw { bottom:-7px; left:-7px; cursor:sw-resize; }
.nbt-handle.se { bottom:-7px; right:-7px; cursor:se-resize; }

body.nbt-drop-active { outline:2px dashed #0f8; outline-offset:-2px; }
`;
    document.head.appendChild(s);
  }

  // -----------------------------
  // Panel
  // -----------------------------
  function buildPanel() {
    ensureStyles();
    const p = document.createElement("div");
    p.id = "nbt-gridbox-panel";

    const h = document.createElement("h3");
    h.textContent = "Grid Box (Alt+Shift+B)";
    p.appendChild(h);

    const r1 = row(
      btn("Open File", onOpenFile),
      btn("Pick Image", togglePickFromPage),
      btn("Snap to Image", onSnapToImage)
    );
    const r2 = row(
      btn("Show Lines", toggleLines),
      btn("Report", onReport),
      btn("Save Fractions", onSaveFractions)
    );
    const r3 = row(
      btn("Fill", onFill),
      btn("Remove Image", removePickedImage),
      btn("Close", closeEverything) // removes ALL (panel, overlay, image, listeners)
    );

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Drag & drop an image anywhere while this panel is open.";

    p.append(r1, r2, r3, hint);
    return p;
  }
  const row = (...kids) => { const d = document.createElement("div"); d.className="row"; d.append(...kids); return d; };
  const btn = (label, onClick) => { const b = document.createElement("button"); b.textContent=label; b.onclick=onClick; return b; };

  // -----------------------------
  // Image creation / selection
  // -----------------------------
  function stylePickedImage(img) {
    img.style.position = "fixed";
    img.style.left = "50%";
    img.style.top = "50%";
    img.style.transform = "translate(-50%, -50%)";
    img.style.maxWidth = "min(90vw, 1200px)";
    img.style.maxHeight = "90vh";
    img.style.zIndex = (Z_OVERLAY - 1);
    img.style.boxShadow = "0 12px 32px rgba(0,0,0,.65)";
    img.style.borderRadius = "10px";
    img.style.background = "#111";
  }
  function ensureBackdrop() {
    if (backdrop && document.body.contains(backdrop)) return backdrop;
    const d = document.createElement("div");
    d.id = "nbt-gridbox-backdrop";
    d.onclick = () => {}; // image should not disappear
    document.body.appendChild(d);
    backdrop = d;
    return d;
  }
  function createHiddenFileInput(accept="image/*") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.position="fixed"; input.style.left="-10000px"; input.style.top="-10000px";
    document.body.appendChild(input);
    return input;
  }
  function fileToImg(file) {
    return new Promise((resolve,reject)=>{
      const img = new Image();
      img.onload=()=>resolve(img);
      img.onerror=reject;
      if (objectURL) URL.revokeObjectURL(objectURL);
      objectURL = URL.createObjectURL(file);
      img.src = objectURL;
    });
  }
  async function onOpenFile() {
    const input = createHiddenFileInput("image/*");
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) {
        const img = await fileToImg(f);
        stylePickedImage(img);
        img.id = "nbt-picked-image";
        ensureBackdrop();
        document.body.appendChild(img);
        setTargetImage(img);
      }
      input.remove();
    };
    input.click();
  }
  function removePickedImage() {
    const el1 = document.getElementById("nbt-picked-image");
    const el2 = document.getElementById("nbt-dropped-image");
    if (el1 && el1.parentNode) el1.parentNode.removeChild(el1);
    if (el2 && el2.parentNode) el2.parentNode.removeChild(el2);
    if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = null; }
    setOverlayTarget(null);
    removeBackdrop();
  }
  function removeBackdrop() {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    backdrop = null;
  }

  // Pick existing <img> on page
  function togglePickFromPage() {
    pagePickActive = !pagePickActive;
    document.body.style.cursor = pagePickActive ? "crosshair" : "";
  }
  function onDocClick(ev) {
    if (!pagePickActive) return;
    if (ev.target && ev.target.tagName === "IMG") {
      ensureBackdrop();
      setTargetImage(ev.target);
      pagePickActive = false;
      document.body.style.cursor = "";
      ev.preventDefault(); ev.stopPropagation();
    }
  }

  // Drag & drop support
  function attachGlobalListeners() {
    if (globalListeners) return;
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("dragleave", onDragLeave, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("click", onDocClick, { capture:true });
    globalListeners = true;
  }
  function detachGlobalListeners() {
    if (!globalListeners) return;
    document.removeEventListener("dragover", onDragOver, true);
    document.removeEventListener("dragleave", onDragLeave, true);
    document.removeEventListener("drop", onDrop, true);
    document.removeEventListener("click", onDocClick, { capture:true });
    globalListeners = false;
  }
  function onDragOver(e){ e.preventDefault(); e.stopPropagation(); document.body.classList.add("nbt-drop-active"); }
  function onDragLeave(e){ e.preventDefault(); e.stopPropagation(); document.body.classList.remove("nbt-drop-active"); }
  async function onDrop(e){
    e.preventDefault(); e.stopPropagation();
    document.body.classList.remove("nbt-drop-active");
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith("image/")) {
      const img = await fileToImg(f);
      stylePickedImage(img);
      img.id = "nbt-dropped-image";
      ensureBackdrop();
      document.body.appendChild(img);
      setTargetImage(img);
    }
  }

  // -----------------------------
  // Overlay (canvas + box)
  // -----------------------------
  function ensureOverlay() {
    if (overlayCanvas) return;

    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "nbt-gridbox-overlay";
    overlayCanvas.style.pointerEvents = "none";
    document.body.appendChild(overlayCanvas);

    box = document.createElement("div");
    box.id = "nbt-gridbox-rect";
    box.style.zIndex = String(Z_PANEL); // belt & suspenders
    box.addEventListener("mousedown", onBoxMouseDown);
    document.body.appendChild(box);

    ["n","ne","e","se","s","sw","w","nw"].forEach(dir=>{
      const h = document.createElement("div");
      h.className = `nbt-handle ${dir}`;
      h.dataset.dir = dir;
      h.addEventListener("mousedown", onHandleMouseDown);
      box.appendChild(h);
      handles.push(h);
    });

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", positionOverlay);
    window.addEventListener("scroll", positionOverlay, true);
  }
  function destroyOverlay() {
    if (box) { box.remove(); box = null; handles = []; }
    if (overlayCanvas) { overlayCanvas.remove(); overlayCanvas = null; }
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("resize", positionOverlay);
    window.removeEventListener("scroll", positionOverlay, true);
  }
  function setTargetImage(imgEl) {
    targetImg = imgEl;
    ensureOverlay();
    positionOverlay();
    // Fit centered square initially
    if (overlayCanvas && imgEl) {
      const W = overlayCanvas.width, H = overlayCanvas.height;
      const size = Math.min(W, H);
      boxState.w = size; boxState.h = size;
      boxState.x = Math.round((W - size)/2);
      boxState.y = Math.round((H - size)/2);
      placeBox();
    }
    drawLines();
  }
  function setOverlayTarget(imgEl) {
    targetImg = imgEl;
    positionOverlay();
    if (!imgEl) clearCanvas();
  }
  function positionOverlay() {
    if (!overlayCanvas || !targetImg) return;
    const r = targetImg.getBoundingClientRect();
    overlayCanvas.width = Math.max(1, Math.floor(r.width));
    overlayCanvas.height = Math.max(1, Math.floor(r.height));
    overlayCanvas.style.left = `${Math.floor(r.left + window.scrollX)}px`;
    overlayCanvas.style.top = `${Math.floor(r.top + window.scrollY)}px`;
    clampBox(); placeBox();
    if (showLines) drawLines(); else clearCanvas();
  }

  // -----------------------------
  // Drag/resize (square lock)
  // -----------------------------
  function onBoxMouseDown(e) {
    if (e.target.classList.contains("nbt-handle")) return;
    dragging = true;
    const ov = overlayCanvas.getBoundingClientRect();
    dragOffsetX = e.clientX - (ov.left + boxState.x);
    dragOffsetY = e.clientY - (ov.top + boxState.y);
    e.preventDefault();
  }
  function onHandleMouseDown(e) {
    resizing = true;
    resizeDir = e.target.dataset.dir || "";
    const right = boxState.x + boxState.w;
    const bottom = boxState.y + boxState.h;
    resizeAnchorX = resizeDir.includes("w") ? right : boxState.x;
    resizeAnchorY = resizeDir.includes("n") ? bottom : boxState.y;
    e.stopPropagation(); e.preventDefault();
  }
  function onMouseMove(e) {
    if (!overlayCanvas) return;
    const ov = overlayCanvas.getBoundingClientRect();

    if (dragging) {
      boxState.x = Math.round(e.clientX - ov.left - dragOffsetX);
      boxState.y = Math.round(e.clientY - ov.top - dragOffsetY);
      clampBox(); placeBox();
      if (showLines) drawLines(); else clearCanvas();
      return;
    }

    if (!resizing) return;

    const minSize = 20;
    const mx = e.clientX - ov.left;
    const my = e.clientY - ov.top;

    let x = boxState.x, y = boxState.y, w = boxState.w, h = boxState.h;
    const right = x + w, bottom = y + h;

    if (resizeDir.includes("w")) { x = Math.min(mx, right - minSize); w = right - x; }
    if (resizeDir.includes("e")) { w = Math.max(minSize, mx - x); }
    if (resizeDir.includes("n")) { y = Math.min(my, bottom - minSize); h = bottom - y; }
    if (resizeDir.includes("s")) { h = Math.max(minSize, my - y); }

    if (LOCK_SQUARE) {
      const size = Math.max(minSize, Math.min(w, h));
      const anchorIsLeft = (resizeAnchorX === x);
      const anchorIsTop  = (resizeAnchorY === y);
      x = anchorIsLeft ? resizeAnchorX : (resizeAnchorX - size);
      y = anchorIsTop  ? resizeAnchorY : (resizeAnchorY - size);
      w = size; h = size;
    }

    const W = overlayCanvas.width, H = overlayCanvas.height;
    if (x < 0) { const dx = -x; x = 0; if (LOCK_SQUARE){w-=dx;h-=dx;} else {w-=dx;} }
    if (y < 0) { const dy = -y; y = 0; if (LOCK_SQUARE){w-=dy;h-=dy;} else {h-=dy;} }
    if (x + w > W) { const dx = x + w - W; if (LOCK_SQUARE){ x -= dx; } else { w -= dx; } }
    if (y + h > H) { const dy = y + h - H; if (LOCK_SQUARE){ y -= dy; } else { h -= dy; } }

    boxState.x = Math.round(x);
    boxState.y = Math.round(y);
    boxState.w = Math.max(minSize, Math.round(w));
    boxState.h = Math.max(minSize, Math.round(h));

    placeBox();
    if (showLines) drawLines(); else clearCanvas();
  }
  function onMouseUp(){ dragging = false; resizing = false; }
  function clampBox() {
    const W = overlayCanvas.width, H = overlayCanvas.height;
    if (boxState.x < 0) boxState.x = 0;
    if (boxState.y < 0) boxState.y = 0;
    if (boxState.x + boxState.w > W) boxState.w = W - boxState.x;
    if (boxState.y + boxState.h > H) boxState.h = H - boxState.y;
  }
  function placeBox() {
    const ov = overlayCanvas.getBoundingClientRect();
    box.style.left = `${ov.left + window.scrollX + boxState.x}px`;
    box.style.top  = `${ov.top  + window.scrollY + boxState.y}px`;
    box.style.width  = `${boxState.w}px`;
    box.style.height = `${boxState.h}px`;
  }

  // -----------------------------
  // Draw grid
  // -----------------------------
  function clearCanvas() {
    const ctx = overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }
  function drawLines() {
    const ctx = overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!showLines) return;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,255,140,0.95)";
    ctx.setLineDash([6,3]);
    const { x, y, w, h } = boxState;
    ctx.beginPath();
    for (let i=0;i<=5;i++){ const vx=Math.round(x+(w*i)/5)+0.5; ctx.moveTo(vx,y);ctx.lineTo(vx,y+h); }
    for (let j=0;j<=5;j++){ const hy=Math.round(y+(h*j)/5)+0.5; ctx.moveTo(x,hy);ctx.lineTo(x+w,hy); }
    ctx.stroke();
  }

  // -----------------------------
  // Actions
  // -----------------------------
  function onSnapToImage() {
    if (!targetImg || !overlayCanvas) return;
    const W = overlayCanvas.width, H = overlayCanvas.height;
    const size = Math.min(W, H);
    boxState.w = size; boxState.h = size;
    boxState.x = Math.round((W - size)/2);
    boxState.y = Math.round((H - size)/2);
    placeBox(); drawLines();
  }
  function toggleLines(e){
    showLines = !showLines;
    e.currentTarget.textContent = showLines ? "Hide Lines" : "Show Lines";
    if (showLines) drawLines(); else clearCanvas();
  }

  function computeReport() {
    if (!targetImg || !overlayCanvas) return null;
    const r = targetImg.getBoundingClientRect();
    const natW = targetImg.naturalWidth || targetImg.width;
    const natH = targetImg.naturalHeight || targetImg.height;
    const scaleX = natW / r.width;
    const scaleY = natH / r.height;

    const left = boxState.x * scaleX;
    const top = boxState.y * scaleY;
    const right = (boxState.x + boxState.w) * scaleX;
    const bottom = (boxState.y + boxState.h) * scaleY;

    const xs=[], ys=[];
    for (let i=0;i<=5;i++) xs.push(Math.round(left + (right-left)*i/5));
    for (let j=0;j<=5;j++) ys.push(Math.round(top  + (bottom-top)*j/5));

    const xf = xs.map(x=>x/natW);
    const yf = ys.map(y=>y/natH);

    const cellW = (right-left)/5, cellH = (bottom-top)/5;

    return {
      image: { naturalWidth:natW, naturalHeight:natH },
      box_pixels: {
        left: Math.round(left), top: Math.round(top),
        right: Math.round(right), bottom: Math.round(bottom),
        width: Math.round(right-left), height: Math.round(bottom-top)
      },
      lines_pixels: { xs, ys },
      lines_fractions: { xf, yf },
      cell_avg: { width_px: Math.round(cellW), height_px: Math.round(cellH) }
    };
  }

  function saveFractions(xf, yf) {
    localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf }));
    try { window.dispatchEvent(new CustomEvent("nbt:gridFractionsUpdated", { detail:{ xf, yf } })); } catch {}
  }

  function copyToClipboard(text) {
    try { navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove();
    }
  }

  function onReport() {
    const report = computeReport(); if (!report) return;
    const { xf, yf } = report.lines_fractions;
    saveFractions(xf, yf);
    const json = JSON.stringify(report, null, 2);
    copyToClipboard(json);
    console.info("[GridBox] Report (and fractions) saved + copied:\n", json);
    alert("Grid report copied to clipboard and fractions saved.");
  }

  function onSaveFractions() {
    const report = computeReport(); if (!report) return;
    const { xf, yf } = report.lines_fractions;
    saveFractions(xf, yf);
    console.info("[GridBox] Saved fractions to localStorage (nbt.gridFractions).", { xf, yf });
  }

  // Convert an <img> to a File (PNG) for pipelines that expect a file upload
  async function imageElToFile(imgEl, name="gridbox.png") {
    const c = document.createElement("canvas");
    const w = imgEl.naturalWidth || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(imgEl, 0, 0, w, h);
    return new Promise((resolve)=> c.toBlob(b=>resolve(new File([b], name, { type:"image/png" })), "image/png"));
  }

  async function onFill() {
    if (!targetImg) { alert("Choose an image first."); return; }
    const report = computeReport(); if (!report) return;
    const { xf, yf } = report.lines_fractions;

    // Persist fractions for the app
    saveFractions(xf, yf);

    // Create a File from the image for pipelines that expect an image file
    const file = await imageElToFile(targetImg, "gridbox.png");

    // Preferred: app-defined hook
    if (window.NBT && typeof window.NBT.onGridBoxFill === "function") {
      try {
        await window.NBT.onGridBoxFill(file, { xf, yf });
      } catch (e) { console.error("[GridBox] onGridBoxFill failed:", e); }
    } else {
      // Generic event fallback
      try {
        window.dispatchEvent(new CustomEvent("nbt:gridBoxFill", { detail: { file, xf, yf } }));
      } catch {}
      console.info("[GridBox] Emitted 'nbt:gridBoxFill' with file and fractions.");
    }
  }

  // -----------------------------
  // Close (remove EVERYTHING)
  // -----------------------------
  function closeEverything() {
    // panel
    if (panel) { panel.remove(); panel = null; }
    // overlay + box
    destroyOverlay();
    // image + backdrop
    removePickedImage();
    // listeners
    detachGlobalListeners();
    pagePickActive = false;
    document.body.style.cursor = "";
  }

  // -----------------------------
  // Public entry points / hotkey
  // -----------------------------
  function openPanel() {
    if (panel && document.body.contains(panel)) panel.remove();
    panel = buildPanel();
    document.body.appendChild(panel);
    attachGlobalListeners(); // ensure page listeners attached
  }

  function ensureHotkey() {
    if (window.__nbtGridBoxHotkey) return;
    window.__nbtGridBoxHotkey = true;
    window.addEventListener("keydown", (e)=>{
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        // Toggle: if panel exists -> close everything, else open
        if (panel && document.body.contains(panel)) closeEverything();
        else openPanel();
      }
    });
  }

  // -----------------------------
  // Utilities used above
  // -----------------------------
  function clearCanvas() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext("2d");
    ctx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
  }

  // Expose minimal API if you want to open/close programmatically
  window.NBT = window.NBT || {};
  window.NBT.openGridBox = openPanel;
  window.NBT.closeGridBox = closeEverything;

  window.addEventListener("load", ensureStyles);
  ensureStyles();
  ensureHotkey();
})();
