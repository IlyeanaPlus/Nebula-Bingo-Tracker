import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Register Service Worker (works on GH Pages subpath via BASE_URL)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = (import.meta && import.meta.env && import.meta.env.BASE_URL) || '/';
    const swUrl = `${base}sw.js`;
    navigator.serviceWorker.register(swUrl).catch(console.warn);
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
