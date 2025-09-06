import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import BingoCard from './components/BingoCard';
import './styles/bingo.css';   // ✅ new import for styles

const LS_KEY = 'nebula_bingo_cards_v2';

export default function App() {
  const [manifest, setManifest] = useState([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [cards, setCards] = useState([]);

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

  async function getSprites() {
    setLoadingCount(0);
    setTotal(0);
    try {
      const base = import.meta?.env?.BASE_URL || '/';
      const res = await fetch(`${base}drive_cache.json`, { cache: 'reload' });
      const data = await res.json();
      setManifest(data);
      setTotal(data.length);
      setLoadingCount(data.length);
    } catch (e) {
      console.error('Failed to load manifest', e);
      setManifest([]);
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
    setCards(prev => prev.map((c, i) => i === idx ? next : c));
  }

  function removeCard(idx) {
    setCards(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="app">
      <Header
        loadingCount={loadingCount}
        total={total}
        onGetSprites={getSprites}
        onNewCard={newCard}
      />

      <div className="cards">
        {cards.map((card, i) => (
          <BingoCard
            key={card.id}
            card={card}
            manifest={manifest}
            onChange={(next)=>updateCard(i, next)}
            onRemove={()=>removeCard(i)}
          />
        ))}
      </div>
    </div>
  );
}
