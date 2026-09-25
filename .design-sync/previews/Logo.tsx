import { Logo } from 'chitthi-postcard-studio';

// The चिट्ठी postmark seal. It draws in currentColor; the header and landing nav colour it var(--accent).
export const HeaderMark = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent)' }}>
    <span style={{ width: 44, height: 44, display: 'inline-flex' }}>
      <Logo />
    </span>
    <span className="wordmark" style={{ font: '400 1.85rem/1 var(--display)' }}>
      Chitthi
    </span>
  </div>
);

export const Seal = () => (
  <span style={{ width: 160, height: 160, display: 'inline-flex', color: 'var(--accent)' }}>
    <Logo />
  </span>
);

export const OnDark = () => (
  <div style={{ background: 'var(--stage)', padding: 20, borderRadius: 16, display: 'inline-flex', color: '#7dd3fc' }}>
    <span style={{ width: 72, height: 72, display: 'inline-flex' }}>
      <Logo />
    </span>
  </div>
);
