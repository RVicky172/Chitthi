import { useEffect, useState } from 'react';
import { PRODUCTS } from '../data/products';
import { isDark, toggleTheme } from '../lib/theme';
import { downloadPack, saveDesign, switchProduct } from '../state/actions';
import { redo, setUI, undo, useApp } from '../state/store';
import { Seg } from './common';
import { DownloadIcon, Logo, MoonIcon, RedoIcon, SaveIcon, SunIcon, UndoIcon, ProductIcon } from './icons';

export function Header() {
  const canUndo = useApp((s) => s.canUndo),
    canRedo = useApp((s) => s.canRedo),
    product = useApp((s) => s.design.product);
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
  return (
    <header className="bar">
      <button type="button" className="home" title="Chitthi home" aria-label="Chitthi home" onClick={() => setUI({ screen: 'home' })}>
        <Logo />
        <span className="brand">
          <span className="wordmark">Chitthi</span>
        </span>
      </button>
      <div className="products-switch">
        <Seg label="What are you making?" value={product} options={PRODUCTS.map((p) => [p.id, p.name, <ProductIcon key={p.id} id={p.id} />])} onChange={switchProduct} />
      </div>
      <div className="acts">
        <button
          type="button"
          className="btn icon ghost"
          title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
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
        <button type="button" className="btn" title="Save to gallery (Ctrl+S)" onClick={() => void saveDesign(false)}>
          <SaveIcon />
          <span className="lbl">Save to gallery</span>
        </button>
        <button type="button" className="btn primary" disabled={busy} onClick={download}>
          <DownloadIcon />
          <span className="lbl">{busy ? 'Preparing…' : 'Print pack'}</span>
        </button>
      </div>
    </header>
  );
}
