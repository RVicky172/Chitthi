import { useEffect, useRef } from 'react';
import { setUI, useApp } from '../state/store';
import type { PaneId } from '../types';
import { PaneIcon } from './icons';

export const PANES: [PaneId, string][] = [
  ['size', 'Size'],
  ['occasion', 'Occasion'],
  ['photos', 'Photos'],
  ['layout', 'Layout'],
  ['words', 'Words'],
  ['back', 'Back'],
  ['print', 'Print'],
  ['gallery', 'Gallery'],
];

export function Rail() {
  const pane = useApp((s) => s.ui.pane);
  const nav = useRef<HTMLElement>(null);

  // On phones the rail scrolls sideways: keep the current step in view.
  useEffect(() => {
    const el = nav.current,
      btn = el?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!el || !btn || el.scrollWidth <= el.clientWidth) return;
    const left = btn.offsetLeft - (el.clientWidth - btn.offsetWidth) / 2;
    el.scrollTo({ left, behavior: 'smooth' });
  }, [pane]);

  return (
    <nav className="rail" aria-label="Steps" ref={nav}>
      {PANES.map(([id, label]) => (
        <button key={id} type="button" aria-current={pane === id} onClick={() => setUI({ pane: id })}>
          <span className="ico">
            <PaneIcon id={id} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
