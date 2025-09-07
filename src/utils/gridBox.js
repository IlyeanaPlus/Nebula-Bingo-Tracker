// src/utils/gridBox.js
// Simple 5x5 grid via draggable/resizable "grid box" overlay.
// Lines: 6 vertical + 6 horizontal (cell boundaries). Hotkey: Alt+Shift+B

(function () {
  // -----------------------------
  // Helpers & State
  // -----------------------------
  const Z_PANEL = 999999;
  const Z_OVERLAY = 999998;

  let overlayCanvas = null;      // <canvas> on top of target image
  let targetImg = null;          // chosen <img>
  let panel = null;              // control panel
  let box = null;                // draggable/resizable rect
  let handles = [];              // 8 resize handles
  let showLines = true;

  // Box state in overlay/canvas pixel space (NOT natural image px)
  const boxState = { x: 40, y: 40, w: 300, h: 300 };

  // Drag/resize temp
  let dragging = false, resizing = false;
  let dragOffsetX = 0, dragOffsetY = 0;
  let resizeDir = ""; // e.g., "n", "ne", "e", "se", "s", "sw", "w", "nw"

  // -----------------------------
  // Style
  // -----------------------------
  function ensureStyles() {
    if (document.getElementById("nbt-gridbox-style")) return;
    const s = document.createElement("style");
    s.id = "nbt-gridbox-style";
    s.textContent = `
#nbt-gridbox-panel {
  position: fixed; right: 16px; top: 16px; z-index: ${Z_PANEL};
  width: 300px; background:#1e1f22; color:#eee;
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
#nbt-gridbox-panel .hint { margin-top:6px; opacity:.8; font-size:11px; }

#nbt-gridbox-overlay {
  position:absolute; left:0; top:0; z-index:${Z_OVERLAY}; pointer-events:none;
}

#nbt-gridbox-rect {
  position:absolute; border:2px solid #0f8; box-shadow:0 0 0 1px rgba(0,0,0,.4);
  pointer-events:auto; cursor:move; border-radius:6px;
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
      button("Open File", onOpenFile),
      button("Pick Image", beginPickImage),
      button("Snap to Image", onSnapToImage)
    );
    const r2 = row(
      button("Show Lines", toggleLines),
      button("Report", onReport),
      button("Save Fractions", onSaveFractions)
    );
    const r3 = row(
      button("Close", () => p.remove())
    );

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Drag & drop an image anywhere while this panel is open.";

    p.append(r1, r2, r3, hint);
    return p;
  }

  function row(...children) {
    const d = document.createElement("div");
    d.className = "row";
    d.append(...children);
    return d;
  }

  function button(label, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  // -----------------------------
  // Image selection
  // -----------------------------
  let picking = false;
  function beginPickImage() {
    picking = !picking;
    document.body.style.cursor = picking ? "crosshair" : "";
  }

  function createHiddenFileInput(accept = "image/*") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.position = "fixed";
    input.style.left = "-10000px";
    input.style.top = "-10000px";
    document.body.appendChild(input);
    return input;
  }

  let objectURL = null;
  async function onOpenFile() {
    const input = createHiddenFileInput("image/*");
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) {
        const img = await fileToImg(f);
        styleFloatingImage(img);
        document.body.appendChild(img);
        setTargetImage(img);
      }
      input.remove();
    };
    input.click();
  }

  function fileToImg(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      if (objectURL) URL.revokeObjectURL(objectURL);
      objectURL = URL.createObjectURL(file);
      img.src = objectURL;
    });
  }

  function styleFloatingImage(img) {
    img.style.maxWidth = "min(80vw, 1200px)";
    img.style.maxHeight = "80vh";
    img.style.position = "fixed";
    img.style.right = "16px";
    img.style.bottom = "16px";
    img.style.zIndex = Z_OVERLAY - 1;
    img.style.boxShadow = "0 8px 24px rgba(0,0,0,.6)";
    img.style.borderRadius = "8px";
  }

  // Click to pick existing <img>
  function onDocClick(ev) {
    if (!picking) return;
    if (ev.target && ev.target.tagName === "IMG") {
      setTargetImage(ev.target);
      picking = false;
      document.body.style.cursor = "";
      ev.preventDefault(); ev.stopPropagation();
    }
  }

  // Drag & drop
  function attachDropHandlers() {
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("dragleave", onDragLeave, true);
    document.addEventListener("drop", onDrop, true);
  }
  function detachDropHandlers() {
    document.removeEventListener("dragover", onDragOver, true);
    document.removeEventListener("dragleave", onDragLeave, true);
    document.removeEventListener("drop", onDrop, true);
  }
  function onDragOver(e) { e.preventDefault(); e.stopPropagation(); document.body.classList.add("nbt-drop-active"); }
  function onDragLeave(e) { e.preventDefault(); e.stopPropagation(); document.body.classList.remove("nbt-drop-active"); }
  async function onDrop(e) {
    e.preventDefault(); e.stopPropagation();
    document.body.classList.remove("nbt-drop-active");
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith("image/")) {
      const img = await fileToImg(f);
      styleFloatingImage(img);
      document.body.appendChild(img);
      setTargetImage(img);
    }
  }

  // -----------------------------
  // Target image + overlay canvas
  // -----------------------------
  function setTargetImage(imgEl) {
    targetImg = imgEl;
    ensureOverlay();
    positionOverlay();
    drawLines(); // draw using current box state
  }

  function ensureOverlay() {
    if (!overlayCanvas) {
      overlayCanvas = document.createElement("canvas");
      overlayCanvas.id = "nbt-gridbox-overlay";
      document.body.appendChild(overlayCanvas);

      // Create the draggable box element on top of canvas
      box = document.createElement("div");
      box.id = "nbt-gridbox-rect";
      document.body.appendChild(box);

      // Make box interactive
      box.addEventListener("mousedown", onBoxMouseDown);

      // Create 8 handles
      ["n","ne","e","se","s","sw","w","nw"].forEach(dir => {
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
  }

  function positionOverlay() {
    if (!overlayCanvas || !targetImg) return;
    const r = targetImg.getBoundingClientRect();
    overlayCanvas.width = Math.max(1, Math.floor(r.width));
    overlayCanvas.height = Math.max(1, Math.floor(r.height));
    overlayCanvas.style.left = `${Math.floor(r.left + window.scrollX)}px`;
    overlayCanvas.style.top = `${Math.floor(r.top + window.scrollY)}px`;

    // Constrain box to overlay bounds if it fell off
    clampBox();
    placeBox();
    if (showLines) drawLines(); else clearCanvas();
  }

  // -----------------------------
  // Box drag/resize
  // -----------------------------
  function onBoxMouseDown(e) {
    if (e.target.classList.contains("nbt-handle")) return; // handled elsewhere
    dragging = true;
    dragOffsetX = e.clientX - (boxState.x + overlayCanvas.getBoundingClientRect().left);
    dragOffsetY = e.clientY - (boxState.y + overlayCanvas.getBoundingClientRect().top);
    e.preventDefault();
  }

  function onHandleMouseDown(e) {
    resizing = true;
    resizeDir = e.target.dataset.dir || "";
    e.stopPropagation();
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!overlayCanvas) return;
    const ov = overlayCanvas.getBoundingClientRect();

    if (dragging) {
      boxState.x = Math.round(e.clientX - ov.left - dragOffsetX);
      boxState.y = Math.round(e.clientY - ov.top - dragOffsetY);
      clampBox();
      placeBox();
      if (showLines) drawLines(); else clearCanvas();
    } else if (resizing) {
      const minSize = 20;
      const right = boxState.x + boxState.w;
      const bottom = boxState.y + boxState.h;
      const mx = e.clientX - ov.left;
      const my = e.clientY - ov.top;

      // Adjust based on handle
      if (resizeDir.includes("w")) {
        const nx = Math.min(mx, right - minSize);
        boxState.w = right - nx; boxState.x = nx;
      }
      if (resizeDir.includes("e")) {
        boxState.w = Math.max(minSize, mx - boxState.x);
      }
      if (resizeDir.includes("n")) {
        const ny = Math.min(my, bottom - minSize);
        boxState.h = bottom - ny; boxState.y = ny;
      }
      if (resizeDir.includes("s")) {
        boxState.h = Math.max(minSize, my - boxState.y);
      }
      clampBox();
      placeBox();
      if (showLines) drawLines(); else clearCanvas();
    }
  }

  function onMouseUp() {
    dragging = false;
    resizing = false;
  }

  function clampBox() {
    if (!overlayCanvas) return;
    const W = overlayCanvas.width, H = overlayCanvas.height;
    if (boxState.x < 0) boxState.x = 0;
    if (boxState.y < 0) boxState.y = 0;
    if (boxState.x + boxState.w > W) boxState.w = W - boxState.x;
    if (boxState.y + boxState.h > H) boxState.h = H - boxState.y;
  }

  function placeBox() {
    if (!box || !overlayCanvas) return;
    const ov = overlayCanvas.getBoundingClientRect();
    box.style.left = `${ov.left + window.scrollX + boxState.x}px`;
    box.style.top = `${ov.top + window.scrollY + boxState.y}px`;
    box.style.width = `${boxState.w}px`;
    box.style.height = `${boxState.h}px`;
  }

  // -----------------------------
  // Drawing lines
  // -----------------------------
  function clearCanvas() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  function drawLines() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext("2d");
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!showLines) return;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,255,140,0.95)";
    ctx.setLineDash([6,3]);

    // 6 verticals & 6 horizontals inside box bounds
    const { x, y, w, h } = boxState;

    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const vx = Math.round(x + (w * i) / 5) + 0.5;
      ctx.moveTo(vx, y);
      ctx.lineTo(vx, y + h);
    }
    for (let j = 0; j <= 5; j++) {
      const hy = Math.round(y + (h * j) / 5) + 0.5;
      ctx.moveTo(x, hy);
      ctx.lineTo(x + w, hy);
    }
    ctx.stroke();
  }

  // -----------------------------
  // Actions
  // -----------------------------
  function onSnapToImage() {
    if (!targetImg || !overlayCanvas) return;
    // Box fills full image area
    boxState.x = 0; boxState.y = 0;
    boxState.w = overlayCanvas.width; boxState.h = overlayCanvas.height;
    placeBox(); drawLines();
  }

  function toggleLines(e) {
    showLines = !showLines;
    e.currentTarget.textContent = showLines ? "Hide Lines" : "Show Lines";
    if (showLines) drawLines(); else clearCanvas();
  }

  function onSaveFractions() {
    const report = computeReport();
    if (!report) return;
    const { xf, yf } = report;
    localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf }));
    console.info("[GridBox] Saved fractions to localStorage (nbt.gridFractions).", { xf, yf });
  }

  function onReport() {
    const report = computeReport();
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    copyToClipboard(json);
    console.info("[GridBox] Report copied to clipboard:\n", json);
    alert("Grid report copied to clipboard (also logged to console).");
  }

  function computeReport() {
    if (!targetImg || !overlayCanvas) return null;
    const r = targetImg.getBoundingClientRect();
    const natW = targetImg.naturalWidth || targetImg.width;
    const natH = targetImg.naturalHeight || targetImg.height;
    const scaleX = natW / r.width;
    const scaleY = natH / r.height;

    // Box edges in *display* px → map to natural image px
    const left = boxState.x * scaleX;
    const top = boxState.y * scaleY;
    const right = (boxState.x + boxState.w) * scaleX;
    const bottom = (boxState.y + boxState.h) * scaleY;

    // Build 6 x coords and 6 y coords (integers) in image px
    const xs = [], ys = [];
    for (let i = 0; i <= 5; i++) xs.push(Math.round(left + (right - left) * i / 5));
    for (let j = 0; j <= 5; j++) ys.push(Math.round(top + (bottom - top) * j / 5));

    // Fractions [0..1] relative to natural size (for persistence)
    const xf = xs.map(x => x / natW);
    const yf = ys.map(y => y / natH);

    const cellW = (right - left) / 5;
    const cellH = (bottom - top) / 5;

    return {
      image: {
        naturalWidth: natW,
        naturalHeight: natH
      },
      box_pixels: {
        left: Math.round(left),
        top: Math.round(top),
        right: Math.round(right),
        bottom: Math.round(bottom),
        width: Math.round(right - left),
        height: Math.round(bottom - top)
      },
      lines_pixels: { xs, ys },
      lines_fractions: { xf, yf },
      cell_avg: {
        width_px: Math.round(cellW),
        height_px: Math.round(cellH)
      }
    };
  }

  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      ta.remove();
    }
  }

  // -----------------------------
  // Public API
  // -----------------------------
  function openGridBox() {
    if (panel && document.body.contains(panel)) { panel.remove(); detachDropHandlers(); }
    panel = buildPanel();
    document.body.appendChild(panel);
    document.addEventListener("click", onDocClick, { capture: true });
    attachDropHandlers();
  }

  function ensureHotkey() {
    if (window.__nbtGridBoxHotkey) return;
    window.__nbtGridBoxHotkey = true;
    window.addEventListener("keydown", (e) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        openGridBox();
      }
    });
  }

  // Expose API if needed by app code:
  window.NBT = window.NBT || {};
  window.NBT.openGridBox = openGridBox;

  ensureStyles();
  ensureHotkey();
})();
