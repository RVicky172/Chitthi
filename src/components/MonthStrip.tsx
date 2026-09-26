import { memo, useDeferredValue, useEffect, useRef } from 'react';
import { MONTHS } from '../data/products';
import { calPages, cardMM } from '../engine/design';
import { calMonth, renderCard } from '../engine/render';
import { setUI, useApp } from '../state/store';
import type { Design, Photo } from '../types';

const MonthThumb = memo(function MonthThumb({
  page,
  design,
  photos,
  active,
  fontTick,
}: {
  page: number;
  design: Design;
  photos: Photo[];
  active: boolean;
  fontTick: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    btn = useRef<HTMLButtonElement>(null);
  const { w, h } = cardMM(design),
    { month, year } = calMonth(design, page);
  useEffect(() => {
    if (ref.current) renderCard(ref.current, 'front', (58 * Math.min(2, devicePixelRatio || 1)) / Math.max(w, h), 0, { d: design, photos }, { page, thumb: true });
  }, [design, photos, page, w, h, fontTick]);
  useEffect(() => {
    if (active) btn.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [active]);
  return (
    <button
      ref={btn}
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={`${MONTHS[month]} ${year}`}
      className="mthumb"
      onClick={() => setUI({ calPage: page, side: 'front' })}
    >
      <canvas ref={ref} style={{ aspectRatio: `${w}/${h}` }} aria-hidden="true" />
      <span>{MONTHS[month].slice(0, 3)}</span>
    </button>
  );
});

/** Every month page of the calendar as a strip of thumbnails under the preview: tap one to show and edit it. */
export function MonthStrip() {
  const design = useApp((s) => s.design),
    photos = useApp((s) => s.photos),
    calPage = useApp((s) => s.ui.calPage),
    fontTick = useApp((s) => s.ui.fontTick);
  // Thumbnails redraw at low priority so dragging a photo on the big preview stays smooth.
  const dd = useDeferredValue(design),
    pp = useDeferredValue(photos);
  const n = calPages(design);
  if (design.product !== 'calendar' || n < 2) return null;
  const page = Math.min(calPage, n - 1);
  return (
    <div className="mstrip" role="tablist" aria-label="Month pages">
      {Array.from({ length: n }, (_, p) => (
        <MonthThumb key={p} page={p} design={dd} photos={pp} active={p === page} fontTick={fontTick} />
      ))}
    </div>
  );
}
