import { useDeferredValue } from 'react';
import { layoutsFor } from '../../data/layouts';
import { productOf, sizesFor } from '../../data/products';
import { SIZE_GROUPS, sizeLabel } from '../../data/sizes';
import { slotCount } from '../../engine/layout';
import { selectSize } from '../../state/actions';
import { setDesign, setUI, useApp } from '../../state/store';
import type { CalendarSettings, FrameStyle, MatWidth, ProductId, SizeDef } from '../../types';
import { LayoutThumb } from '../canvases';
import { Pane, photoCount, Seg } from '../common';
import { FoldSection } from '../panel';

function SizeIcon({ s, land }: Readonly<{ s: SizeDef; land: boolean }>) {
  const long = s.L || 150,
    short = s.S || 100,
    width = land ? long : short,
    height = land ? short : long,
    scale = 26 / Math.max(width, height);
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true">
      <rect
        x={15 - (width * scale) / 2}
        y={15 - (height * scale) / 2}
        width={width * scale}
        height={height * scale}
        rx={s.instax ? 1.6 : 0.8}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={s.id === 'custom' ? '3 2' : undefined}
      />
      {s.instax && (
        <rect
          x={15 - (width * scale) / 2 + 2.2}
          y={15 - (height * scale) / 2 + 2.2}
          width={width * scale - 4.4}
          height={height * scale * 0.68}
          fill="currentColor"
          opacity=".35"
        />
      )}
    </svg>
  );
}

/** What the colour around the photo is called, per product. */
const FRAME_LABELS: Record<ProductId, string> = {
  frame: 'Mat colour',
  calendar: 'Paper colour',
  magnet: 'Border colour',
  postcard: 'Frame colour',
};

/** Size, orientation and layout in one step: they all decide the shape of the card and its photo slots. */
export function LayoutPane() {
  const design = useApp((state) => state.design),
    photos = useApp((state) => state.photos),
    fontTick = useApp((state) => state.ui.fontTick);
  const land = design.orient === 'landscape';
  // Thumbnails redraw at low priority so typing and dragging stay smooth.
  const dd = useDeferredValue(design),
    pp = useDeferredValue(photos);
  const need = slotCount(design.layout, design);
  const sizes = sizesFor(design.product),
    groups = SIZE_GROUPS.filter((group) => sizes.some((size) => size.grp === group)),
    setCal = (patch: Partial<CalendarSettings>) => setDesign({ cal: { ...design.cal, ...patch } });
  const frameLabel = FRAME_LABELS[design.product];
  const pagesNote = design.cal.months === 12 ? '12 months' : 'Single month';
  return (
    <Pane
      title="Size and layout"
      lead={`${productOf(design.product).name}: choose the size and how your photos sit on it. Each layout shows how many photos it holds.`}
      next="occasion"
      onNext={() => setUI({ pane: 'occasion' })}
    >
      <Seg
        label="Orientation"
        value={design.orient}
        options={[
          ['landscape', 'Horizontal'],
          ['portrait', 'Vertical'],
        ]}
        onChange={(orient) => setDesign({ orient })}
      />
      <FoldSection
        id="layout.layouts"
        title="Layout"
        note={layoutsFor(design.product).find(([id]) => id === design.layout)?.[1]}
      >
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
          {layoutsFor(design.product).map(([id, name]) => (
            <button
              key={id}
              type="button"
              className="tile layout"
              aria-pressed={id === design.layout}
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
      </FoldSection>
      {design.product === 'calendar' && (
        <FoldSection id="layout.calendar" title="Pages" note={design.layout === 'cal-strip' ? 'One page' : pagesNote}>
          {design.layout === 'cal-strip' ? (
            <p className="hint">The Year strip puts all twelve months on one page under your photo.</p>
          ) : (
            <Seg<'1' | '12'>
              label="Pages"
              value={String(design.cal.months) as '1' | '12'}
              options={[
                ['12', '12 months'],
                ['1', 'Single month'],
              ]}
              onChange={(value) => {
                setCal({ months: +value as 1 | 12 });
                setUI({ calPage: 0 });
              }}
            />
          )}
          <p className="hint">
            Each month takes the next photo in your list, so add one photo per month for a full year. The year, the
            first month and the week start are in the Front step.
          </p>
        </FoldSection>
      )}
      {design.product === 'frame' && (
        <FoldSection id="layout.mat" title="Mat border">
          <Seg<MatWidth>
            label="Mat border"
            value={design.mat}
            options={[
              ['none', 'None'],
              ['thin', 'Thin'],
              ['classic', 'Classic'],
              ['wide', 'Wide'],
            ]}
            onChange={(mat) => setDesign({ mat })}
          />
        </FoldSection>
      )}
      <FoldSection id="layout.frame" title={frameLabel}>
        {design.product === 'postcard' && (
          <p className="hint" style={{ marginTop: 2 }}>
            For Polaroid, Instax frame and Photo strip layouts.
          </p>
        )}
        {design.product === 'magnet' && (
          <p className="hint" style={{ marginTop: 2 }}>
            For Photo and caption, Mini Polaroid and the gaps between photos.
          </p>
        )}
        <Seg<FrameStyle>
          label={frameLabel}
          value={design.frame}
          options={[
            ['white', 'White'],
            ['cream', 'Cream'],
            ['black', 'Black'],
            ['occasion', 'Occasion'],
          ]}
          onChange={(frame) => setDesign({ frame })}
        />
      </FoldSection>
      <FoldSection id="layout.size" title="Size" note={sizes.find((size) => size.id === design.sizeId)?.name}>
        <p className="hint">
          Not sure which size?{' '}
          <button type="button" className="linkbtn" onClick={() => setUI({ screen: 'sizes' })}>
            Compare every size and layout
          </button>{' '}
          with measurements, pixels and sheet counts.
        </p>
        {groups.map((group) => (
          <div key={group}>
            <p className="grp">{group === 'Large and custom' && design.product !== 'postcard' ? 'Custom' : group}</p>
            <div className="grid">
              {sizes
                .filter((size) => size.grp === group)
                .map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    className="tile size"
                    aria-pressed={size.id === design.sizeId}
                    onClick={() => selectSize(size)}
                  >
                    <SizeIcon s={size} land={land} />
                    <span className="text-label">{size.name}</span>
                    <span>{sizeLabel(size)}</span>
                    {size.tag && <em>{size.tag}</em>}
                  </button>
                ))}
            </div>
          </div>
        ))}
        {design.sizeId === 'custom' && (
          <div className="row">
            {(['w', 'h'] as const).map((side) => (
              <label key={side} className="f">
                {side === 'w' ? 'Width' : 'Height'} (mm)
                <input
                  type="number"
                  min={40}
                  max={420}
                  value={design.custom[side]}
                  onChange={(event) => {
                    const value = parseFloat(event.target.value);
                    if (value > 0) setDesign({ custom: { ...design.custom, [side]: Math.min(420, value) } });
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </FoldSection>
    </Pane>
  );
}
