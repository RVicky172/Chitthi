import type { ReactNode } from 'react';
import { canFullscreen, toggleFullscreen, useFullscreen } from '../lib/fullscreen';
import { setUI } from '../state/store';
import { FullscreenIcon, Logo, MenuIcon, SearchIcon, SettingsIcon } from './icons';
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

/**
 * The top bar of the site pages (home, sizes guide, paper sizes in 3D): brand, page links, page actions, Find,
 * Settings, full screen and "Open studio". Below 960px the links and page actions fold into a Menu; below 600px
 * Find, Settings and full screen join them, so the bar never wraps or scrolls sideways.
 */
export function SiteNav({ links = [], actions = [], isHome = false }: { links?: NavLink[]; actions?: NavAction[]; isHome?: boolean }) {
  const full = useFullscreen();
  const fullLabel = full ? 'Leave full screen' : 'Full screen';
  const menu: MenuItem[] = [
    ...links.map((l) => ({ key: `l-${l.href}`, label: l.label, onSelect: () => go(l.href) })),
    ...actions.map((a) => ({ key: a.key, label: a.label, icon: a.icon, onSelect: a.onSelect })),
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
        <span>Chitthi</span>
      </a>
      {links.length > 0 && (
        <div className="lnav-links hide-lg">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => {
                e.preventDefault();
                go(l.href);
              }}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
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
      <MoreMenu className={links.length || actions.length ? 'show-lg' : 'show-sm'} label="Menu" icon={<MenuIcon />} items={menu} />
      <button type="button" className="btn primary" onClick={() => setUI({ screen: 'studio' })}>
        Open studio
      </button>
    </nav>
  );
}
