import {StrictMode, Suspense} from 'react';
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

  if ((import.meta as any).env?.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    // Cached Vite dependency chunks can load a second React instance after
    // optimization/restarts. Retire only this app's development SW/cache;
    // never touch localStorage, report drafts or production PWA behavior.
    void navigator.serviceWorker.getRegistrations().then(async registrations => {
      for (const registration of registrations) {
        const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
        if (script && new URL(script).origin === location.origin && new URL(script).pathname === '/sw.js') {
          await registration.unregister();
        }
      }
      if ('caches' in window) {
        for (const key of await caches.keys()) if (key.startsWith('nmc-report-pwa-')) await caches.delete(key);
      }
    }).catch(error => console.warn('Development PWA cache cleanup failed:', error));
  } else if (!isIframe && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
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
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <App />
    </Suspense>
  </StrictMode>,
);
