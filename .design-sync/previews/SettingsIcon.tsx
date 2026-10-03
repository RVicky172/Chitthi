import { SettingsIcon } from 'chitthi-studio';

// Lucide line icon in currentColor: 24px by default, 17px inside .btn, 14px inside .sbtn.
export const InButton = () => (
  <button type="button" className="btn">
    <SettingsIcon />
    Settings
  </button>
);

export const IconButton = () => (
  <button type="button" className="btn icon" aria-label="Settings">
    <SettingsIcon />
  </button>
);

export const Colours = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
    <span style={{ display: 'inline-flex', color: 'var(--muted)' }}><SettingsIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--text)' }}><SettingsIcon /></span>
    <span style={{ display: 'inline-flex', color: 'var(--accent)' }}><SettingsIcon /></span>
  </div>
);
