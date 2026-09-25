import { useEffect, useRef } from 'react';
import { setUI, useApp } from '../state/store';
import type { PaneId } from '../types';
import { CheckIcon, GalleryIcon } from './icons';

export const PANES: [PaneId, string][] = [
  ['photos', 'Photos'],
  ['layout', 'Layout'],
  ['occasion', 'Occasion'],
  ['words', 'Front'],
  ['back', 'Back'],
  ['print', 'Print'],
];

export function Rail() {
  const pane = useApp((s) => s.ui.pane),
    gallery = useApp((s) => s.ui.gallery);
  const nav = useRef<HTMLElement>(null);
  const cur = PANES.findIndex(([id]) => id === pane);

  // On phones the rail scrolls sideways: keep the current step in view.
  useEffect(() => {
    const el = nav.current,
      btn = el?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!el || !btn || el.scrollWidth <= el.clientWidth) return;
    const left = btn.offsetLeft - (el.clientWidth - btn.offsetWidth) / 2;
    el.scrollTo({ left, behavior: 'smooth' });
  }, [pane]);

  return (
    <nav className="rail" aria-label="Steps" ref={nav}>
      <ol className="stepper">
        {PANES.map(([id, label], i) => {
          const state = i < cur ? 'done' : i === cur ? 'now' : 'todo';
          return (
            <li key={id} className={state}>
              <button type="button" aria-current={state === 'now' ? 'step' : undefined} onClick={() => setUI({ pane: id })}>
                <span className="dot">{state === 'done' ? <CheckIcon /> : i + 1}</span>
                <span className="lbl">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="galbtn"
        aria-haspopup="dialog"
        aria-expanded={gallery}
        onClick={() => setUI({ gallery: true })}
      >
        <span className="ico">
          <GalleryIcon />
        </span>
        Gallery
      </button>
    </nav>
  );
}
