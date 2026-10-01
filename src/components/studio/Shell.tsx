import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { isDesktop } from '../../platform/desktop';
import { setUI } from '../../state/store';
import { ImageIcon, LaptopIcon, Logo, ReelIcon, YouTubeIcon } from '../icons';

/*
 * The media studio's workspace, shared by the photo, Reel and YouTube editors: a top bar (modes and actions), a tool
 * rail, the tool's panel, the stage (the canvas on a dark surface), an inspector for whatever is selected, and a dock at
 * the bottom (the photo strip or the video timeline). Wide screens show them side by side; narrower ones fold the panel
 * and inspector into one column, and phones stack everything.
 */

export type StudioMode = 'photos' | 'reel' | 'vlog';

export const MODES: { id: StudioMode; label: string; short: string; hash: string; icon: ReactNode }[] = [
  { id: 'photos', label: 'Instagram photos', short: 'Photos', hash: '#/instagram', icon: <ImageIcon /> },
  { id: 'reel', label: 'Reels & Shorts', short: 'Reels', hash: '#/instagram/video', icon: <ReelIcon /> },
  { id: 'vlog', label: 'YouTube video', short: 'YouTube', hash: '#/instagram/youtube', icon: <YouTubeIcon /> },
];
export const modeOf = (hash: string): StudioMode => (/^#\/instagram\/youtube\b/.test(hash) ? 'vlog' : /^#\/instagram\/video\b/.test(hash) ? 'reel' : 'photos');

export interface RailItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

export function StudioShell<T extends string>(p: {
  mode: StudioMode;
  onMode: (m: StudioMode) => void;
  actions: ReactNode;
  rail: RailItem<T>[];
  tool: T | null;
  onTool: (t: T | null) => void;
  panel: ReactNode;
  stage: ReactNode;
  inspector: ReactNode;
  dock: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`mst mst-${p.mode}${p.tool ? '' : ' mst-nopanel'}`}>
      <header className="mst-top">
        <a
          className="mst-brand"
          href="#"
          aria-label="Chitthi Studio home"
          onClick={(e) => {
            e.preventDefault();
            setUI({ screen: 'home' });
          }}
        >
          <Logo />
          <span>
            Chitthi <em>Studio</em>
          </span>
        </a>
        <nav className="mst-modes" aria-label="What to make">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={p.mode === m.id} onClick={() => p.onMode(m.id)} title={m.label}>
              {m.icon}
              <span className="mst-l">{m.label}</span>
              <span className="mst-s">{m.short}</span>
            </button>
          ))}
        </nav>
        <div className="mst-actions">{p.actions}</div>
      </header>
      <div className="mst-body">
        <nav className="mst-rail" aria-label="Tools">
          {p.rail.map((r) => (
            <button key={r.id} type="button" aria-pressed={p.tool === r.id} onClick={() => p.onTool(p.tool === r.id ? null : r.id)}>
              {r.icon}
              <span>{r.label}</span>
            </button>
          ))}
        </nav>
        <div className="mst-side">
          {p.tool && (
            <section className="mst-panel" aria-label={`${p.rail.find((r) => r.id === p.tool)?.label} tools`}>
              {p.panel}
            </section>
          )}
          <aside className="mst-inspector" aria-label="Inspector">
            {p.inspector}
          </aside>
        </div>
        <main className="mst-stage">{p.stage}</main>
      </div>
      <footer className="mst-dock">{p.dock}</footer>
      {p.children}
    </div>
  );
}

/** The largest size (CSS px) a w×h frame fits in the element, leaving a margin. */
export function useFit(ref: RefObject<HTMLElement | null>, w: number, h: number, margin = 32): { width: number; height: number } {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setBox({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  const k = Math.min((box.width - margin) / w, (box.height - margin) / h);
  const width = Math.max(120, Math.floor(w * (Number.isFinite(k) && k > 0 ? k : 0.3)));
  return { width, height: Math.round((width * h) / w) };
}

/** A note that browser editing is limited and the desktop app is the full studio. */
export function DesktopNote({ children }: { children: ReactNode }) {
  if (isDesktop) return null;
  return (
    <p className="mst-note">
      <LaptopIcon />
      <span>
        {children}{' '}
        <a href="https://github.com/RVicky172/Chitthi/releases/latest" target="_blank" rel="noopener noreferrer">
          Get the desktop app
        </a>
        .
      </span>
    </p>
  );
}

