import type { ReactNode } from 'react';
import { canFullscreen, toggleFullscreen, useFullscreen } from '../lib/fullscreen';
import { setUI, type UIState } from '../state/store';
import { CubeIcon, DocsIcon, FullscreenIcon, InstagramIcon, Logo, MenuIcon, RulerIcon, SearchIcon, SettingsIcon } from './icons';
import { MoreMenu, type MenuItem } from './MoreMenu';

export interface NavLink {
  label: string;
  /** In-page anchor (`#examples`) or app route (`#/sizes`). */
  href: string;
}
export interface NavAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

/** Scroll to an in-page section, or switch screens for `#/…` routes, without leaving a stray hash behind. */
function go(href: string) {
  if (href.startsWith('#/')) {
    location.hash = href;
    return;
  }
  document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

type ToolScreen = Extract<UIState['screen'], 'sizes' | 'paper' | 'instagram' | 'docs'>;

/** The tool pages: shown as links in the bar on wide screens, and in the Menu below 1100px. */
const TOOLS: { screen: ToolScreen; label: string; short: string; icon: ReactNode }[] = [
  { screen: 'instagram', label: 'Photo & video studio', short: 'Photo & video', icon: <InstagramIcon /> },
  { screen: 'sizes', label: 'Sizes and layouts guide', short: 'Sizes guide', icon: <RulerIcon /> },
  { screen: 'paper', label: 'Paper sizes in 3D', short: 'Paper in 3D', icon: <CubeIcon /> },
  { screen: 'docs', label: 'Documentation', short: 'Docs', icon: <DocsIcon /> },
];

/**
 * The top bar of the site pages (home, sizes guide, paper sizes in 3D, documentation): brand, the tool pages as plain
 * links, the page's own sections in an "On this page" dropdown, page actions, Find, Settings, full screen and "Open
 * studio". Below 1100px the links, dropdown and page actions fold into one Menu; below 600px Find, Settings and full
 * screen join them, so the bar never wraps or scrolls sideways. An airmail stripe runs along its bottom edge.
 */
export function SiteNav({ links = [], actions = [], isHome = false, current }: { links?: NavLink[]; actions?: NavAction[]; isHome?: boolean; current?: ToolScreen }) {
  const full = useFullscreen();
  const fullLabel = full ? 'Leave full screen' : 'Full screen';
  const explore: MenuItem[] = links.map((l) => ({ key: `l-${l.href}`, label: l.label, onSelect: () => go(l.href) }));
  const tools: MenuItem[] = TOOLS.map((t) => ({
    key: `t-${t.screen}`,
    label: t.label,
    icon: t.icon,
    current: t.screen === current,
    onSelect: () => setUI({ screen: t.screen }),
  }));
  // In the folded Menu, a divider starts each group after the first: page links, tools, actions.
  const sep = (list: MenuItem[], on: boolean) => list.map((it, i) => (i === 0 && on ? { ...it, className: `${it.className ?? ''} mm-sep`.trim() } : it));
  const acts: MenuItem[] = actions.map((a) => ({ key: a.key, label: a.label, icon: a.icon, onSelect: a.onSelect }));
  const menu: MenuItem[] = [
    ...explore,
    ...sep(tools, explore.length > 0),
    ...sep(acts, true),
    { key: 'find', label: 'Find a feature', icon: <SearchIcon />, onSelect: () => setUI({ finder: true }), className: 'mm-sm' },
    { key: 'settings', label: 'Settings', icon: <SettingsIcon />, onSelect: () => setUI({ settings: true }), className: 'mm-sm' },
    ...(canFullscreen() ? [{ key: 'full', label: fullLabel, icon: <FullscreenIcon on={full} />, onSelect: () => void toggleFullscreen(), checked: full, className: 'mm-sm' }] : []),
  ];
  return (
    <nav className="lnav" aria-label="Main">
      <a
        className="lbrand"
        href="#"
        aria-label={isHome ? 'Chitthi' : 'Chitthi home'}
        onClick={(e) => {
          e.preventDefault();
          if (isHome) window.scrollTo({ top: 0, behavior: 'smooth' });
          else setUI({ screen: 'home' });
        }}
      >
        <Logo />
        <span>
          Chitthi <em>Studio</em>
        </span>
      </a>
      <div className="lnav-links hide-lg">
        {TOOLS.map((t) => (
          <a
            key={t.screen}
            href={`#/${t.screen}`}
            title={t.label}
            aria-current={t.screen === current ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              setUI({ screen: t.screen });
            }}
          >
            {t.short}
          </a>
        ))}
        {explore.length > 0 && <MoreMenu className="lnav-dd" text="On this page" label="Sections on this page" align="left" items={explore} />}
      </div>
      {actions.map((a) => (
        <button key={a.key} type="button" className="btn ghost hide-lg" onClick={a.onSelect}>
          {a.icon}
          {a.label}
        </button>
      ))}
      <button type="button" className="btn icon ghost hide-sm" title="Find a feature (Ctrl+K)" aria-label="Find a feature" onClick={() => setUI({ finder: true })}>
        <SearchIcon />
      </button>
      <button type="button" className="btn icon ghost hide-sm" title="Settings" aria-label="Settings" onClick={() => setUI({ settings: true })}>
        <SettingsIcon />
      </button>
      {canFullscreen() && (
        <button type="button" className="btn icon ghost hide-sm" title={fullLabel} aria-label={fullLabel} aria-pressed={full} onClick={() => void toggleFullscreen()}>
          <FullscreenIcon on={full} />
        </button>
      )}
      <MoreMenu className="show-lg" label="Menu" icon={<MenuIcon />} items={menu} />
      <button type="button" className="btn primary" onClick={() => setUI({ screen: 'studio' })}>
        Open studio
      </button>
    </nav>
  );
}
