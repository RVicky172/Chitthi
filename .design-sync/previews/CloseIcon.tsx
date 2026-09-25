import { CloseIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <CloseIcon />
    Close
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Close">
    <CloseIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><CloseIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><CloseIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><CloseIcon /></span>
  </div>
);
