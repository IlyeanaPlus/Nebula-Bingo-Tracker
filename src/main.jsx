// src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/bingo.css';

// Unregister any old service workers that might serve stale JS/CSS
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  // Also bust caches (optional, harmless if none)
  caches?.keys?.().then(keys => keys.forEach(k => caches.delete(k)));
}

// Tiny runtime error overlay so white screens don't hide crashes
function showBootError(err) {
  const el = document.createElement('div');
  el.style = `
    position:fixed;inset:10px;background:rgba(0,0,0,.9);color:#fff;
    border:1px solid #333;border-radius:10px;z-index:2147483647;padding:12px;
    font:12px/1.4 ui-monospace,Consolas,monospace;overflow:auto;max-height:90vh;
  `;
  el.innerHTML = `<b>Boot error</b><pre style="white-space:pre-wrap;margin-top:8px">${(err && (err.stack||err.message)) || err}</pre>`;
  document.body.appendChild(el);
}

try {
  const root = createRoot(document.getElementById('root'));
  root.render(<App />);
} catch (e) {
  console.error('Boot error', e);
  showBootError(e);
}
