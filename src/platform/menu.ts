import { useEffect } from 'react';
import { toggleTheme } from '../lib/theme';
import { downloadPack, exportBackup, exportDesignFile, importText, newCard, open3D, saveDesign } from '../state/actions';
import { getState, redo, setPerf, setUI, undo } from '../state/store';
import { desktop, type MenuAction } from './desktop';

/**
 * Whether the user is typing in a field.
 * @returns true while a text field, select or editable element has the focus
 */
function isTyping(): boolean {
  const focused = document.activeElement;
  return focused instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName) || focused.isContentEditable);
}

/**
 * Undoes or redoes the typing in a text field, else a step of the card's history.
 * @param command which way to go
 */
function undoOrRedo(command: 'undo' | 'redo'): void {
  if (isTyping()) {
    // The only way to reach a field's own undo stack from a menu; deprecated without a replacement.
    // eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation
    document.execCommand(command);
    return;
  }
  if (command === 'undo') undo();
  else redo();
}

/** Opens a .chitthi file chosen in the desktop app's open dialog. */
async function openFile(): Promise<void> {
  const file = await desktop?.openDesignFile();
  if (file) await importText(file.name, file.text);
}

/** Shows the print studio. */
function studio(): void {
  setUI({ screen: 'studio', gallery: false });
}

/** What each native menu command does. */
const ACTIONS: Readonly<Record<MenuAction, () => void | Promise<void>>> = {
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
  undo: () => undoOrRedo('undo'),
  redo: () => undoOrRedo('redo'),
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
  paper: () => setUI({ screen: 'paper', gallery: false }),
  instagram: () => setUI({ screen: 'instagram', gallery: false }),
  find: () => setUI({ finder: true }),
  perf: () => setPerf(!getState().ui.perf),
};

/** Desktop only: runs native menu commands and opens .chitthi files handed over by the OS. */
export function useDesktopMenu(): void {
  useEffect(() => {
    if (!desktop) return;
    // The main process may send a command this page doesn't know (an older page in a newer app).
    const offMenu = desktop.onMenu((action) => {
      if (Object.hasOwn(ACTIONS, action)) void ACTIONS[action]();
    });
    const offFile = desktop.onOpenFile((file) => void importText(file.name, file.text));
    return () => {
      offMenu();
      offFile();
    };
  }, []);
}
