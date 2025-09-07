// src/App.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import BingoCard from './components/BingoCard';
import "../utils/gridBox.js";
import { prepareRefIndex as buildIndexFromMatchers } from './utils/matchers';

const MANIFEST_URL = `${import.meta.env.BASE_URL || '/'}drive_cache.json`;
const STORAGE_KEY = 'nebula.bingo.cards.v2';

export default function App() {
  // ---- Card state (with persistence) ----
  const [cards, setCards] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
    // default: one fresh card
    return [
      {
        id: Date.now(),
        title: 'New Card',
        saved: false,
        cells: Array.from({ length: 25 }, () => ({ name: '', sprite: null, complete: false }))
      }
    ];
  });

  // Only persist saved cards
  useEffect(() => {
    try {
      const toSave = cards.filter(c => c.saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('localStorage save failed', e);
    }
  }, [cards]);

  const savedCount = useMemo(() => cards.filter(c => c.saved).length, [cards]);

  function addCard() {
    setCards(prev => [
      ...prev,
      {
        id: Date.now(),
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
  function clearSaved() {
    // Remove saved cards from storage + state, keep any unsaved in view
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setCards(prev => prev.filter(c => !c.saved));
  }

  // ---- Sprite/manifest state (Get Sprites) ----
  const [manifest, setManifest] = useState([]);
  const [refIndex, setRefIndex] = useState([]);

  const [spritesLoading, setSpritesLoading] = useState(false);
  const [loadedSprites, setLoadedSprites] = useState(0);
  const [totalSprites, setTotalSprites] = useState(0);

  const onGetSprites = useCallback(async () => {
    try {
      setSpritesLoading(true);
      setLoadedSprites(0);
      setTotalSprites(0);
      setRefIndex([]);
      setManifest([]);

      const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`manifest fetch ${res.status}`);
      const mf = await res.json();
      const list = Array.isArray(mf) ? mf : mf.files || [];
      setManifest(list);
      setTotalSprites(list.length);

      // Build the matcher index with visible progress
      const refs = [];
      let ok = 0;
      for (const e of list) {
        const rawSrc = e.src || e.image || e.url;
        if (!rawSrc) { setLoadedSprites(n => n + 1); continue; }
        const src = rawSrc.includes('lh3.googleusercontent.com/d/')
          ? `${rawSrc}=s64`
          : rawSrc;

        try {
          const single = await buildIndexFromMatchers([{ name: e.name || e.id, src }]);
          if (single.length) refs.push(single[0]);
          ok++;
        } catch {
          // swallow; progress still moves
        } finally {
          setLoadedSprites(n => n + 1);
          if ((ok % 10) === 0) await new Promise(r => setTimeout(r, 0));
        }
      }
      setRefIndex(refs);
      console.log(`[app] sprites indexed: ${refs.length} / ${list.length}`);
    } catch (err) {
      console.error('Get Sprites failed', err);
      alert(`Get Sprites failed: ${err.message}`);
    } finally {
      setSpritesLoading(false);
    }
  }, []);

  // ---- Render helpers ----
  const cardsView = useMemo(
    () =>
      cards.map((c, i) => (
        <BingoCard
          key={c.id}
          card={c}
          onChange={(next) => updateCard(i, next)}
          onRemove={() => removeCard(i)}
          manifest={manifest}
          // Give BingoCard access to ref count if you want to display it there too
          refIndexCount={refIndex.length}
        />
      )),
    [cards, manifest, refIndex.length]
  );

return (
  <div className="layout">
    <div className="main-column">
      <Header
        totalSprites={totalSprites}
        loadedSprites={loadedSprites}
        spritesLoading={spritesLoading}
        onGetSprites={onGetSprites}
      />
      <div className="body">
        <Sidebar onNewCard={addCard} savedCount={savedCount} onClearSaved={clearSaved} />
        <main className="cards">{cardsView}</main>
      </div>
    </div>
  </div>
);
}
