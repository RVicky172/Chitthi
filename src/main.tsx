import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installFontLinks } from './lib/fonts';
import './styles.css';

installFontLinks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: only in production builds served over http(s).
if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
