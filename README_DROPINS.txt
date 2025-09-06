README_DROPINS.txt

This bundle adjusts matching & layout:

1) src/components/BingoCard.jsx
   - MAX_SCORE relaxed to 0.34
   - Weights favor grayscale (gray:0.7, rgb:0.3)
   - Adds "No match" placeholder sprite

2) src/utils/image.js
   - Increases PAD_FRAC to 0.08 (trim outer edges)
   - Adds CELL_INNER_PAD = 0.12 to crop inside each cell (avoid grid lines)
   - Provides helpers for grayscale + RGB hashing and a 64-bit Hamming

3) src/styles/bingo.css
   - Forces sidebar to be a dedicated full column via CSS grid
