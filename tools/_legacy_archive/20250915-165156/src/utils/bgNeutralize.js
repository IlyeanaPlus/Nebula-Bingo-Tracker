// Heuristic background neutralizer for pixel-art crops.
// Detects the dominant border color and replaces similar pixels with mid-gray.
// Designed to reduce mismatch when the tile background is green.

export function neutralizeBackgroundCanvas(srcCanvas, {
  target = [139,139,139],      // gray
  borderWidth = 3,             // sample this many pixels from edges
  tolerance = 28,              // color distance to treat as "background"
  feather = 1                  // soften the mask edges
} = {}) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const ctx = srcCanvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, w, h);

  // 1) Estimate background from border ring (mode by k-means-ish average)
  let sr=0, sg=0, sb=0, n=0;
  function take(x,y){
    const i = 4*(y*w+x);
    sr += data[i]; sg += data[i+1]; sb += data[i+2]; n++;
  }
  for (let x=0; x<w; x++) for (let y=0; y<borderWidth; y++) { take(x,y); take(x,h-1-y); }
  for (let y=0; y<h; y++) for (let x=0; x<borderWidth; x++) { take(x,y); take(w-1-x,y); }
  const br = sr/n|0, bg = sg/n|0, bb = sb/n|0;

  // 2) Replace near-background pixels with target gray
  const out = new ImageData(w, h);
  const od = out.data;
  for (let y=0; y<h; y++) {
    for (let x=0; x<w; x++) {
      const i = 4*(y*w+x);
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      const dr = r-br, dg = g-bg, db = b-bb;
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      const m = dist < tolerance ? 1 : 0; // 1 = background
      // feather by rechecking a slightly larger tolerance
      let fm = m;
      if (feather > 0 && m === 0) {
        if (dist < tolerance + 10) fm = 0.5;
      }
      const tr = target[0], tg = target[1], tb = target[2];
      od[i]   = fm ? (fm===1?tr:Math.round(tr*fm + r*(1-fm))) : r;
      od[i+1] = fm ? (fm===1?tg:Math.round(tg*fm + g*(1-fm))) : g;
      od[i+2] = fm ? (fm===1?tb:Math.round(tb*fm + b*(1-fm))) : b;
      od[i+3] = a;
    }
  }
  const dst = document.createElement("canvas");
  dst.width = w; dst.height = h;
  dst.getContext("2d").putImageData(out, 0, 0);
  return dst;
}
