// src/App.jsx — Option A drop-in
import React, { useEffect } from "react";
import BingoCard from "./components/BingoCard.jsx";   // keep your existing app render
import "./styles/bingo.css";

// Side-effect import: opens the centered reference-image grid box (Alt+Shift+B)
import "./utils/gridBox.js";

// Use your image utils to avoid re-implementing cropping
import { fileToImage, cropCells } from "./utils/image.js";

function App() {
  useEffect(() => {
    // Define the Option A hook the grid box will call
    window.NBT = window.NBT || {};
    window.NBT.onGridBoxFill = async (file, { xf, yf }) => {
      try {
        // 1) File -> HTMLImageElement
        const img = await fileToImage(file);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        // 2) Fractions -> absolute line coords
        const xs = xf.map(f => Math.round(f * w));
        const ys = yf.map(f => Math.round(f * h));

        // 3) Crop into 25 tiles using your existing utility
        const crops = cropCells(img, { xs, ys, w, h }); // returns 25 dataURLs

        // 4) Broadcast for any component to consume
        window.dispatchEvent(
          new CustomEvent("nbt:cropsReady", { detail: { crops, xs, ys, w, h } })
        );

        // 5) Optional: if you expose a global setter somewhere (e.g., in BingoCard)
        if (typeof window.NBT.setCrops === "function") {
          window.NBT.setCrops(crops);
        }

        // Persist fractions for consistency
        localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf }));

        console.info("[App] GridBox Fill complete — 25 crops generated.");
      } catch (err) {
        console.error("[App] onGridBoxFill failed:", err);
        alert("Failed to fill from grid box. See console for details.");
      }
    };

    // Cleanup on unmount (hot reload safety)
    return () => {
      if (window.NBT) delete window.NBT.onGridBoxFill;
    };
  }, []);

  return (
    <div className="App">
      <BingoCard />
    </div>
  );
}

export default App;
