import { Printer } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { canFullscreen, toggleFullscreen, useFullscreen } from '../lib/fullscreen';
import { isDark, toggleTheme } from '../lib/theme';
import { setUI, type UIState } from '../state/store';
import { CubeIcon, DocsIcon, FullscreenIcon, InstagramIcon, Logo, MenuIcon, MoonIcon, RulerIcon, SearchIcon, SettingsIcon, SunIcon } from './icons';
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

type PageScreen = Extract<UIState['screen'], 'sizes' | 'paper' | 'docs'>;

/** The guide pages, as links in the bar on wide screens and in the Menu on narrow ones. */
const PAGES: { screen: PageScreen; label: string; short: string; icon: ReactNode }[] = [
  { screen: 'sizes', label: 'Sizes and layouts guide', short: 'Sizes guide', icon: <RulerIcon /> },
  { screen: 'paper', label: 'Paper sizes in 3D', short: 'Paper in 3D', icon: <CubeIcon /> },
  { screen: 'docs', label: 'Documentation', short: 'Docs', icon: <DocsIcon /> },
];

/** Follows the light/dark choice (set here, in the studio, or from the desktop menu) and the system setting. */
const subscribeTheme = (f: () => void) => {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener('chitthi:theme', f);
  mq.addEventListener('change', f);
  return () => {
    window.removeEventListener('chitthi:theme', f);
    mq.removeEventListener('change', f);
  };
};
const useDark = () => useSyncExternalStore(subscribeTheme, isDark, () => false);

/**
 * The top bar of the site pages (home, sizes guide, paper sizes in 3D, documentation). From left to right: the brand,
 * the guide pages and the page's own sections ("On this page"), a few tools (gallery, find, theme, settings, full
 * screen), and the two studios side by side, the bar's main actions. The bar's background and airmail edge run the full
 * width of the window; its contents keep to the page's 1200px measure. As the window narrows, links and tools move into
 * the Menu in steps (below 1200px, then below 760px), so the bar never wraps; the two studios always stay in the bar.
 */
export function SiteNav({ links = [], actions = [], isHome = false, current }: { links?: NavLink[]; actions?: NavAction[]; isHome?: boolean; current?: PageScreen }) {
  const full = useFullscreen(),
    dark = useDark();
  const fullLabel = full ? 'Leave full screen' : 'Full screen',
    themeLabel = dark ? 'Switch to light theme' : 'Switch to dark theme';
  const sep = (list: MenuItem[], on: boolean) => list.map((it, i) => (i === 0 && on ? { ...it, className: `${it.className ?? ''} mm-sep`.trim() } : it));
  // Rows marked sn-lg show in the Menu below 1200px, sn-sm below 760px: exactly what the bar has hidden by then.
  const sections: MenuItem[] = links.map((l) => ({ key: `l-${l.href}`, label: l.label, onSelect: () => go(l.href), className: 'sn-lg' }));
  const pages: MenuItem[] = PAGES.map((p) => ({ key: `p-${p.screen}`, label: p.label, icon: p.icon, current: p.screen === current, onSelect: () => setUI({ screen: p.screen }), className: 'sn-lg' }));
  const tools: MenuItem[] = [
    ...actions.map((a) => ({ key: a.key, label: a.label, icon: a.icon, onSelect: a.onSelect, className: 'sn-lg' })),
    { key: 'find', label: 'Find a feature', icon: <SearchIcon />, onSelect: () => setUI({ finder: true }), className: 'sn-sm' },
    { key: 'theme', label: themeLabel, icon: dark ? <SunIcon /> : <MoonIcon />, onSelect: toggleTheme, className: 'sn-sm' },
    { key: 'settings', label: 'Settings', icon: <SettingsIcon />, onSelect: () => setUI({ settings: true }), className: 'sn-lg' },
    ...(canFullscreen() ? [{ key: 'full', label: fullLabel, icon: <FullscreenIcon on={full} />, onSelect: () => void toggleFullscreen(), checked: full, className: 'sn-lg' }] : []),
  ];
  const menu: MenuItem[] = [...sections, ...sep(pages, sections.length > 0), ...sep(tools, true)];

  return (
    <header className="snav">
      <div className="snav-in">
        <a
          className="snav-brand"
          href="#"
          aria-label={isHome ? 'Chitthi Studio' : 'Chitthi Studio home'}
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

        <nav className="snav-links sn-wide" aria-label="Main">
          {PAGES.map((p) => (
            <a
              key={p.screen}
              href={`#/${p.screen}`}
              title={p.label}
              aria-current={p.screen === current ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                setUI({ screen: p.screen });
              }}
            >
              {p.short}
            </a>
          ))}
          {sections.length > 0 && <MoreMenu className="snav-dd" text="On this page" label="Sections on this page" align="left" items={links.map((l) => ({ key: l.href, label: l.label, onSelect: () => go(l.href) }))} />}
        </nav>

        <div className="snav-tools" role="group" aria-label="Tools">
          {actions.map((a) => (
            <button key={a.key} type="button" className="btn icon ghost sn-wide" title={a.label} aria-label={a.label} onClick={a.onSelect}>
              {a.icon}
            </button>
          ))}
          <button type="button" className="btn icon ghost sn-mid" title="Find a feature (Ctrl+K)" aria-label="Find a feature" onClick={() => setUI({ finder: true })}>
            <SearchIcon />
          </button>
          <button type="button" className="btn icon ghost sn-mid" title={themeLabel} aria-label={themeLabel} onClick={toggleTheme}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="btn icon ghost sn-wide" title="Settings" aria-label="Settings" onClick={() => setUI({ settings: true })}>
            <SettingsIcon />
          </button>
          {canFullscreen() && (
            <button type="button" className="btn icon ghost sn-wide" title={fullLabel} aria-label={fullLabel} aria-pressed={full} onClick={() => void toggleFullscreen()}>
              <FullscreenIcon on={full} />
            </button>
          )}
        </div>

        <div className="snav-studios" role="group" aria-label="Open a studio">
          <button type="button" aria-label="Print studio" title="Print studio: postcards, calendars, frames and magnets" onClick={() => setUI({ screen: 'studio' })}>
            <Printer aria-hidden="true" strokeWidth={1.8} />
            <span className="sn-long">Print studio</span>
            <span className="sn-short">Print</span>
          </button>
          <button type="button" aria-label="Photo & video studio" title="Photo & video studio: Instagram posts, Reels and YouTube videos" onClick={() => setUI({ screen: 'instagram' })}>
            <InstagramIcon />
            <span className="sn-long">Photo &amp; video</span>
            <span className="sn-short">Post</span>
          </button>
        </div>

        <MoreMenu className="snav-menu sn-narrow" label="Menu" icon={<MenuIcon />} items={menu} />
      </div>
    </header>
  );
}
