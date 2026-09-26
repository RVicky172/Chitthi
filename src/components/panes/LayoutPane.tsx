import { useDeferredValue } from 'react';
import { layoutsFor } from '../../data/layouts';
import { MONTHS, productOf, sizesFor } from '../../data/products';
import { SIZE_GROUPS, sizeLabel } from '../../data/sizes';
import { slotCount } from '../../engine/layout';
import { selectSize } from '../../state/actions';
import { setDesign, setUI, useApp } from '../../state/store';
import type { CalendarSettings, FrameStyle, MatWidth, SizeDef } from '../../types';
import { LayoutThumb } from '../canvases';
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

const photoCount = (n: number) => (n === 0 ? 'No photo' : n === 1 ? '1 photo' : `${n} photos`);

/** Size, orientation and layout in one step: they all decide the shape of the card and its photo slots. */
export function LayoutPane() {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos),
    fontTick = useApp((s) => s.ui.fontTick);
  const land = d.orient === 'landscape';
  // Thumbnails redraw at low priority so typing and dragging stay smooth.
  const dd = useDeferredValue(d),
    pp = useDeferredValue(photos);
  const need = slotCount(d.layout, d);
  const sizes = sizesFor(d.product),
    groups = SIZE_GROUPS.filter((g) => sizes.some((s) => s.grp === g)),
    setCal = (p: Partial<CalendarSettings>) => setDesign({ cal: { ...d.cal, ...p } }),
    thisYear = new Date().getFullYear();
  const frameLabel =
    d.product === 'frame' ? 'Mat colour' : d.product === 'calendar' ? 'Paper colour' : d.product === 'magnet' ? 'Border colour' : 'Frame colour';
  return (
    <Pane
      title="Size and layout"
      lead={`${productOf(d.product).name}: choose the size and how your photos sit on it. Each layout shows how many photos it holds.`}
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
      <h3>Layout</h3>
      {need > photos.length && (
        <p className="hint">
          This layout holds {photoCount(need).toLowerCase()} and you’ve added {photos.length}.{' '}
          <button type="button" className="linkbtn" onClick={() => setUI({ pane: 'photos' })}>
            Add more photos
          </button>{' '}
          or photos will repeat.
        </p>
      )}
      <div className="grid">
        {layoutsFor(d.product).map(([id, name]) => (
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
            <small className="count">{photoCount(slotCount(id, dd))}</small>
          </button>
        ))}
      </div>
      {d.product === 'calendar' && (
        <>
          <h3>Calendar</h3>
          <div className="row">
            <label className="f">
              Year
              <select value={d.cal.year} onChange={(e) => setCal({ year: +e.target.value })}>
                {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="f">
              {d.cal.months === 12 ? 'Starts in' : 'Month'}
              <select value={d.cal.start} onChange={(e) => setCal({ start: +e.target.value })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {d.layout === 'cal-strip' && (
            <p className="hint">The Year strip puts all twelve months on one page under your photo.</p>
          )}
          <div className="inline" hidden={d.layout === 'cal-strip'}>
            <Seg<'1' | '12'>
              label="Pages"
              value={String(d.cal.months) as '1' | '12'}
              options={[
                ['12', '12 months'],
                ['1', 'Single month'],
              ]}
              onChange={(v) => {
                setCal({ months: +v as 1 | 12 });
                setUI({ calPage: 0 });
              }}
            />
            <Seg<'1' | '0'>
              label="Week starts on"
              value={String(d.cal.weekStart) as '1' | '0'}
              options={[
                ['1', 'Monday'],
                ['0', 'Sunday'],
              ]}
              onChange={(v) => setCal({ weekStart: +v as 0 | 1 })}
            />
          </div>
          <p className="hint">
            Each month takes the next photos in your list, so add one photo per month for a full year. Pick a month in the
            strip under the preview to see it, or open the 3D view to see all twelve pages at once.
          </p>
        </>
      )}
      {d.product === 'frame' && (
        <>
          <h3>Mat border</h3>
          <Seg<MatWidth>
            label="Mat border"
            value={d.mat}
            options={[
              ['none', 'None'],
              ['thin', 'Thin'],
              ['classic', 'Classic'],
              ['wide', 'Wide'],
            ]}
            onChange={(mat) => setDesign({ mat })}
          />
        </>
      )}
      <h3>{frameLabel}</h3>
      {d.product === 'postcard' && (
        <p className="hint" style={{ marginTop: 2 }}>
          For Polaroid, Instax frame and Photo strip layouts.
        </p>
      )}
      {d.product === 'magnet' && (
        <p className="hint" style={{ marginTop: 2 }}>
          For Photo and caption, Mini Polaroid and the gaps between photos.
        </p>
      )}
      <Seg<FrameStyle>
        label={frameLabel}
        value={d.frame}
        options={[
          ['white', 'White'],
          ['cream', 'Cream'],
          ['black', 'Black'],
          ['occasion', 'Occasion'],
        ]}
        onChange={(frame) => setDesign({ frame })}
      />
      <h3>Size</h3>
      {groups.map((g) => (
        <div key={g}>
          <p className="grp">{g === 'Large and custom' && d.product !== 'postcard' ? 'Custom' : g}</p>
          <div className="grid">
            {sizes.filter((s) => s.grp === g).map((s) => (
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
