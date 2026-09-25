import { ResetIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <ResetIcon />
    Reset position
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Reset position">
    <ResetIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><ResetIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><ResetIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><ResetIcon /></span>
  </div>
);
