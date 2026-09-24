import { SIZE_GROUPS, SIZES, sizeLabel } from '../../data/sizes';
import { selectSize } from '../../state/actions';
import { setDesign, setUI, useApp } from '../../state/store';
import type { SizeDef } from '../../types';
import { Pane, Seg } from '../common';

function SizeIcon({ s, land }: { s: SizeDef; land: boolean }) {
  const L = s.L || 150,
    S = s.S || 100,
    w = land ? L : S,
    h = land ? S : L,
    k = 26 / Math.max(w, h);
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true">
      <rect
        x={15 - (w * k) / 2}
        y={15 - (h * k) / 2}
        width={w * k}
        height={h * k}
        rx={s.instax ? 1.6 : 0.8}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={s.id === 'custom' ? '3 2' : undefined}
      />
      {s.instax && (
        <rect
          x={15 - (w * k) / 2 + 2.2}
          y={15 - (h * k) / 2 + 2.2}
          width={w * k - 4.4}
          height={h * k * 0.68}
          fill="currentColor"
          opacity=".35"
        />
      )}
    </svg>
  );
}

export function SizePane() {
  const d = useApp((s) => s.design);
  const land = d.orient === 'landscape';
  return (
    <Pane
      title="Size and shape"
      lead="Pick a postcard, an Instax-style print or a large card, then turn it horizontal or vertical."
      next="occasion"
      onNext={() => setUI({ pane: 'occasion' })}
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
      {SIZE_GROUPS.map((g) => (
        <div key={g}>
          <h3 style={{ margin: '10px 0 8px' }}>{g}</h3>
          <div className="grid">
            {SIZES.filter((s) => s.grp === g).map((s) => (
              <button
                key={s.id}
                type="button"
                className="tile size"
                aria-pressed={s.id === d.sizeId}
                onClick={() => selectSize(s)}
              >
                <SizeIcon s={s} land={land} />
                <b>{s.name}</b>
                <span>{sizeLabel(s)}</span>
                {s.tag && <em>{s.tag}</em>}
              </button>
            ))}
          </div>
        </div>
      ))}
      {d.sizeId === 'custom' && (
        <div className="row">
          {(['w', 'h'] as const).map((k) => (
            <label key={k} className="f">
              {k === 'w' ? 'Width' : 'Height'} (mm)
              <input
                type="number"
                min={40}
                max={420}
                value={d.custom[k]}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v > 0) setDesign({ custom: { ...d.custom, [k]: Math.min(420, v) } });
                }}
              />
            </label>
          ))}
        </div>
      )}
    </Pane>
  );
}
