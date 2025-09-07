// src/App.jsx — robust Fill wiring with UI-safe guards
import React, { useEffect, useState } from "react";

// Core UI components (ensure these paths/files exist)
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";

// Styles
import "./styles/bingo.css";

// Grid tuner (Alt+Shift+B) and image utils
import "./utils/gridBox.js";
import * as ImageUtils from "./utils/image.js"; // import as namespace to guard existence

// Simple error boundary to avoid blank screen on render errors
function ErrorBoundary({ children }) {
  const [err, setErr] = useState(null);
  return (
    <React.Suspense fallback={null}>
      <Inner onError={setErr}>{children}</Inner>
      {err && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, padding: 12,
          background: "#3a0000", color: "#fff", zIndex: 1000002
        }}>
          UI recovered from an error: {String(err)}
        </div>
      )}
    </React.Suspense>
  );
}
function Inner({ children, onError }) {
  try { return children; } catch (e) { onError?.(e); return null; }
}

export default function App() {
  const [crops, setCrops] = useState(null);

  useEffect(() => {
    // Guard the utils so a missing export doesn't crash the app
    const fileToImage = ImageUtils?.fileToImage;
    const cropCells   = ImageUtils?.cropCells;

    if (typeof fileToImage !== "function" || typeof cropCells !== "function") {
      console.error(
        "[App] image utils missing. Expected named exports { fileToImage, cropCells } from ./utils/image.js"
      );
    }

    // Ensure namespace
    window.NBT = window.NBT || {};
    window.NBT.setCrops = setCrops;

    // === GridBox → Fill hook (Option A) ===
    window.NBT.onGridBoxFill = async (file, { xf, yf }) => {
      try {
        if (typeof fileToImage !== "function" || typeof cropCells !== "function") {
          alert("Image utils not available. Check exports in ./utils/image.js");
          return;
        }

        // 1) File → HTMLImageElement
        const img = await fileToImage(file);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        // 2) Fractions → absolute line coords
        const xs = Array.isArray(xf) ? xf.map((f) => Math.round(f * w)) : [];
        const ys = Array.isArray(yf) ? yf.map((f) => Math.round(f * h)) : [];

        if (xs.length !== 6 || ys.length !== 6) {
          console.warn("[App] Expected 6 grid lines each for xs/ys; got", { xs: xs.length, ys: ys.length });
        }

        // 3) Crop into 25 dataURLs using existing util
        const tiles = cropCells(img, { xs, ys, w, h });

        // 4) Store + broadcast
        setCrops(tiles);
        window.dispatchEvent(
          new CustomEvent("nbt:cropsReady", { detail: { crops: tiles, xs, ys, w, h } })
        );

        // 5) Persist tuned fractions
        localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf }));

        // 6) Optional downstream hook
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

  useEffect(() => {
    const onReady = (e) => setCrops(e.detail.crops);
    window.addEventListener("nbt:cropsReady", onReady);
    return () => window.removeEventListener("nbt:cropsReady", onReady);
  }, []);

  return (
    <ErrorBoundary>
      <div className="App">
        <Header />
        <Sidebar />
        <main className="main-content">
          <BingoCard />
        </main>

        {/* Debug badge for crops (remove anytime) */}
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
    </ErrorBoundary>
  );
}
