import { SunIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <SunIcon />
    Light theme
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Light theme">
    <SunIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><SunIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><SunIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><SunIcon /></span>
  </div>
);
