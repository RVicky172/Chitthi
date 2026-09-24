import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { StepLabel } from './components/common';
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
import { Rail, PANES as STEPS } from './components/Rail';
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
  const track = useRef<HTMLDivElement>(null),
    first = useRef(true);
  const idx = STEPS.findIndex(([id]) => id === pane);

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

  // Tab → scroll: glide the snap track to the chosen pane.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const left = idx * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) > 1) {
      const smooth = !first.current && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
    }
    first.current = false;
  }, [idx]);

  // Scroll → tab: when a swipe settles on a pane, make it the current one.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let timer = 0;
    const settle = () => {
      clearTimeout(timer);
      const id = STEPS[Math.round(el.scrollLeft / el.clientWidth)]?.[0];
      if (id && id !== getState().ui.pane) setUI({ pane: id });
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(settle, 140);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', settle);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', settle);
    };
  }, []);

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
        <section className="panel" aria-label="Step settings">
          <div className="progress" aria-hidden="true" style={{ '--i': idx } as CSSProperties}>
            <i />
          </div>
          <div className="steps" ref={track}>
            {STEPS.map(([id, label], i) => {
              const P = PANES[id];
              // Only the current pane and its neighbours render, so swipes land on ready content.
              return (
                <div key={id} className="slide" role="group" aria-label={label} inert={i !== idx}>
                  {Math.abs(i - idx) <= 1 && (
                    <StepLabel.Provider value={id === 'gallery' ? 'Your designs' : `Step ${i + 1} of ${STEPS.length - 1}`}>
                      <P />
                    </StepLabel.Provider>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <Stage />
      </main>
      <CropDialog />
      <Viewer3D />
      <Toast />
    </>
  );
}
