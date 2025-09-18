// src/App.jsx
import React, { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BingoCard from "./components/BingoCard.jsx";
import "./styles/bingo.css";
import "./utils/gridBox.js";
import GridTunerHost from "./components/GridTunerHost.jsx";

// Dev-only: clear stale nbt.* keys so cards/tuner don’t persist between refreshes
import "./utils/devResetNbt.js";

// NOTE: Boot (ORT prewarm + sprite index load) moved to main.jsx.

const LS_KEYS = {
  CARDS: "nbt.cards.v2",
  CURRENT: "nbt.currentIndex.v2",
};

const STORAGE_KEY = import.meta.env.DEV ? null : "nbt.cards.v2";

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

  // 🔌 NEW: hold dev previews pushed by the controller hook (no need to touch BingoCard.jsx)
  const [devResults, setDevResults] = useState([]);

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

  // Listen for previews from the hook
  useEffect(() => {
    function onDebugResults(e) {
      // e.detail is the results[] array from useBingoCard
      setDevResults(Array.isArray(e.detail) ? e.detail : []);
    }
    window.addEventListener("nbt:debugResults", onDebugResults);
    return () => window.removeEventListener("nbt:debugResults", onDebugResults);
  }, []);

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

  function handleRemoveAll() {
    setCards([]);
    setCurrentIndex(-1);
    try {
      localStorage.removeItem(LS_KEYS.CARDS);
      localStorage.setItem(LS_KEYS.CURRENT, String(-1));
    } catch {}
  }

  return (
    <div className="app-root">
      <Header />
      <div className="app-body">
        <aside id="app-sidebar">
          <Sidebar
            onNewCard={handleNewCard}
            onRemoveAll={handleRemoveAll}
            cardsCount={cards.length}
            // ⬇️ forward previews to the DevDebugPanel through Sidebar
            debugResults={devResults}
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
      <GridTunerHost />
    </div>
  );
}
