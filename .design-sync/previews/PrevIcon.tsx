import { PrevIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <PrevIcon />
    Previous month
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Previous month">
    <PrevIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><PrevIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><PrevIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><PrevIcon /></span>
  </div>
);
