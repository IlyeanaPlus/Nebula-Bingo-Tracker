// src/App.jsx — robust GridBox Fill wiring that won’t blank the UI
import React, { useEffect, useState } from "react";

// Core UI components (paths must exist in your repo)
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";

// Styles
import "./styles/bingo.css";

// Side-effect: enables the grid tuner (Alt+Shift+B)
import "./utils/gridBox.js";

export default function App() {
  const [crops, setCrops] = useState(null);

  useEffect(() => {
    let isMounted = true;

    // Small safe shims used only if your big image.js doesn’t provide these
    const shim_fileToImage = (file) =>
      new Promise((resolve, reject) => {
        try {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
          };
          img.src = url;
        } catch (e) {
          reject(e);
        }
      });

    const shim_cropCells = (img, { xs, ys }) => {
      if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== 6 || ys.length !== 6) {
        throw new Error("cropCells: expected xs/ys length 6");
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const out = [];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const x0 = xs[c], x1 = xs[c + 1];
          const y0 = ys[r], y1 = ys[r + 1];
          const cw = Math.max(1, Math.round(x1 - x0));
          const ch = Math.max(1, Math.round(y1 - y0));
          canvas.width = cw;
          canvas.height = ch;
          ctx.clearRect(0, 0, cw, ch);
          ctx.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch);
          out.push(canvas.toDataURL("image/png"));
        }
      }
      return out;
    };

    // Resolve the utils safely even if image.js is large or has different export names
    const resolveImageUtils = async () => {
      try {
        const mod = await import("./utils/image.js"); // lazy import; won’t crash initial render

        // Try the common names first, then reasonable alternates, then default
        const fileToImage =
          mod.fileToImage ||
          mod.fileToImg ||
          mod.imageFromFile ||
          (mod.default && (mod.default.fileToImage || mod.default.fileToImg || mod.default.imageFromFile)) ||
          shim_fileToImage;

        const cropCells =
          mod.cropCells ||
          mod.cropGrid ||
          mod.cropIntoCells ||
          (mod.default && (mod.default.cropCells || mod.default.cropGrid || mod.default.cropIntoCells)) ||
          shim_cropCells;

        return { fileToImage, cropCells };
      } catch (err) {
        console.error("[App] Failed to import ./utils/image.js:", err);
        // Fall back to shims so the UI stays up and Fill still works
        return { fileToImage: shim_fileToImage, cropCells: shim_cropCells };
      }
    };

    (async () => {
      const { fileToImage, cropCells } = await resolveImageUtils();

      // Expose NBT namespace & a setter in case other modules want to push crops
      window.NBT = window.NBT || {};
      window.NBT.setCrops = (tiles) => { if (isMounted) setCrops(tiles); };

      // === GridBox → Fill hook (Option A) ===
      window.NBT.onGridBoxFill = async (file, { xf, yf }) => {
        try {
          // 1) File → HTMLImageElement
          const img = await fileToImage(file);
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;

          // 2) Fractions → absolute pixel lines
          const xs = Array.isArray(xf) ? xf.map((f) => Math.round(f * w)) : [];
          const ys = Array.isArray(yf) ? yf.map((f) => Math.round(f * h)) : [];

          if (xs.length !== 6 || ys.length !== 6) {
            console.warn("[App] Expected 6 grid lines each for xs/ys; got", { xs: xs.length, ys: ys.length });
          }

          // 3) Crop into 25 tiles
          const tiles = cropCells(img, { xs, ys, w, h });

          // 4) Store + broadcast
          if (isMounted) setCrops(tiles);
          window.dispatchEvent(
            new CustomEvent("nbt:cropsReady", { detail: { crops: tiles, xs, ys, w, h } })
          );

          // 5) Persist tuned fractions
          try {
            localStorage.setItem("nbt.gridFractions", JSON.stringify({ xf, yf }));
          } catch {}

          // 6) Optional downstream consumer
          if (typeof window.NBT.consumeCrops === "function") {
            window.NBT.consumeCrops(tiles, { xs, ys, w, h, xf, yf });
          }

          console.info("[App] GridBox Fill complete — 25 crops ready.");
        } catch (err) {
          console.error("[App] onGridBoxFill failed:", err);
          alert("Fill failed (see console). Your UI remains active.");
        }
      };
    })();

    return () => {
      isMounted = false;
      if (window.NBT?.onGridBoxFill) delete window.NBT.onGridBoxFill;
      if (window.NBT?.setCrops) delete window.NBT.setCrops;
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
  );
}
