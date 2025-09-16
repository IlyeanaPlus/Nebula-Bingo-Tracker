// src/utils/gridRefine.js
// Opens the canonical GridTunerModal and returns normalized fractions.

export async function refineGridFractions(imageCanvas, initial) {
  if (!imageCanvas) throw new Error("gridRefine: no canvas provided");

  if (!window.__NBT_GRID?.open) {
    await import("../components/GridTunerModal.jsx");
    await new Promise((r) => setTimeout(r, 0)); // let it mount + register
  }
  const open = window.__NBT_GRID?.open;
  if (typeof open !== "function") {
    throw new Error("GridTunerModal did not register window.__NBT_GRID.open");
  }

  // Open and translate {frac} → {x,y,size,cols,rows,square}
  const { frac } = await open({ canvas: imageCanvas, frac: initial });
  const x = frac.left, y = frac.top;
  const size = Math.max(frac.right - frac.left, frac.bottom - frac.top);
  return { x, y, size, cols: 5, rows: 5, square: true };
}

export default refineGridFractions;
