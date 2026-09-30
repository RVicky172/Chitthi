import { FullscreenIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <FullscreenIcon />
    Full screen
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Full screen">
    <FullscreenIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><FullscreenIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><FullscreenIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><FullscreenIcon /></span>
  </div>
);
