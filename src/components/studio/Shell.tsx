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

/** What the studio makes: Instagram photos, Reels and Shorts, or YouTube videos. */
export type StudioMode = 'photos' | 'reel' | 'vlog';

/** A studio mode in the top bar. */
interface ModeDef {
  id: StudioMode;
  label: string;
  /** The label on narrow screens. */
  short: string;
  /** Its route. */
  hash: string;
  icon: ReactNode;
}

/** The studio's modes, in the top bar's order. */
export const MODES: ModeDef[] = [
  { id: 'photos', label: 'Instagram photos', short: 'Photos', hash: '#/instagram', icon: <ImageIcon /> },
  { id: 'reel', label: 'Reels & Shorts', short: 'Reels', hash: '#/instagram/video', icon: <ReelIcon /> },
  { id: 'vlog', label: 'YouTube video', short: 'YouTube', hash: '#/instagram/youtube', icon: <YouTubeIcon /> },
];
/**
 * The studio mode a route shows.
 * @param hash the URL's hash
 * @returns YouTube for #/instagram/youtube, Reels for #/instagram/video, else photos
 */
export function modeOf(hash: string): StudioMode {
  if (/^#\/instagram\/youtube\b/.test(hash)) return 'vlog';
  return /^#\/instagram\/video\b/.test(hash) ? 'reel' : 'photos';
}

/** A tool in the tool rail. */
export interface RailItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

/** The workspace's parts. */
interface StudioShellProps<T extends string> {
  mode: StudioMode;
  onMode: (mode: StudioMode) => void;
  /** The top bar's actions (undo, format, export). */
  actions: ReactNode;
  rail: RailItem<T>[];
  /** The open tool, or null for none (the panel folds away). */
  tool: T | null;
  onTool: (tool: T | null) => void;
  panel: ReactNode;
  stage: ReactNode;
  inspector: ReactNode;
  dock: ReactNode;
  /** Dialogs. */
  children?: ReactNode;
}

/**
 * The media studio's workspace (see the file's comment).
 * @param props the mode, actions, rail and tool, and the panel, stage, inspector, dock and dialogs
 */
export function StudioShell<T extends string>(props: Readonly<StudioShellProps<T>>) {
  const { mode, onMode, actions, rail, tool, onTool, panel, stage, inspector, dock, children } = props;
  return (
    <div className={`mst mst-${mode}${tool ? '' : ' mst-nopanel'}`}>
      <header className="mst-top">
        <a
          className="mst-brand"
          href="#"
          aria-label="Chitthi Studio home"
          onClick={(event) => {
            event.preventDefault();
            setUI({ screen: 'home' });
          }}
        >
          <Logo />
          <span>
            Chitthi <em>Studio</em>
          </span>
        </a>
        <nav className="mst-modes" aria-label="What to make">
          {MODES.map((option) => (
            <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => onMode(option.id)} title={option.label}>
              {option.icon}
              <span className="mst-l">{option.label}</span>
              <span className="mst-s">{option.short}</span>
            </button>
          ))}
        </nav>
        <div className="mst-actions">{actions}</div>
      </header>
      <div className="mst-body">
        <nav className="mst-rail" aria-label="Tools">
          {rail.map((item) => (
            <button key={item.id} type="button" aria-pressed={tool === item.id} onClick={() => onTool(tool === item.id ? null : item.id)}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mst-side">
          {tool && (
            <section className="mst-panel" aria-label={`${rail.find((item) => item.id === tool)?.label ?? ''} tools`}>
              {panel}
            </section>
          )}
          <aside className="mst-inspector" aria-label="Inspector">
            {inspector}
          </aside>
        </div>
        <main className="mst-stage">{stage}</main>
      </div>
      <footer className="mst-dock">{dock}</footer>
      {children}
    </div>
  );
}

/**
 * The largest size (CSS px) a frame fits in the element, leaving a margin (at least 120 px wide).
 * @param ref the element
 * @param frameWidth the frame's width (any unit)
 * @param frameHeight its height
 * @param margin the space left around it, in CSS px
 * @returns the frame's size in CSS px
 */
export function useFit(ref: RefObject<HTMLElement | null>, frameWidth: number, frameHeight: number, margin = 32): { width: number; height: number } {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setBox({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    setBox({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, [ref]);
  const scale = Math.min((box.width - margin) / frameWidth, (box.height - margin) / frameHeight);
  const width = Math.max(120, Math.floor(frameWidth * (Number.isFinite(scale) && scale > 0 ? scale : 0.3)));
  return { width, height: Math.round((width * frameHeight) / frameWidth) };
}

/** The desktop note's text. */
interface DesktopNoteProps {
  children: ReactNode;
}

/**
 * A note that browser editing is limited and the desktop app is the full studio (nothing in the desktop app).
 * @param props the note's text
 */
export function DesktopNote({ children }: Readonly<DesktopNoteProps>) {
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

