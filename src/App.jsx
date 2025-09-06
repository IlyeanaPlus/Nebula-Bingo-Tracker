import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import BingoCard from './components/BingoCard';
import './styles/bingo.css';

const LS_KEY = 'nebula_bingo_cards_v2';

export default function App() {
  const [manifest, setManifest] = useState([]);
  const [cards, setCards] = useState([]);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });

  // Load saved cards
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setCards(JSON.parse(raw));
    } catch {}
  }, []);

  // Persist only saved cards
  useEffect(() => {
    const saved = cards.filter(c => c.saved);
    localStorage.setItem(LS_KEY, JSON.stringify(saved));
  }, [cards]);

  // Network-first for drive_cache.json; then "validate" entries to show progress
  async function getSprites() {
    setProgress({ loaded: 0, total: 0 });
    try {
      const base = import.meta?.env?.BASE_URL || '/';
      const res = await fetch(`${base}drive_cache.json`, { cache: 'reload' });
      const data = await res.json();

      setManifest(data);
      // Show a short progress pass so it's not "instant"
      setProgress({ loaded: 0, total: data.length });

      // Light validation pass with yielding, so user sees progress
      let loaded = 0;
      for (const _ of data) {
        loaded++;
        if (loaded % 25 === 0) {
          // yield to paint every 25 items
          await new Promise(r => setTimeout(r, 0));
          setProgress({ loaded, total: data.length });
        }
      }
      // finalize
      setProgress({ loaded: data.length, total: data.length });
    } catch (e) {
      console.error('Failed to load manifest', e);
      setManifest([]);
      setProgress({ loaded: 0, total: 0 });
    }
  }

  function newCard() {
    setCards(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: 'New Card',
        saved: false,
        cells: Array.from({ length: 25 }, () => ({ name: '', sprite: null, complete: false }))
      }
    ]);
  }

  function updateCard(idx, next) {
    setCards(prev => prev.map((c, i) => (i === idx ? next : c)));
  }

  function removeCard(idx) {
    setCards(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="app">
      <Header />
      <div className="layout">
        <Sidebar onGetSprites={getSprites} onNewCard={newCard} progress={progress} />
        <main className="content">
          <div className="cards">
            {cards.map((card, i) => (
              <BingoCard
                key={card.id}
                card={card}
                manifest={manifest}
                onChange={(next) => updateCard(i, next)}
                onRemove={() => removeCard(i)}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
