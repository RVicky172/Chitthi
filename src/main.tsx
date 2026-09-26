import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isDesktop } from './platform/desktop';
import './styles.css';

// Apply the saved light/dark choice before first paint; no choice means follow the system.
try {
  const theme = localStorage.getItem('chitthi-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  /* storage blocked */
}

// The desktop app carries the UI fonts offline; the Google Fonts @import in styles.css covers the web.
if (window.chitthiDesktop?.info.localFonts) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = './fonts/ui.css';
  document.head.appendChild(l);
}

// Development only: the landing page example renderer used by npm run build:showcase.
if (import.meta.env.DEV && location.search.includes('showcase')) void import('./dev/showcase');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: only in production builds served over http(s). The desktop app is offline already.
if (import.meta.env.PROD && !isDesktop && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
