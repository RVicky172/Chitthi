import { useEffect, useRef, type JSX } from 'react';
import { CropDialog } from './components/CropDialog';
import { Header } from './components/Header';
import { BackPane } from './components/panes/BackPane';
import { GalleryPane } from './components/panes/GalleryPane';
import { LayoutPane } from './components/panes/LayoutPane';
import { OccasionPane } from './components/panes/OccasionPane';
import { PhotosPane } from './components/panes/PhotosPane';
import { PrintPane } from './components/panes/PrintPane';
import { SizePane } from './components/panes/SizePane';
import { WordsPane } from './components/panes/WordsPane';
import { Rail } from './components/Rail';
import { Stage } from './components/Stage';
import { Toast } from './components/Toast';
import { Viewer3D } from './components/Viewer3D';
import { ensureFonts, fontsFor } from './lib/fonts';
import { restoreWork, saveDesign } from './state/actions';
import { bumpFonts, commit, getState, redo, setUI, undo, useApp } from './state/store';
import type { PaneId } from './types';

const PANES: Record<PaneId, () => JSX.Element> = {
  size: SizePane,
  occasion: OccasionPane,
  photos: PhotosPane,
  layout: LayoutPane,
  words: WordsPane,
  back: BackPane,
  print: PrintPane,
  gallery: GalleryPane,
};

export default function App() {
  const pane = useApp((s) => s.ui.pane);
  const headFont = useApp((s) => s.design.headFont),
    quoteFont = useApp((s) => s.design.quoteFont),
    backFont = useApp((s) => s.design.back.font);
  const panel = useRef<HTMLElement>(null),
    first = useRef(true);
  const Current = PANES[pane];

  // Start-up: history baseline, restore last card's photos, redraw when web fonts arrive.
  useEffect(() => {
    commit();
    void restoreWork();
    const onFonts = () => bumpFonts();
    document.fonts.addEventListener('loadingdone', onFonts);
    return () => document.fonts.removeEventListener('loadingdone', onFonts);
  }, []);

  useEffect(() => {
    void ensureFonts(fontsFor(getState().design)).then(bumpFonts);
  }, [headFont, quoteFont, backFont]);

  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.innerWidth <= 860) panel.current?.scrollIntoView({ block: 'start' });
  }, [pane]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement,
        typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      const mod = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      if (mod && k === 's') {
        e.preventDefault();
        void saveDesign(false);
        return;
      }
      if (typing || document.querySelector('dialog[open]')) return;
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        redo();
      } else if (!mod && !e.altKey && k === 'f') setUI({ side: getState().ui.side === 'front' ? 'back' : 'front' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Header />
      <main className="shell">
        <Rail />
        <section className="panel" ref={panel}>
          <Current />
        </section>
        <Stage />
      </main>
      <CropDialog />
      <Viewer3D />
      <Toast />
    </>
  );
}
