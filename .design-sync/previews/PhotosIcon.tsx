import { PhotosIcon } from 'chitthi-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <PhotosIcon />
    Photos
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Photos">
    <PhotosIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><PhotosIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><PhotosIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><PhotosIcon /></span>
  </div>
);
