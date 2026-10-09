import type { Live } from '../api';

/** The site bar: wordmark, live state, and the airmail edge along its bottom (styles: .top). */
export function TopBar({ live }: { live: Live }) {
  const time = live.updatedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <header className="top">
      <div className="top-in">
        <a className="brand" href="#/">
          <span className="wordmark">Chitthi</span>
          <span className="brand-sub">Roadmap</span>
        </a>
        <p className={`live ${live.offline ? 'is-off' : ''}`} role="status" aria-live="polite">
          <span className="live-dot" aria-hidden="true" />
          {live.offline ? 'Server stopped: run npm run roadmap' : time ? `Live · updated ${time}` : 'Connecting…'}
        </p>
      </div>
    </header>
  );
}
