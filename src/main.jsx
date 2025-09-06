// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// ✅ Ensure CSS is included at the entry level
import './styles/bingo.css';

// ✅ (Re)register SW with base-aware path
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta?.env?.BASE_URL || '/';
    navigator.serviceWorker.register(`${base}sw.js`).catch(console.error);
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
