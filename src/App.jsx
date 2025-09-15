// src/App.jsx
import React, { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";
import "./styles/bingo.css";
import "./utils/gridBox.js";
import { prewarmOrtRuntime } from "./utils/ortPrewarm";
import TuningPanel from "./components/TuningPanel.jsx";

const LS_KEYS = {
  CARDS: "nbt.cards.v1",
  CURRENT: "nbt.currentIndex.v1",
};

const makeBlankCard = (title = "New Card") => ({
  title,
  saved: false,
  cells: Array.from({ length: 25 }, () => ({
    label: "",
    matchKey: "",
    matchUrl: "",
  })),
  lastImage: null,
});

export default function App() {
  useEffect(() => {
    prewarmOrtRuntime().catch(console.warn);
  }, []);

  const [cards, setCards] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.CARDS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const [currentIndex, setCurrentIndex] = useState(() => {
    const raw = localStorage.getItem(LS_KEYS.CURRENT);
    const idx = raw ? Number(raw) : -1;
    return Number.isFinite(idx) ? idx : -1;
  });

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

  const [manifest, setManifest] = useState(null);
  function handleGetSprites(indexObj) {
    setManifest(indexObj);
  }

  function handleNewCard() {
    setCards((prev) => {
      const next = [...prev, makeBlankCard(`Card ${prev.length + 1}`)];
      setCurrentIndex(next.length - 1);
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

  const [showSidebar, setShowSidebar] = useState(true);

  function handleRemoveCard() {
    if (currentIndex < 0) return;
    setCards((prev) => {
      const next = [...prev.slice(0, currentIndex), ...prev.slice(currentIndex + 1)];
      if (next.length === 0) setCurrentIndex(-1);
      else setCurrentIndex(Math.min(currentIndex, next.length - 1));
      return next;
    });
  }

  // 👇 The missing return
  return (
    <div className="app-root">
      <Header />
      <div className="app-body">
        <div className="sidebar-toggle" style={{ margin: 8 }}>
          <button
            className="btn"
            onClick={() => setShowSidebar((s) => !s)}
            aria-expanded={showSidebar}
            aria-controls="app-sidebar"
            type="button"
          >
            {showSidebar ? "Hide tools" : "Show tools"}
          </button>
        </div>

        <aside id="app-sidebar" style={{ display: showSidebar ? "" : "none" }}>
          <Sidebar
            cards={cards}
            currentIndex={currentIndex}
            onSelect={handleSelectCard}
            onNewCard={handleNewCard}
            onGetSprites={handleGetSprites}
            spritesReady={!!manifest && Object.keys(manifest || {}).length > 0}
          />
        </aside>

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
