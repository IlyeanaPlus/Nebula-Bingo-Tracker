Nebula Bingo Tracker — Clean Checkpoint (v2) DROP-INS

Included files (relative to repo root):
- src/utils/match.js
- src/utils/image.js      (wrappers & helpers; keep your existing computeAhash64/computeDhash64 implementations)
- src/components/BingoCard.jsx
- src/components/Header.jsx
- src/App.jsx
- public/sw.js

What changed:
- Sprites displayed in cells (uses entry.src/image/path/url)
- Drag & drop support for Fill; file picker retained
- Progress overlay during Fill (0–25)
- RGB-aware weighted matching (grayscale + per-channel) via MAX_SCORE threshold
- Service Worker: base-aware, network-first for drive_cache.json, cache-first for others

Notes:
- Do NOT modify your existing drive_cache.json format. This package does not include a manifest.
- Ensure your entry point registers the Service Worker (typically in main.jsx):
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const base = import.meta?.env?.BASE_URL || '/';
        navigator.serviceWorker.register(`${base}sw.js`).catch(console.error);
      });
    }

Tuning:
- In BingoCard.jsx, adjust MAX_SCORE (0.18–0.28 typical). Lower = stricter.
- To bias matching, edit DEFAULT_WEIGHTS in src/utils/match.js (gray vs rgb).
- PAD_FRAC in src/utils/image.js trims edges before 5×5 slicing.
