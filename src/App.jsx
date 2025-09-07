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
    label: "",
    matchKey: "",
    matchUrl: "",
  })),
  // store the most recent screenshot used for this card
  lastImage: null,
});

export default function App() {
  const [cards, setCards] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.CARDS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [makeBlankCard("Card 1")];
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    const raw = localStorage.getItem(LS_KEYS.CURRENT);
    return raw ? Number(raw) : 0;
  });

  const currentCard = cards[currentIndex] || makeBlankCard();

  // Persist cards & current index
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

  // Manifest (sprites index) is stored at app level
  const [manifest, setManifest] = useState(null);

  function handleGetSprites(indexObj) {
    setManifest(indexObj);
  }

  function handleNewCard() {
    setCards((prev) => [...prev, makeBlankCard(`Card ${prev.length + 1}`)]);
    setCurrentIndex(cards.length);
  }

  function handleSelectCard(i) {
    setCurrentIndex(i);
  }

  function handleClearSaved() {
    setCards((prev) => prev.map((c) => ({ ...c, saved: false })));
  }

  function handleUpdateCard(nextCard) {
    setCards((prev) => prev.map((c, i) => (i === currentIndex ? nextCard : c)));
  }

  function handleRemoveCard() {
    setCards((prev) => {
      if (prev.length <= 1) return [makeBlankCard("Card 1")];
      const next = [...prev.slice(0, currentIndex), ...prev.slice(currentIndex + 1)];
      const newIndex = Math.max(0, currentIndex - 1);
      setCurrentIndex(newIndex);
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
          onClearSaved={handleClearSaved}
          onGetSprites={handleGetSprites}
          spritesReady={!!manifest && Object.keys(manifest || {}).length > 0}
        />

        <main className="main-content">
          <div className="cards-grid">
            {cards.map((card, i) => (
              <BingoCard
                key={card.id || i}
                card={card}
                onChange={(next) => {
                  setCards((prev) => prev.map((c, j) => (j === i ? next : c)));
                }}
                onRemove={() => {
                  setCards((prev) => {
                    if (prev.length <= 1) return [makeBlankCard("Card 1")];
                    const next = [...prev.slice(0, i), ...prev.slice(i + 1)];
                    return next;
                  });
                }}
                manifest={manifest}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
