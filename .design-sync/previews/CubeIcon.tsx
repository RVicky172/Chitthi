import { CubeIcon } from 'chitthi-postcard-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <CubeIcon />
    3D view
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="3D view">
    <CubeIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><CubeIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><CubeIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><CubeIcon /></span>
  </div>
);
