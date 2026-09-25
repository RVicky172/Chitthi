import { SaveIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <SaveIcon />
    Save to gallery
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Save to gallery">
    <SaveIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><SaveIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><SaveIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><SaveIcon /></span>
  </div>
);
