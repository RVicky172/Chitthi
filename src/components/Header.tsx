import { useState } from 'react';
import { downloadPrintFile, saveDesign } from '../state/actions';
import { redo, undo, useApp } from '../state/store';
import { DownloadIcon, Logo, RedoIcon, SaveIcon, UndoIcon } from './icons';

export function Header() {
  const canUndo = useApp((s) => s.canUndo),
    canRedo = useApp((s) => s.canRedo);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadPrintFile();
    } finally {
      setBusy(false);
    }
  };
  return (
    <header className="bar">
      <Logo />
      <div className="brand">
        <h1>Chitthi</h1>
        <p>Postcards and Instax-style prints for every Indian festival, birthday and season</p>
      </div>
      <div className="acts">
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
          <span className="lbl">{busy ? 'Preparing…' : 'Download'}</span>
        </button>
      </div>
    </header>
  );
}
