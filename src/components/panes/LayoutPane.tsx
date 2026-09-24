import { useDeferredValue } from 'react';
import { LAYOUTS } from '../../data/layouts';
import { setDesign, setUI, useApp } from '../../state/store';
import type { FrameStyle } from '../../types';
import { LayoutThumb } from '../canvases';
import { Pane, Seg } from '../common';

export function LayoutPane() {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos),
    fontTick = useApp((s) => s.ui.fontTick);
  // Thumbnails redraw at low priority so typing and dragging stay smooth.
  const dd = useDeferredValue(d),
    pp = useDeferredValue(photos);
  return (
    <Pane
      title="Layout"
      lead="Previews use your photos. Switch to vertical to see the tall versions."
      next="words"
      onNext={() => setUI({ pane: 'words' })}
    >
      <Seg
        label="Orientation"
        value={d.orient}
        options={[
          ['landscape', 'Horizontal'],
          ['portrait', 'Vertical'],
        ]}
        onChange={(orient) => setDesign({ orient })}
      />
      <div className="grid">
        {LAYOUTS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            className="tile layout"
            aria-pressed={id === d.layout}
            onClick={() => setDesign({ layout: id })}
          >
            <div className="cv">
              <LayoutThumb layout={id} design={dd} photos={pp} fontTick={fontTick} />
            </div>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <h3>Frame colour</h3>
      <p className="hint" style={{ marginTop: 2 }}>
        For Polaroid, Instax frame and Photo strip layouts.
      </p>
      <Seg<FrameStyle>
        label="Frame colour"
        value={d.frame}
        options={[
          ['white', 'White'],
          ['cream', 'Cream'],
          ['black', 'Black'],
          ['occasion', 'Occasion'],
        ]}
        onChange={(frame) => setDesign({ frame })}
      />
    </Pane>
  );
}
