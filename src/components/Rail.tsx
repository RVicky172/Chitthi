import { useEffect, useRef } from 'react';
import { setUI, useApp } from '../state/store';
import type { PaneId } from '../types';
import { CheckIcon, GalleryIcon } from './icons';
import { RailFrame } from './panel';

/** The print studio's panes, in order, with their names. */
export const PANES: [PaneId, string][] = [
  ['photos', 'Photos'],
  ['layout', 'Layout'],
  ['occasion', 'Occasion'],
  ['words', 'Front'],
  ['back', 'Back'],
  ['print', 'Print'],
];

/**
 * Where a step stands against the current one.
 * @param index the step
 * @param current the current step
 * @returns done, now or todo
 */
function stepState(index: number, current: number): 'done' | 'now' | 'todo' {
  if (index < current) return 'done';
  return index === current ? 'now' : 'todo';
}

/** The print studio's steps (Photos to Print), with the gallery at the foot; wide or narrow (RailFrame). */
export function Rail() {
  const pane = useApp((state) => state.ui.pane),
    gallery = useApp((state) => state.ui.gallery);
  const steps = useRef<HTMLOListElement>(null);
  const cur = PANES.findIndex(([id]) => id === pane);

  // On phones the rail scrolls sideways: keep the current step in view.
  useEffect(() => {
    const el = steps.current?.closest('nav'),
      btn = el?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!el || !btn || el.scrollWidth <= el.clientWidth) return;
    const left = btn.offsetLeft - (el.clientWidth - btn.offsetWidth) / 2;
    el.scrollTo({ left, behavior: 'smooth' });
  }, [pane]);

  return (
    <RailFrame
      label="Steps"
      className="rail"
      foot={
        <button
          type="button"
          className="galbtn"
          aria-haspopup="dialog"
          aria-expanded={gallery}
          title="Gallery"
          onClick={() => setUI({ gallery: true })}
        >
          <span className="ico">
            <GalleryIcon />
          </span>
          <span className="rail-label">Gallery</span>
        </button>
      }
    >
      <ol className="stepper" ref={steps}>
        {PANES.map(([id, label], index) => {
          const state = stepState(index, cur);
          return (
            <li key={id} className={state}>
              <button
                type="button"
                aria-current={state === 'now' ? 'step' : undefined}
                title={label}
                onClick={() => setUI({ pane: id })}
              >
                <span className="dot" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                  {state === 'done' && <CheckIcon />}
                </span>
                <span className="lbl rail-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </RailFrame>
  );
}
