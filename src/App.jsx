// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";
import "./styles/bingo.css";
import "./utils/gridBox.js";

const LS_KEYS = {
  CARDS: "nbt.cards.v1",
  CURRENT: "nbt.currentIndex.v1",
};

const makeBlankCard = (title = "New Card") => ({
  title,
  saved: false,
  cells: Array.from({ length: 25 }, () => ({
    name: "",
    sprite: null,
    complete: false,
  })),
});

export default function App() {
  const [cards, setCards] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.CARDS);
      return raw ? JSON.parse(raw) : [makeBlankCard()];
    } catch {
      return [makeBlankCard()];
    }
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    const n = Number(localStorage.getItem(LS_KEYS.CURRENT) ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.min(n, 0)) : 0;
  });

  const [manifest, setManifest] = useState([]);
  const [spritesProgress, setSpritesProgress] = useState({ loaded: 0, total: 0, done: false });

  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.CARDS, JSON.stringify(cards)); } catch {}
  }, [cards]);
  useEffect(() => {
    try { localStorage.setItem(LS_KEYS.CURRENT, String(currentIndex)); } catch {}
  }, [currentIndex]);

  const currentCard = useMemo(
    () => (cards[currentIndex] ? cards[currentIndex] : undefined),
    [cards, currentIndex]
  );

  // ---- Get Sprites from public/drive_cache.json, resolve URLs, preload into cache ----
  async function handleGetSprites() {
    const normalize = (raw) => {
      if (!raw) return [];
      if (Array.isArray(raw) && raw.length && raw[0]?.name && raw[0]?.src) return raw;
      const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
      return items.map((it) => {
        const name =
          it.name || it.title || it.filename || it.fileName || it.id || "";
        const src =
          it.src ||
          it.url ||
          it.downloadUrl ||
          it.webContentLink ||
          it.webViewLink ||
          it.thumbnailLink ||
          it.path ||
          it.relativePath ||
          "";
        return name && src ? { name, src } : null;
      }).filter(Boolean);
    };

    const preload = (urls, onTick) =>
      Promise.all(
        urls.map(
          (u) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = img.onerror = () => { onTick(); resolve(); };
              img.decoding = "async";
              img.referrerPolicy = "no-referrer";
              img.crossOrigin = "anonymous"; // harmless if same-origin
              img.src = u;
            })
        )
      );

    try {
      const res = await fetch("./drive_cache.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // Normalize + absolutize URLs
      const mf0 = normalize(json);
      if (!mf0.length) {
        console.warn("[GetSprites] drive_cache.json shape:", json);
        alert("drive_cache.json loaded, but no sprite entries were recognized.");
        return;
      }
      const base = new URL(location.href);
      const mf = mf0.map(({ name, src }) => {
        const abs = new URL(src, base).href;
        return { name, src: abs };
      });

      // Preload with progress feedback
      setSpritesProgress({ loaded: 0, total: mf.length, done: false });
      let loaded = 0;
      await preload(
        mf.map((x) => x.src),
        () => setSpritesProgress({ loaded: ++loaded, total: mf.length, done: loaded === mf.length })
      );

      // Store for matchers & UI
      setManifest(mf);
      window.NBT = window.NBT || {};
      window.NBT.spritesManifest = mf; // optional global
      console.info(`[GetSprites] Preloaded ${mf.length} sprites from drive_cache.json`);
    } catch (e) {
      console.error("[GetSprites] Failed to load drive_cache.json:", e);
      alert("Get Sprites failed. See console for details.");
    }
  }

  // card handlers
  function handleNewCard() {
    setCards((prev) => [...prev, makeBlankCard(`New Card`)]); // label matches your UI
    setCurrentIndex(cards.length);
  }
  function handleUpdateCard(next) {
    setCards((prev) => {
      const copy = prev.slice();
      copy[currentIndex] = { ...(copy[currentIndex] || makeBlankCard()), ...next };
      return copy;
    });
  }
  function handleRemoveCard() {
    setCards((prev) => {
      if (!prev.length) return prev;
      const copy = prev.slice();
      copy.splice(currentIndex, 1);
      if (!copy.length) copy.push(makeBlankCard());
      const nextIndex = Math.max(0, Math.min(currentIndex, copy.length - 1));
      setCurrentIndex(nextIndex);
      return copy;
    });
  }
  function handleClearSaved() {
    setCards([makeBlankCard()]);
    setCurrentIndex(0);
  }

  useEffect(() => {
    window.NBT = window.NBT || {};
    window.NBT.consumeCrops = () => {};
  }, []);

  return (
    <div className="app">
      <Header
        title="Nebula Bingo Tracker"
        spritesCount={manifest.length}
        onGetSprites={handleGetSprites}
      />

      <div className="app-body">
        <Sidebar
          cards={cards}
          currentIndex={currentIndex}
          onSelect={setCurrentIndex}
          onNewCard={handleNewCard}
          onClearSaved={handleClearSaved}
          // show progress like in your screenshot
          spritesLoaded={spritesProgress.loaded}
          spritesTotal={spritesProgress.total}
          onGetSprites={handleGetSprites}
        />

        <main className="main-content">
          <BingoCard
            card={currentCard}
            onChange={handleUpdateCard}
            onRemove={handleRemoveCard}
            manifest={manifest}
          />
        </main>
      </div>
    </div>
  );
}
