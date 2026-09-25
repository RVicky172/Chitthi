import { MoonIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <MoonIcon />
    Dark theme
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Dark theme">
    <MoonIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><MoonIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><MoonIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><MoonIcon /></span>
  </div>
);
