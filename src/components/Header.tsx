import { useEffect, useState } from 'react';
import { PRODUCTS } from '../data/products';
import { isDark, toggleTheme } from '../lib/theme';
import { downloadPack, saveDesign, switchProduct } from '../state/actions';
import { redo, setPerf, setUI, undo, useApp } from '../state/store';
import { Seg } from './common';
import { MoreMenu } from './MoreMenu';
import { canFullscreen, toggleFullscreen, useFullscreen } from '../lib/fullscreen';
import { ActivityIcon, CubeIcon, DownloadIcon, FullscreenIcon, InstagramIcon, Logo, MoonIcon, PhotosIcon, RedoIcon, RulerIcon, SaveIcon, SearchIcon, SettingsIcon, SunIcon, UndoIcon, ProductIcon } from './icons';

export function Header() {
  const canUndo = useApp((s) => s.canUndo),
    canRedo = useApp((s) => s.canRedo),
    product = useApp((s) => s.design.product),
    onCard = useApp((s) => s.photos.length),
    perf = useApp((s) => s.ui.perf);
  const full = useFullscreen();
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(isDark);
  // The theme can also change from the desktop menu.
  useEffect(() => {
    const sync = () => setDark(isDark());
    window.addEventListener('chitthi:theme', sync);
    return () => window.removeEventListener('chitthi:theme', sync);
  }, []);
  const download = async () => {
    setBusy(true);
    try {
      await downloadPack();
    } finally {
      setBusy(false);
    }
  };
  const themeLabel = dark ? 'Switch to light theme' : 'Switch to dark theme',
    fullLabel = full ? 'Leave full screen' : 'Full screen';
  return (
    <header className="bar">
      <button type="button" className="home" title="Chitthi home" aria-label="Chitthi home" onClick={() => setUI({ screen: 'home' })}>
        <Logo />
        <span className="brand">
          <span className="wordmark">Chitthi</span>
        </span>
      </button>
      <div className="products-switch">
        <Seg label="What are you making?" value={product} options={PRODUCTS.map((p) => [p.id, p.short, <ProductIcon key={p.id} id={p.id} />])} onChange={switchProduct} />
      </div>
      <div className="acts">
        <button type="button" className="btn find-btn hide-sm" title="Find a feature (Ctrl+K)" onClick={() => setUI({ finder: true })}>
          <SearchIcon />
          <span className="lbl">Find</span>
          <kbd className="lbl">Ctrl K</kbd>
        </button>
        <button type="button" className="btn photos-btn hide-sm" title="Photo library: upload, crop and choose photos" onClick={() => setUI({ library: true })}>
          <PhotosIcon />
          <span className="lbl">Photos</span>
          {onCard > 0 && <b className="count-badge">{onCard}</b>}
        </button>
        <span className="acts-more hide-md">
        <span className="sep" aria-hidden="true" />
        <button type="button" className="btn icon ghost" title={themeLabel} aria-label={themeLabel} onClick={toggleTheme}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className="btn icon ghost"
          title="Sizes and layouts guide"
          aria-label="Sizes and layouts guide"
          onClick={() => setUI({ screen: 'sizes' })}
        >
          <RulerIcon />
        </button>
        <button type="button" className="btn icon ghost" title="Settings" aria-label="Settings" onClick={() => setUI({ settings: true })}>
          <SettingsIcon />
        </button>
        {canFullscreen() && (
          <button
            type="button"
            className="btn icon ghost"
            title={fullLabel}
            aria-label={fullLabel}
            aria-pressed={full}
            onClick={() => void toggleFullscreen()}
          >
            <FullscreenIcon on={full} />
          </button>
        )}
        </span>
        <span className="sep" aria-hidden="true" />
        <button type="button" className="btn icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <UndoIcon />
        </button>
        <button
          type="button"
          className="btn icon"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={redo}
        >
          <RedoIcon />
        </button>
        <button type="button" className="btn hide-sm" title="Save to gallery (Ctrl+S)" onClick={() => void saveDesign(false)}>
          <SaveIcon />
          <span className="lbl">Save to gallery</span>
        </button>
        {/* On phones the label is hidden, so the button carries its name itself. */}
        <button type="button" className="btn primary" disabled={busy} onClick={download} aria-label={busy ? 'Preparing the print pack' : 'Download the print pack'}>
          <DownloadIcon />
          <span className="lbl">{busy ? 'Preparing…' : 'Print pack'}</span>
        </button>
        {/* Always: Paper sizes in 3D and the performance monitor. Below 960px the secondary actions join them; below
            600px Find, Photos and Save too (the mm-* row classes in styles/32-header-nav.css). */}
        <MoreMenu
          label="More actions"
          items={[
            { key: 'find', label: 'Find a feature', icon: <SearchIcon />, onSelect: () => setUI({ finder: true }), className: 'mm-sm' },
            { key: 'photos', label: onCard ? `Photo library (${onCard} on the card)` : 'Photo library', icon: <PhotosIcon />, onSelect: () => setUI({ library: true }), className: 'mm-sm' },
            { key: 'save', label: 'Save to gallery', icon: <SaveIcon />, onSelect: () => void saveDesign(false), className: 'mm-sm' },
            { key: 'theme', label: themeLabel, icon: dark ? <SunIcon /> : <MoonIcon />, onSelect: toggleTheme, className: 'mm-md' },
            { key: 'sizes', label: 'Sizes and layouts guide', icon: <RulerIcon />, onSelect: () => setUI({ screen: 'sizes' }), className: 'mm-md' },
            { key: 'paper', label: 'Paper sizes in 3D', icon: <CubeIcon />, onSelect: () => setUI({ screen: 'paper' }) },
            { key: 'instagram', label: 'Photo & video studio', icon: <InstagramIcon />, onSelect: () => setUI({ screen: 'instagram' }) },
            { key: 'settings', label: 'Settings', icon: <SettingsIcon />, onSelect: () => setUI({ settings: true }), className: 'mm-md' },
            ...(canFullscreen() ? [{ key: 'full', label: fullLabel, icon: <FullscreenIcon on={full} />, onSelect: () => void toggleFullscreen(), checked: full, className: 'mm-md' }] : []),
            { key: 'perf', label: 'Performance monitor', icon: <ActivityIcon />, onSelect: () => setPerf(!perf), checked: perf },
          ]}
        />
      </div>
    </header>
  );
}
