import { CheckIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <CheckIcon />
    Done
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Done">
    <CheckIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><CheckIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><CheckIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><CheckIcon /></span>
  </div>
);
