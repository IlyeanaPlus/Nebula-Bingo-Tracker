// src/App.jsx — Option A integration with Header + Sidebar preserved
import React, { useEffect, useState } from "react";

// Core UI components
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";

// Styles
import "./styles/bingo.css";

// Side-effect overlay (Alt+Shift+B to open the tuner)
import "./utils/gridBox.js";

// Use your existing image utilities
import { fileToImage, cropCells } from "./utils/image.js";

export default function App() {
  const [crops, setCrops] = useState(null);

  useEffect(() => {
    // Expose a setter so other modules (or the overlay) can drop crops in
    window.NBT = window.NBT || {};
    window.NBT.setCrops = setCrops;

    // Main hook called by GridBox → we generate 25 crops and broadcast them
    window.NBT.onGridBoxFill = async (file, { xf, yf }) => {
      const img = await fileToImage(file);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      const xs = xf.map(f => Math.round(f * w));
      const ys = yf.map(f => Math.round(f * h));

      const tiles = cropCells(img, { xs, ys, w, h });

      setCrops(tiles);
      window.dispatchEvent(
        new CustomEvent("nbt:cropsReady", { detail: { crops: tiles, xs, ys, w, h } })
      );

      localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf }));
      console.info("[App] GridBox Fill complete — 25 crops ready.");
    };

    return () => {
      if (window.NBT?.onGridBoxFill) delete window.NBT.onGridBoxFill;
      if (window.NBT?.setCrops === setCrops) delete window.NBT.setCrops;
    };
  }, []);

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

      {/* Debug badge for crops */}
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
