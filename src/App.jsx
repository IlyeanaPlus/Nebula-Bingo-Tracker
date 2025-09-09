// src/App.jsx
import React, { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";
import "./styles/bingo.css";
import "./utils/gridBox.js";
import { prewarmOrtRuntime } from "./utils/ortPrewarm";

// ---- constants & helpers (outside component) ----
const LS_KEYS = {
  CARDS: "nbt.cards.v1",
  CURRENT: "nbt.currentIndex.v1",
};

const makeBlankCard = (title = "New Card") => ({
  title,
  // kept for compatibility; safe to remove later if unused
  saved: false,
  cells: Array.from({ length: 25 }, () => ({
    label: "",
    matchKey: "",
    matchUrl: "",
  })),
  lastImage: null,
});

// ---- component ----
export default function App() {
  // Pre-warm ORT runtime once at startup (does not create a session)
  useEffect(() => {
    prewarmOrtRuntime().catch(console.warn);
  }, []);

  const [cards, setCards] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.CARDS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return []; // start with no cards
  });

  const [currentIndex, setCurrentIndex] = useState(() => {
    const raw = localStorage.getItem(LS_KEYS.CURRENT);
    const idx = raw ? Number(raw) : -1; // -1 means “no selection”
    return Number.isFinite(idx) ? idx : -1;
  });

  // Persist cards & current index
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.CARDS, JSON.stringify(cards));
    } catch {}
  }, [cards]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.CURRENT, String(currentIndex)); // -1 allowed
    } catch {}
  }, [currentIndex]);

  // Manifest (sprites index) is stored at app level
  const [manifest, setManifest] = useState(null);
  function handleGetSprites(indexObj) {
    setManifest(indexObj);
  }

  function handleNewCard() {
    setCards((prev) => {
      const next = [...prev, makeBlankCard(`Card ${prev.length + 1}`)];
      setCurrentIndex(next.length - 1); // select newly created
      return next;
    });
  }

  function handleSelectCard(i) {
    setCurrentIndex(i);
  }

  function handleUpdateCard(nextCard) {
    if (currentIndex < 0) return;
    setCards((prev) => prev.map((c, i) => (i === currentIndex ? nextCard : c)));
  }

  function handleRemoveCard() {
    if (currentIndex < 0) return;
    setCards((prev) => {
      const next = [...prev.slice(0, currentIndex), ...prev.slice(currentIndex + 1)];
      if (next.length === 0) {
        setCurrentIndex(-1); // nothing selected
      } else {
        setCurrentIndex(Math.min(currentIndex, next.length - 1));
      }
      return next;
    });
  }

  return (
    <div className="app-root">
      <Header />
      <div className="app-body">
        <Sidebar
          cards={cards}
          currentIndex={currentIndex}
          onSelect={handleSelectCard}
          onNewCard={handleNewCard}
          onGetSprites={handleGetSprites}
          spritesReady={!!manifest && Object.keys(manifest || {}).length > 0}
        />

        <main className="main-content">
          {cards.length > 0 ? (
            <div className="cards-grid">
              {cards.map((card, i) => (
                <BingoCard
                  key={card.id || i}
                  card={card}
                  onChange={(next) =>
                    setCards((prev) => prev.map((c, j) => (j === i ? next : c)))
                  }
                  onRemove={() =>
                    setCards((prev) => {
                      const next = [...prev.slice(0, i), ...prev.slice(i + 1)];
                      if (next.length === 0) setCurrentIndex(-1);
                      else if (currentIndex >= next.length) setCurrentIndex(next.length - 1);
                      return next;
                    })
                  }
                  manifest={manifest}
                />
              ))}
            </div>
          ) : (
            <div style={{ opacity: 0.75, padding: 16 }}>
              No cards yet. Click <strong>New Card</strong> in the sidebar to get started.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
