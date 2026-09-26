import { useEffect } from 'react';
import { toggleTheme } from '../lib/theme';
import { downloadPack, exportBackup, exportDesignFile, importText, newCard, open3D, saveDesign } from '../state/actions';
import { getState, redo, setUI, undo } from '../state/store';
import { desktop, type MenuAction } from './desktop';

const typing = () => {
  const t = document.activeElement as HTMLElement | null;
  return !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
};

async function openFile(): Promise<void> {
  const f = await desktop?.openDesignFile();
  if (f) await importText(f.name, f.text);
}

const studio = () => setUI({ screen: 'studio', gallery: false });

const ACTIONS: Record<MenuAction, () => void | Promise<void>> = {
  new: () => {
    studio();
    newCard();
  },
  open: openFile,
  restore: openFile,
  save: () => saveDesign(false),
  'save-file': exportDesignFile,
  'export-pack': () => downloadPack(),
  backup: exportBackup,
  // Menu clicks: inside a text field, undo the typing; elsewhere, the card history.
  undo: () => (typing() ? void document.execCommand('undo') : undo()),
  redo: () => (typing() ? void document.execCommand('redo') : redo()),
  home: () => setUI({ screen: 'home', gallery: false }),
  studio,
  gallery: () => setUI({ gallery: true }),
  '3d': () => {
    studio();
    return open3D();
  },
  flip: () => setUI({ side: getState().ui.side === 'front' ? 'back' : 'front' }),
  theme: toggleTheme,
  settings: () => setUI({ settings: true }),
  sizes: () => setUI({ screen: 'sizes', gallery: false }),
  find: () => setUI({ finder: true }),
};

/** Desktop only: runs native menu commands and opens .chitthi files handed over by the OS. */
export function useDesktopMenu(): void {
  useEffect(() => {
    if (!desktop) return;
    const offMenu = desktop.onMenu((a) => void ACTIONS[a]?.());
    const offFile = desktop.onOpenFile((f) => void importText(f.name, f.text));
    return () => {
      offMenu();
      offFile();
    };
  }, []);
}
