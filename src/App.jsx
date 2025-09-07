// src/App.jsx — resilient Fill wiring that won’t blank the UI (no static image.js import)
import React, { useEffect, useState } from "react";

// Core UI
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";

// Styles
import "./styles/bingo.css";

// Side-effect overlay (Alt+Shift+B)
import "./utils/gridBox.js";

export default function App() {
  const [crops, setCrops] = useState(null);

  useEffect(() => {
    let isMounted = true;

    // tiny shims — only used if image.js can't load or exports differ
    const shim_fileToImage = (file) =>
      new Promise((resolve, reject) => {
        try {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
          img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
          img.src = url;
        } catch (e) { reject(e); }
      });

    const shim_cropCells = (img, { xs, ys }) => {
      if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== 6 || ys.length !== 6) {
        throw new Error("cropCells: expected xs/ys length 6");
      }
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      const out = [];
      for (let r = 0; r < 5; r++) {
        for (let q = 0; q < 5; q++) {
          const x0 = xs[q], x1 = xs[q + 1];
          const y0 = ys[r], y1 = ys[r + 1];
          const w = Math.max(1, Math.round(x1 - x0));
          const h = Math.max(1, Math.round(y1 - y0));
          c.width = w; c.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
          out.push(c.toDataURL("image/png"));
        }
      }
      return out;
    };

    // lazy-load utils so a big/complex image.js can’t crash initial render
    const loadUtils = async () => {
      try {
        const mod = await import("./utils/image.js");
        const fileToImage =
          mod.fileToImage ||
          mod.fileToImg ||
          (mod.default && (mod.default.fileToImage || mod.default.fileToImg)) ||
          shim_fileToImage;

        const cropCells =
          mod.cropCells ||
          mod.cropGrid ||
          (mod.default && (mod.default.cropCells || mod.default.cropGrid)) ||
          shim_cropCells;

        return { fileToImage, cropCells };
      } catch (e) {
        console.warn("[App] dynamic import of ./utils/image.js failed; using shims.", e);
        return { fileToImage: shim_fileToImage, cropCells: shim_cropCells };
      }
    };

    (async () => {
      const { fileToImage, cropCells } = await loadUtils();

      window.NBT = window.NBT || {};
      window.NBT.setCrops = (tiles) => { if (isMounted) setCrops(tiles); };

      // === GridBox → Fill hook ===
      window.NBT.onGridBoxFill = async (file, { xf, yf }) => {
        try {
          const img = await fileToImage(file);
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;

          const xs = (Array.isArray(xf) ? xf : [0,.2,.4,.6,.8,1]).map(f => Math.round(f * w));
          const ys = (Array.isArray(yf) ? yf : [0,.2,.4,.6,.8,1]).map(f => Math.round(f * h));

          const tiles = cropCells(img, { xs, ys, w, h });

          if (isMounted) setCrops(tiles);
          window.dispatchEvent(new CustomEvent("nbt:cropsReady", { detail: { crops: tiles, xs, ys, w, h } }));
          try { localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf })); } catch {}

          if (typeof window.NBT.consumeCrops === "function") {
            window.NBT.consumeCrops(tiles, { xs, ys, w, h, xf, yf });
          }
          console.info("[App] Fill complete — 25 crops.");
        } catch (err) {
          console.error("[App] onGridBoxFill failed:", err);
          alert("Fill failed — see console for details.");
        }
      };
    })();

    return () => {
      isMounted = false;
      if (window.NBT?.onGridBoxFill) delete window.NBT.onGridBoxFill;
      if (window.NBT?.setCrops) delete window.NBT.setCrops;
    };
  }, []);

  // Optional listener so other modules can push crops
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
        <div style={{
          position: "fixed", left: 16, bottom: 16, zIndex: 1000000,
          background: "#111a", padding: 8, borderRadius: 8
        }}>
          <div style={{ color: "#0f8", fontSize: 12, marginBottom: 4 }}>
            {crops.length} crops ready
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 24px)", gap: 4, maxWidth: 160 }}>
            {crops.map((src, i) => (
              <img key={i} src={src} alt={`cell-${i}`} width={24} height={24} style={{ objectFit: "cover" }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
