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

  async function handleGetSprites() {
  const normalize = (raw) => {
    // Accept either an array or {items:[...]}
    const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    return items.map((it) => {
      // try all common shapes; keep exactly {name, src}
      const name =
        it.name || it.title || it.filename || it.fileName || it.id || "";
      const src =
        it.src || it.url || it.downloadUrl || it.webContentLink ||
        it.webViewLink || it.thumbnailLink || it.path || it.relativePath || "";
      return name && src ? { name, src } : null;
    }).filter(Boolean);
  };

  try {
    const res = await fetch("./drive_cache.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // normalize to the matcher’s expected shape
    let mf = normalize(json);

    // absolutize (keeps previous behavior when drive_cache entries are relative)
    const base = new URL(location.href);
    mf = mf.map(({ name, src }) => ({ name, src: new URL(src, base).href }));

    // OPTIONAL: quick, non-blocking warm-up (doesn’t change app flow)
    mf.slice(0, 50).forEach(({ src }) => { const i = new Image(); i.decoding = "async"; i.src = src; });

    setManifest(mf);
    window.NBT = window.NBT || {};
    window.NBT.spritesManifest = mf;      // keep global for other code paths
    console.info(`[GetSprites] Loaded ${mf.length} sprites.`);
  } catch (e) {
    console.error("[GetSprites] Failed:", e);
    alert("Get Sprites failed. Check drive_cache.json and console.");
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
