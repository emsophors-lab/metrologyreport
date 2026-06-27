import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker securely for Desktop, iOS, and Android installability
try {
  const isIframe = (() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  if (!isIframe && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('NMC App Service Worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('NMC App Service Worker registration failed:', err);
        });
    });
  } else if (isIframe) {
    console.log('NMC Service Worker integration skipped in sandboxed preview iframe context.');
  }
} catch (e) {
  console.warn('NMC PWA Service worker is unavailable in this environment:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
