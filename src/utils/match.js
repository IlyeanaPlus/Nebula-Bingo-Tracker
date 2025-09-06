// Weighted matching across grayscale + RGB hash distances
// Normalizes Hamming distances to [0,1], then combines with weights.

export const DEFAULT_WEIGHTS = {
  gray: 0.6,   // ahash + dhashX + dhashY combined
  rgb: 0.4     // average of R/G/B (each: a,dX,dY)
};

// For 64-bit aHash and 64-bit dHash-equivalents
const MAX_BITS = 64;

function norm(d) {
  return d / MAX_BITS;
}

export function scoreGray(distA, distDX, distDY) {
  return (norm(distA) + norm(distDX) + norm(distDY)) / 3;
}

export function scoreRGB(rgbDistances /* {R:{a,dx,dy}, G:{...}, B:{...}} */) {
  const chans = ['R','G','B'];
  let sum = 0, count = 0;
  for (const c of chans) {
    const v = rgbDistances[c];
    if (!v) { sum += 1; count += 1; continue; }
    const { a, dx, dy } = v;
    sum += (norm(a ?? 64) + (norm(dx ?? 64)) + (norm(dy ?? 64))) / 3;
    count += 1;
  }
  return count ? (sum / count) : 1;
}

// Final score in [0,1], lower is better. Use MAX_SCORE as acceptance threshold.
export function weightedScore({ gray, rgb }, weights = DEFAULT_WEIGHTS) {
  return (weights.gray * gray) + (weights.rgb * rgb);
}
