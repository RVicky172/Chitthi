import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { StepLabel } from './components/common';
import { CropDialog } from './components/CropDialog';
import { GalleryDialog } from './components/GalleryDialog';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { BackPane } from './components/panes/BackPane';
import { LayoutPane } from './components/panes/LayoutPane';
import { OccasionPane } from './components/panes/OccasionPane';
import { PhotosPane } from './components/panes/PhotosPane';
import { PrintPane } from './components/panes/PrintPane';
import { WordsPane } from './components/panes/WordsPane';
import { Rail, PANES as STEPS } from './components/Rail';
import { Stage } from './components/Stage';
import { Toast } from './components/Toast';
import { Viewer3D } from './components/Viewer3D';
import { ensureFonts, fontsFor } from './lib/fonts';
import { useDesktopMenu } from './platform/menu';
import { restoreWork, saveDesign, switchProduct } from './state/actions';
import { bumpFonts, commit, getState, redo, setUI, undo, useApp } from './state/store';
import type { PaneId, ProductId } from './types';

const PRODUCT_NAMES: Record<ProductId, string> = { postcard: 'postcard', calendar: 'calendar', frame: 'photo frame', magnet: 'fridge magnet' };

const PANES: Record<PaneId, () => JSX.Element> = {
  photos: PhotosPane,
  layout: LayoutPane,
  occasion: OccasionPane,
  words: WordsPane,
  back: BackPane,
  print: PrintPane,
};

export default function App() {
  const screen = useApp((s) => s.ui.screen);
  const headFont = useApp((s) => s.design.headFont),
    quoteFont = useApp((s) => s.design.quoteFont),
    backFont = useApp((s) => s.design.back.font),
    calFont = useApp((s) => s.design.cal.font);
  useDesktopMenu();
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
  }, [headFont, quoteFont, backFont, calFont]);

  // The URL hash mirrors the screen, so the browser Back button returns from the studio to the landing page.
  useEffect(() => {
    const want = screen === 'studio' ? '#/studio' : '';
    if ((location.hash.startsWith('#/studio') ? '#/studio' : '') !== want) {
      if (want) location.hash = want;
      else history.pushState(null, '', location.pathname + location.search);
    }
    window.scrollTo(0, 0);
  }, [screen]);
  useEffect(() => {
    // #/studio/calendar (or /postcard, /frame, /magnet) opens the studio on that product: shareable links to each product.
    const onHash = () => {
      const m = /^#\/studio\/(postcard|calendar|frame|magnet)\b/.exec(location.hash);
      if (m) switchProduct(m[1] as ProductId);
      setUI({ screen: location.hash.startsWith('#/studio') ? 'studio' : 'home' });
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  return (
    <>
      {screen === 'home' ? <Landing /> : <Studio />}
      <CropDialog />
      <GalleryDialog />
      <Viewer3D />
      <Toast />
    </>
  );
}

/** The design studio: step rail, swipeable step panes and the live preview. */
function Studio() {
  const pane = useApp((s) => s.ui.pane),
    product = useApp((s) => s.design.product);
  const track = useRef<HTMLDivElement>(null),
    first = useRef(true);
  const idx = STEPS.findIndex(([id]) => id === pane);

  // Show the side of the card the step is about: Back flips to the back, the design steps flip to the front.
  useEffect(() => {
    const side = pane === 'back' ? 'back' : pane === 'print' ? null : 'front';
    if (side && side !== getState().ui.side) setUI({ side });
  }, [pane]);

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
        <h1 className="vh">Chitthi studio: {PRODUCT_NAMES[product]}</h1>
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
                    <StepLabel.Provider value={`Step ${i + 1} of ${STEPS.length}`}>
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
    </>
  );
}
