import { SuggestIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <SuggestIcon />
    Fill empty slots
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Fill empty slots">
    <SuggestIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><SuggestIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><SuggestIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><SuggestIcon /></span>
  </div>
);
