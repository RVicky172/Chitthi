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
  return (
    <nav className="rail" aria-label="Steps">
      {PANES.map(([id, label]) => (
        <button key={id} type="button" aria-current={pane === id} onClick={() => setUI({ pane: id })}>
          <PaneIcon id={id} />
          {label}
        </button>
      ))}
    </nav>
  );
}
