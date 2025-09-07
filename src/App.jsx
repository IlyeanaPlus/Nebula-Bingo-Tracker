// src/App.jsx — app shell with Header/Sidebar + card & sprites state
import React, { useEffect, useMemo, useState } from "react";

// UI
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";

// Styles
import "./styles/bingo.css";

// Side-effect: grid tuner (Alt+Shift+B)
import "./utils/gridBox.js";

const LS_KEYS = {
  CARDS: "nbt.cards.v1",
  CURRENT: "nbt.currentIndex.v1",
  FRACTIONS: "nbt.gridFractions",
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
  // ---- state ----
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

  // sprites manifest for matching
  const [manifest, setManifest] = useState(() => {
    // if you persist a manifest, hydrate here; otherwise start empty
    return [];
  });

  // ---- persistence ----
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

  // ---- derived ----
  const currentCard = useMemo(
    () => (cards[currentIndex] ? cards[currentIndex] : undefined),
    [cards, currentIndex]
  );

  // ---- handlers: sprites ----
  async function handleGetSprites() {
    // Try globals first (if your repo exposes a loader), then fallback to common path.
    try {
      if (window.NBT?.loadSprites) {
        const out = await window.NBT.loadSprites(); // expected to return an array manifest
        if (Array.isArray(out)) {
          setManifest(out);
          return;
        }
      }
      if (window.NBT?.spritesManifest && Array.isArray(window.NBT.spritesManifest)) {
        setManifest(window.NBT.spritesManifest);
        return;
      }
    } catch (e) {
      console.error("Global sprite loader failed:", e);
    }

    // Fallback: try a conventional manifest path if it exists in your repo
    try {
      const res = await fetch("./sprites/manifest.json", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          setManifest(json);
          return;
        }
      }
      alert("Couldn’t find sprites manifest. Wire window.NBT.loadSprites() or provide sprites/manifest.json");
    } catch (e) {
      console.error("Fetch sprites/manifest.json failed:", e);
      alert("Get Sprites failed. See console for details.");
    }
  }

  // ---- handlers: cards ----
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

  // Provide a small API for the tuner Fill to consume crops -> (already handled in BingoCard)
  useEffect(() => {
    window.NBT = window.NBT || {};
    // optional: expose a consumer if you want global reactions
    window.NBT.consumeCrops = (crops /* Array<25 dataURLs> */) => {
      // no-op here; BingoCard will use manifest+matching when you click Fill inside the card UI
    };
  }, []);

  return (
    <div className="App">
      <Header
        title="Nebula Bingo Tracker"
        spritesCount={manifest.length}
        onGetSprites={handleGetSprites}
      />

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
  );
}
