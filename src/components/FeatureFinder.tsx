import { useEffect, useMemo, useRef, useState } from 'react';
import { PRODUCTS } from '../data/products';
import { toggleFullscreen } from '../lib/fullscreen';
import { toggleTheme } from '../lib/theme';
import { toast } from '../lib/toast';
import { addFiles, downloadPack, downloadQuote, exportBackup, newCard, open3D, saveDesign, switchProduct } from '../state/actions';
import { selectSlot } from '../state/photoSlots';
import { autoArrange } from '../state/traits';
import { getState, redo, setDesign, setUI, undo, useApp } from '../state/store';
import type { PaneId } from '../types';
import { revealSection } from './common';
import { SearchIcon } from './icons';

/*
 * Feature finder (Ctrl+K / ⌘K, or Find in the header): type what you want to do and jump straight to it. Each entry
 * opens the right step and section, or runs the action.
 */

interface Cmd {
  id: string;
  group: string;
  title: string;
  /** Extra words people might search with. */
  words: string;
  run: () => void;
  /** Only offered when this is true. */
  when?: () => boolean;
}

const studio = (pane?: PaneId, section?: string) => {
  setUI({ screen: 'studio', ...(pane ? { pane, side: pane === 'back' ? 'back' : 'front' } : {}) });
  if (section) revealSection(section);
};
const is = (p: string) => () => getState().design.product === p;

function commands(pickFiles: () => void): Cmd[] {
  const c: Cmd[] = [
    { id: 'upload', group: 'Photos', title: 'Add photos from this device', words: 'upload import pictures images files', run: () => (studio('photos'), pickFiles()) },
    { id: 'library', group: 'Photos', title: 'Open the photo library', words: 'photos store all images manage delete remove', run: () => setUI({ library: true, libraryTab: 'mine' }) },
    { id: 'pexels', group: 'Photos', title: 'Search free photos on Pexels', words: 'stock free images search pexels', run: () => setUI({ library: true, libraryTab: 'pexels' }) },
    {
      id: 'crop',
      group: 'Photos',
      title: 'Crop the photo in the selected slot',
      words: 'crop rotate mirror trim straighten',
      run: () => {
        const s = getState(),
          ph = s.photos[Math.min(s.ui.slot, s.photos.length - 1)];
        if (!ph) {
          toast('Add a photo first, then crop it.');
          return;
        }
        studio();
        selectSlot(Math.min(s.ui.slot, s.photos.length - 1));
        setUI({ cropId: ph.id });
      },
    },
    { id: 'arrange', group: 'Photos', title: 'Auto-arrange photos in the layout', words: 'auto arrange fit align smart crop subject best', run: () => (studio(), autoArrange()) },
    { id: 'layout', group: 'Size and layout', title: 'Choose a layout', words: 'layout collage arrangement template', run: () => studio('layout', 'layout.layouts') },
    { id: 'size', group: 'Size and layout', title: 'Change the size', words: 'size dimensions a4 a6 4x6 5x7 paper custom', run: () => studio('layout', 'layout.size') },
    {
      id: 'orient',
      group: 'Size and layout',
      title: 'Switch horizontal / vertical',
      words: 'orientation landscape portrait rotate',
      run: () => setDesign((d) => ({ orient: d.orient === 'landscape' ? 'portrait' : 'landscape' })),
    },
    { id: 'frame', group: 'Size and layout', title: 'Frame, mat or paper colour', words: 'border colour color mat paper', run: () => studio('layout', 'layout.frame') },
    { id: 'sizes', group: 'Size and layout', title: 'Compare every size and layout', words: 'sizes guide bleed safe area pixels sheet', run: () => setUI({ screen: 'sizes' }) },
    { id: 'occasion', group: 'Occasion', title: 'Choose an occasion theme', words: 'festival diwali holi birthday season theme artwork', run: () => studio('occasion', 'occasion.themes') },
    { id: 'plain', group: 'Occasion', title: 'Use my own colours (plain card)', words: 'plain colours colors no theme background', run: () => studio('occasion', 'occasion.plain') },
    { id: 'words', group: 'Words', title: 'Edit the greeting and quote', words: 'text greeting quote wish message signature words', run: () => studio('words', 'words.text') },
    { id: 'fonts', group: 'Words', title: 'Change fonts and text size', words: 'font typeface typography size', run: () => studio('words', 'words.fonts') },
    { id: 'align', group: 'Words', title: 'Text position and colour', words: 'align alignment position colour color darken', run: () => studio('words', 'words.place') },
    { id: 'insta', group: 'Words', title: 'Add your Instagram tag', words: 'instagram handle username social', run: () => studio('words', 'words.insta') },
    { id: 'ownfont', group: 'Words', title: 'Upload your own font', words: 'custom font ttf otf woff upload', run: () => setUI({ settings: true }) },
    { id: 'captions', group: 'Calendar', title: 'Month captions', words: 'calendar caption month words text', when: is('calendar'), run: () => studio('words', 'cal.words') },
    { id: 'datesfont', group: 'Calendar', title: 'Month titles, dates font and grid', words: 'calendar dates days weekday font grid numbers', when: is('calendar'), run: () => studio('words', 'cal.titles') },
    { id: 'calyear', group: 'Calendar', title: 'Year, start month and pages', words: 'calendar year month start week monday sunday', when: is('calendar'), run: () => studio('layout', 'layout.calendar') },
    { id: 'back', group: 'Back and envelope', title: 'Message on the back', words: 'back message note handwriting', run: () => studio('back', getState().design.product === 'postcard' ? 'back.message' : undefined) },
    { id: 'address', group: 'Back and envelope', title: 'Address and PIN code', words: 'address pin postal recipient to from', run: () => studio('back', getState().design.product === 'postcard' ? 'back.address' : 'env') },
    { id: 'envelope', group: 'Back and envelope', title: 'Envelope options', words: 'envelope flap seal stamp', run: () => studio('back', 'env') },
    { id: 'env3d', group: 'Back and envelope', title: 'See the envelope in 3D', words: 'envelope 3d open', run: () => void open3D(undefined, 'envelope') },
    { id: 'pack', group: 'Print', title: 'Download the print pack', words: 'download export zip pdf png print', run: () => void downloadPack() },
    { id: 'quote', group: 'Print', title: 'Quote request for a print shop (this design)', words: 'quote price printer cost estimate specification paper', run: () => void downloadQuote('design') },
    { id: 'catalog', group: 'Print', title: 'Specification PDF for printers (all products and sizes)', words: 'quote catalog price printer paper gsm sizes specification', run: () => void downloadQuote('catalog') },
    { id: 'print', group: 'Print', title: 'Print settings (bleed, dpi, sheets)', words: 'print bleed dpi crop marks sheet a4 pdf', run: () => studio('print', 'print.settings') },
    { id: '3d', group: 'View', title: '3D preview', words: '3d preview spin rotate view', run: () => void open3D() },
    { id: 'guides', group: 'View', title: 'Show or hide print guides', words: 'trim safe area bleed guides lines', run: () => (studio(), setUI({ guides: !getState().ui.guides })) },
    { id: 'flip', group: 'View', title: 'Flip to the other side', words: 'back front flip turn', run: () => (studio(), setUI({ side: getState().ui.side === 'front' ? 'back' : 'front' })) },
    { id: 'full', group: 'View', title: 'Full screen on / off', words: 'fullscreen full screen maximise maximize', run: () => void toggleFullscreen() },
    { id: 'theme', group: 'View', title: 'Light / dark theme', words: 'dark mode light mode theme appearance', run: toggleTheme },
    { id: 'save', group: 'Designs', title: 'Save to gallery', words: 'save keep store', run: () => void saveDesign(false) },
    { id: 'gallery', group: 'Designs', title: 'Open the gallery', words: 'gallery saved designs samples examples', run: () => setUI({ gallery: true }) },
    { id: 'new', group: 'Designs', title: 'Start a new design', words: 'new blank reset start over', run: () => (studio(), newCard()) },
    { id: 'undo', group: 'Designs', title: 'Undo', words: 'undo back revert', run: undo },
    { id: 'redo', group: 'Designs', title: 'Redo', words: 'redo again', run: redo },
    { id: 'backup', group: 'Designs', title: 'Back up the gallery', words: 'backup export gallery json', run: () => void exportBackup() },
    { id: 'settings', group: 'App', title: 'Settings and Pexels API key', words: 'settings preferences pexels api key', run: () => setUI({ settings: true }) },
    { id: 'home', group: 'App', title: 'Home page', words: 'home landing start', run: () => setUI({ screen: 'home' }) },
  ];
  for (const p of PRODUCTS)
    c.push({
      id: `product-${p.id}`,
      group: 'Products',
      title: `Make a ${p.name.toLowerCase()}`,
      words: `${p.id} ${p.name} switch product`,
      run: () => {
        switchProduct(p.id);
        studio('photos');
      },
    });
  return c;
}

/** Every search word must appear in the title or keywords; titles that start with the query rank first. */
function rank(list: Cmd[], q: string): Cmd[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list
    .filter((c) => {
      const hay = `${c.title} ${c.words} ${c.group}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => +!a.title.toLowerCase().startsWith(words[0]) - +!b.title.toLowerCase().startsWith(words[0]));
}

export function FeatureFinder() {
  const open = useApp((s) => s.ui.finder);
  const dlg = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    files = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const all = useMemo(() => commands(() => files.current?.click()), []);
  const list = rank(
    all.filter((c) => !c.when || c.when()),
    q,
  );

  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    if (open && !el.open) {
      setQ('');
      setSel(0);
      el.showModal();
      requestAnimationFrame(() => input.current?.focus());
    } else if (!open && el.open) el.close();
  }, [open]);

  // Ctrl+K / ⌘K anywhere opens it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setUI({ finder: !getState().ui.finder });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    dlg.current?.close();
    // Let the dialog close before steps move or other dialogs open.
    setTimeout(c.run, 30);
  };

  let lastGroup = '';
  return (
    <dialog ref={dlg} className="finder" aria-label="Find a feature" onClose={() => setUI({ finder: false })}>
      <div className="finder-search">
        <SearchIcon />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls="finderList"
          aria-activedescendant={list[sel] ? `find-${list[sel].id}` : undefined}
          placeholder="What do you want to do? e.g. crop, envelope, fonts, A4"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((i) => Math.min(list.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(list[sel]);
            }
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <ul id="finderList" className="finder-list" role="listbox" aria-label="Features">
        {list.map((c, i) => {
          const head = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {head && !q && <p className="finder-group">{head}</p>}
              <button
                id={`find-${c.id}`}
                type="button"
                role="option"
                aria-selected={i === sel}
                onMouseEnter={() => setSel(i)}
                onClick={() => run(c)}
              >
                <span>{c.title}</span>
                {q && <small>{c.group}</small>}
              </button>
            </li>
          );
        })}
        {!list.length && <li className="finder-empty">Nothing matches “{q}”. Try another word, like photo, size or print.</li>}
      </ul>
      <p className="finder-foot">
        <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to open. Open this any time with <kbd>Ctrl</kbd> <kbd>K</kbd>.
      </p>
      <input
        ref={files}
        type="file"
        multiple
        hidden
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files;
          e.target.value = '';
          if (f?.length) void addFiles([...f]).then((m) => m.length && toast(m[0][1]));
        }}
      />
    </dialog>
  );
}
