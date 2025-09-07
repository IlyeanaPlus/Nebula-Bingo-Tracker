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

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.CARDS, JSON.stringify(cards));
    } catch {}
  }, [cards]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.CURRENT, String(currentIndex));
    } catch {}
  }, [currentIndex]);

  const currentCard = useMemo(
    () => (cards[currentIndex] ? cards[currentIndex] : undefined),
    [cards, currentIndex]
  );

  // ---- Get Sprites from public/drive_cache.json ----
  async function handleGetSprites() {
    const normalize = (raw) => {
      if (!raw) return [];
      if (Array.isArray(raw) && raw.length && raw[0]?.name && raw[0]?.src) return raw;

      const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw) ? raw : [];
      return items
        .map((it) => {
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
        })
        .filter(Boolean);
    };

    try {
      // public/* is served from the site root at runtime
      const res = await fetch("./drive_cache.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const mf = normalize(json);
      if (!mf.length) {
        console.warn("[GetSprites] drive_cache.json shape:", json);
        alert("drive_cache.json loaded, but no sprite entries were recognized.");
        return;
      }
      setManifest(mf);
      console.info(`[GetSprites] Loaded ${mf.length} sprites from drive_cache.json`);
    } catch (e) {
      console.error("[GetSprites] Failed to load drive_cache.json:", e);
      alert("Get Sprites failed. See console for details.");
    }
  }

  // ---- card handlers ----
  function handleNewCard() {
    setCards((prev) => [...prev, makeBlankCard(`Card ${prev.length + 1}`)]);
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

  // optional global hook target for the tuner
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

      {/* LEFT COLUMN LAYOUT */}
      <div className="app-body">
        <Sidebar
          cards={cards}
          currentIndex={currentIndex}
          onSelect={setCurrentIndex}
          onNewCard={handleNewCard}
          onClearSaved={handleClearSaved}
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
