import { Suspense, lazy, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { isDesktop } from '../../platform/desktop';
import { setUI } from '../../state/store';
import { FolderIcon, ImageIcon, LaptopIcon, Logo, MoreIcon, ReelIcon, YouTubeIcon } from '../icons';
import { MoreMenu } from '../MoreMenu';
import { FoldGroup, PanelHeader, RailFrame } from '../panel';
import { StudioDialog } from './Dialog';
import { SaveStatusLine } from './ProjectStatus';

// The Projects panel (408) loads when it is first opened.
const ProjectsPanel = lazy(() => import('./ProjectsPanel').then((module) => ({ default: module.ProjectsPanel })));

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
  /** The rail heading it sits under: Add (bring things in) or Edit (change what is there) (501 §2). */
  group: 'add' | 'edit';
  /** The panel's one-sentence lead, under its title. */
  lead: string;
  /** Used less: in the More menu when the window is under 720 px tall. */
  minor?: boolean;
}

const GROUP_NAMES: Record<RailItem<string>['group'], string> = { add: 'Add', edit: 'Edit' };
const GROUPS = Object.keys(GROUP_NAMES) as RailItem<string>['group'][];

/** The tool rail's tools and the open one. */
type ToolRailProps<T extends string> = Pick<StudioShellProps<T>, 'rail' | 'tool' | 'onTool'>;

/**
 * The tool rail (501 §2, §6): the tools under Add and Edit headings (a divider when narrow), in the expandable rail.
 * Minor tools move into More when the window is under 720 px tall (CSS only: both are always rendered).
 * @param props the tools, the open one and choosing one
 */
function ToolRail<T extends string>({ rail, tool, onTool }: Readonly<ToolRailProps<T>>) {
  const toggle = (id: T) => onTool(tool === id ? null : id);
  const minor = rail.filter((item) => item.minor);
  return (
    <RailFrame label="Tools" className="mst-rail">
      {GROUPS.map((group) => (
        <div key={group} className="rail-group" role="group" aria-label={GROUP_NAMES[group]}>
          <span className="rail-heading" aria-hidden="true">
            {GROUP_NAMES[group]}
          </span>
          {rail
            .filter((item) => item.group === group)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.minor ? 'rail-tool rail-minor' : 'rail-tool'}
                aria-pressed={tool === item.id}
                title={item.label}
                onClick={() => toggle(item.id)}
              >
                {item.icon}
                <span className="rail-label">{item.label}</span>
              </button>
            ))}
        </div>
      ))}
      {minor.length > 0 && (
        <MoreMenu
          className="mst-more"
          text="More"
          label="More tools"
          icon={<MoreIcon />}
          align="left"
          items={minor.map((item) => ({ key: item.id, label: item.label, icon: item.icon, current: tool === item.id, onSelect: () => toggle(item.id) }))}
        />
      )}
    </RailFrame>
  );
}

/** The workspace's parts. */
interface StudioShellProps<T extends string> {
  mode: StudioMode;
  onMode: (mode: StudioMode) => void;
  /** The top bar's actions (undo, format, export). */
  actions: ReactNode;
  rail: readonly RailItem<T>[];
  /** The open tool, or null for none (the panel folds away). */
  tool: T | null;
  onTool: (tool: T | null) => void;
  panel: ReactNode;
  stage: ReactNode;
  inspector: ReactNode;
  /** What the inspector shows ("clip", "layer", "sound" …): each kind remembers its own open section (503). */
  inspectorKind: string;
  dock: ReactNode;
  /** Dialogs. */
  children?: ReactNode;
}

/**
 * The media studio's workspace (see the file's comment).
 * @param props the mode, actions, rail and tool, and the panel, stage, inspector, dock and dialogs
 */
export function StudioShell<T extends string>(props: Readonly<StudioShellProps<T>>) {
  const { mode, onMode, actions, rail, tool, onTool, panel, stage, inspector, inspectorKind, dock, children } = props;
  const [isListing, setListing] = useState(false);
  const openTool = rail.find((item) => item.id === tool);
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
        <button type="button" className="btn ghost mst-projects-btn" aria-haspopup="dialog" onClick={() => setListing(true)} title="Your saved projects">
          <FolderIcon />
          <span>Projects</span>
        </button>
        <nav className="mst-modes" aria-label="What to make">
          {MODES.map((option) => (
            <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => onMode(option.id)} title={option.label}>
              {option.icon}
              <span className="mst-l">{option.label}</span>
              <span className="mst-s">{option.short}</span>
            </button>
          ))}
        </nav>
        <SaveStatusLine />
        <div className="mst-actions">{actions}</div>
      </header>
      <div className="mst-body">
        <ToolRail rail={rail} tool={tool} onTool={onTool} />
        <div className="mst-side">
          {openTool && (
            <section className="mst-panel" aria-label={`${openTool.label} tools`}>
              <PanelHeader eyebrow={GROUP_NAMES[openTool.group]} title={openTool.label} lead={openTool.lead} />
              {/* One section open at a time, remembered per panel and mode (503). */}
              <FoldGroup id={`${mode}:${openTool.id}`}>{panel}</FoldGroup>
            </section>
          )}
          <aside className="mst-inspector" aria-label="Inspector">
            <FoldGroup id={`${mode}:inspector:${inspectorKind}`}>{inspector}</FoldGroup>
          </aside>
        </div>
        <main className="mst-stage">{stage}</main>
      </div>
      <footer className="mst-dock">{dock}</footer>
      <StudioDialog open={isListing} onClose={() => setListing(false)} title={mode === 'photos' ? 'Photo projects' : 'Video projects'}>
        <Suspense fallback={<p className="hint">Loading…</p>}>
          <ProjectsPanel studio={mode === 'photos' ? 'photo' : 'video'} kind={mode === 'vlog' ? 'vlog' : 'reel'} onClose={() => setListing(false)} />
        </Suspense>
      </StudioDialog>
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
    // Observing calls back once with the current size, before the next paint.
    observer.observe(element);
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

