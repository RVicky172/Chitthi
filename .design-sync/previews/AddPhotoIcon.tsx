import { AddPhotoIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <AddPhotoIcon />
    Upload photos
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Upload photos">
    <AddPhotoIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><AddPhotoIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><AddPhotoIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><AddPhotoIcon /></span>
  </div>
);
