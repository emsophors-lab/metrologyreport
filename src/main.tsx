import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/**
 * Recover from a lazy chunk that no longer exists.
 *
 * Every screen in this app is code-split, and every deployment gives the
 * chunks new hashed filenames. A tab that was open across a deployment still
 * holds the old names, so the first time it opens a screen it has not loaded
 * yet it asks for a file that is gone and shows "Failed to fetch dynamically
 * imported module" — which looks to an officer like the feature is broken
 * rather than like the page is stale.
 *
 * Vite raises `vite:preloadError` for exactly this. Reloading picks up the
 * current index and its current chunk names.
 *
 * Guarded by a timestamp rather than a flag: a genuine network failure or a
 * chunk missing from the deployment itself would otherwise reload for ever.
 * One reload per minute at most; after that the error is left to surface so
 * the real fault is visible instead of hidden behind a loop.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', event => {
    const KEY = 'mlrs:chunk-reload-at';
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* private mode */ }
    if (Date.now() - last < 60000) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ }
    event.preventDefault();
    window.location.reload();
  });
}

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
