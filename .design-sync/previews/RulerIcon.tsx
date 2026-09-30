import { RulerIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <RulerIcon />
    Sizes
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Sizes and layouts">
    <RulerIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><RulerIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><RulerIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><RulerIcon /></span>
  </div>
);
