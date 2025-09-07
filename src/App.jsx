// src/App.jsx — Option A integration with Header + Sidebar preserved
import React, { useEffect, useState } from "react";

// Core UI components
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";

// Styles
import "./styles/bingo.css";

// Grid tuner (Alt+Shift+B) and image utils
import "./utils/gridBox.js";
import { fileToImage, cropCells } from "./utils/image.js";

export default function App() {
  const [crops, setCrops] = useState(null);

  useEffect(() => {
    // Ensure global namespace
    window.NBT = window.NBT || {};
    // Expose a setter so other modules (or the overlay) can drop crops in
    window.NBT.setCrops = setCrops;

    // === GridBox → Fill hook (Option A) ===
    window.NBT.onGridBoxFill = async (file, { xf, yf }) => {
      try {
        // 1) File → HTMLImageElement
        const img = await fileToImage(file);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        // 2) Fractions → absolute line coords
        const xs = xf.map((f) => Math.round(f * w));
        const ys = yf.map((f) => Math.round(f * h));

        // 3) Crop into 25 dataURLs using existing util
        const tiles = cropCells(img, { xs, ys, w, h });

        // 4) Store locally for debug/preview and broadcast
        setCrops(tiles);
        window.dispatchEvent(
          new CustomEvent("nbt:cropsReady", { detail: { crops: tiles, xs, ys, w, h } })
        );

        // 5) Persist tuned fractions for reuse
        localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf }));

        // 6) (Optional) If any component exposed a consumer, send it along
        if (typeof window.NBT.consumeCrops === "function") {
          window.NBT.consumeCrops(tiles, { xs, ys, w, h, xf, yf });
        }

        console.info("[App] GridBox Fill complete — 25 crops ready.");
      } catch (err) {
        console.error("[App] onGridBoxFill failed:", err);
        alert("Failed to fill from grid tuner. See console for details.");
      }
    };

    // Cleanup on HMR/unmount
    return () => {
      if (window.NBT?.onGridBoxFill) delete window.NBT.onGridBoxFill;
      if (window.NBT?.setCrops === setCrops) delete window.NBT.setCrops;
    };
  }, []);

  // Optional: allow other parts of the app to dispatch crops
  useEffect(() => {
    const onReady = (e) => setCrops(e.detail.crops);
    window.addEventListener("nbt:cropsReady", onReady);
    return () => window.removeEventListener("nbt:cropsReady", onReady);
  }, []);

  return (
    <div className="App">
      <Header />
      <Sidebar />
      <main className="main-content">
        <BingoCard />
      </main>

      {/* Debug badge for crops (safe to remove anytime) */}
      {Array.isArray(crops) && crops.length === 25 && (
        <div
          style={{
            position: "fixed",
            left: 16,
            bottom: 16,
            zIndex: 1000000,
            background: "#111a",
            padding: 8,
            borderRadius: 8,
          }}
        >
          <div style={{ color: "#0f8", fontSize: 12, marginBottom: 4 }}>
            {crops.length} crops ready
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 24px)",
              gap: 4,
              maxWidth: 160,
            }}
          >
            {crops.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`cell-${i}`}
                width={24}
                height={24}
                style={{ objectFit: "cover" }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
