import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { calPages, cardMM, cornerMM, sizeOf } from '../engine/design';
import { MONTHS } from '../data/products';
import { slotPhotoIndex } from '../engine/layout';
import { calMonth, coverScale, renderCard } from '../engine/render';
import { open3D } from '../state/actions';
import { selectSlot } from '../state/photoSlots';
import { getState, patchPhoto, setUI, useApp } from '../state/store';
import type { Layout, Photo, Rect } from '../types';
import { Seg } from './common';
import { CubeIcon, PrevIcon, NextIcon } from './icons';
import { PhotoTray } from './PhotoTray';

interface Drag {
  id: string;
  d: Rect;
  sx: number;
  sy: number;
  px: number;
  py: number;
}

export function Stage() {
  const design = useApp((s) => s.design),
    photos = useApp((s) => s.photos);
  const side = useApp((s) => s.ui.side),
    guides = useApp((s) => s.ui.guides),
    fontTick = useApp((s) => s.ui.fontTick),
    calPage = useApp((s) => s.ui.calPage),
    loading = useApp((s) => s.ui.loading);
  const isCal = design.product === 'calendar',
    pages = calPages(design),
    page = isCal ? Math.min(calPage, pages - 1) : 0;
  const wrap = useRef<HTMLDivElement>(null),
    cv = useRef<HTMLCanvasElement>(null);
  const layout = useRef<Layout | null>(null),
    drag = useRef<Drag | null>(null);
  const [box, setBox] = useState({ w: 600, h: 400 });
  const [flipKey, setFlipKey] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Play the flip whenever the side changes: the Front/Back toggle, the F key, or moving between steps.
  const lastSide = useRef(side);
  useEffect(() => {
    if (lastSide.current === side) return;
    lastSide.current = side;
    setFlipKey((k) => k + 1);
  }, [side]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = cardMM(design),
    bleed = guides ? +design.exp.bleed || 3 : 0,
    tw = w + 2 * bleed,
    th = h + 2 * bleed;
  const scale = Math.min(Math.max(80, box.w - 36) / tw, Math.max(80, box.h - 36) / th);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const corner = cornerMM(design),
    circle = sizeOf(design).shape === 'circle';

  useEffect(() => {
    if (cv.current)
      layout.current = renderCard(cv.current, side, scale * dpr, bleed, { d: design, photos }, { hint: true, guides, page });
  }, [design, photos, side, guides, scale, dpr, bleed, fontTick, flipKey, page]);

  const hit = (x: number, y: number): { d: Rect; ph: Photo; slot: number } | null => {
    const L = layout.current,
      list = getState().photos;
    if (!L || side !== 'front' || !list.length || !cv.current) return null;
    const r = cv.current.getBoundingClientRect(),
      px = ((x - r.left) * cv.current.width) / r.width,
      py = ((y - r.top) * cv.current.height) / r.height;
    for (let i = L.slots.length - 1; i >= 0; i--) {
      const d = L.slots[i].d;
      if (px >= d.x && px <= d.x + d.w && py >= d.y && py <= d.y + d.h) return { d, ph: list[slotPhotoIndex(i, list.length, page, L.slots.length)], slot: i };
    }
    return null;
  };

  // Wheel zoom needs a non-passive listener.
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const h = hit(e.clientX, e.clientY);
      if (!h) return;
      e.preventDefault();
      patchPhoto(h.ph.id, { zoom: Math.max(1, Math.min(4, h.ph.zoom * (1 - e.deltaY * 0.0015))) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const draggable = side === 'front' && photos.length > 0;
  return (
    <section className="stage" aria-label="Postcard preview">
      <div className="stagebar">
        <div className="pill">
          <Seg
            label="Side"
            value={side}
            options={[
              ['front', 'Front'],
              ['back', 'Back'],
            ]}
            onChange={(v) => setUI({ side: v })}
          />
        </div>
        <div className="pill">
          <label className="check">
            <input type="checkbox" checked={guides} onChange={(e) => setUI({ guides: e.target.checked })} /> Print guides
          </label>
          {guides && (
            <span className="legend">
              <span>
                <i style={{ color: '#FF5C7A' }} />
                Trim
              </span>
              <span>
                <i style={{ color: '#7FB0FF' }} />
                Safe
              </span>
            </span>
          )}
        </div>
        {isCal && side === 'front' && pages > 1 && (
          <div className="pill month" role="group" aria-label="Month shown">
            <button type="button" className="pbtn" aria-label="Previous month" disabled={page === 0} onClick={() => setUI({ calPage: page - 1 })}>
              <PrevIcon />
            </button>
            <span aria-live="polite">
              {MONTHS[calMonth(design, page).month].slice(0, 3)} {calMonth(design, page).year}
            </span>
            <button
              type="button"
              className="pbtn"
              aria-label="Next month"
              disabled={page >= pages - 1}
              onClick={() => setUI({ calPage: page + 1 })}
            >
              <NextIcon />
            </button>
          </div>
        )}
        <div className="pill">
          <button type="button" className="pbtn" onClick={() => void open3D()}>
            <CubeIcon />
            3D view
          </button>
        </div>
      </div>
      <div className="cardwrap" ref={wrap} aria-busy={!!loading}>
        {loading && (
          <div className="stage-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            {loading}
          </div>
        )}
        <canvas
          key={flipKey}
          ref={cv}
          role="img"
          tabIndex={draggable ? 0 : undefined}
          aria-label={`${side === 'front' ? 'Front' : 'Back'} of the ${design.product === 'frame' ? 'print' : design.product === 'magnet' ? 'magnet' : design.product}${draggable ? '. Arrow keys move the photo in the selected slot, Shift for bigger steps, plus and minus to zoom.' : ''}`}
          onKeyDown={(e) => {
            // Keyboard equivalent of dragging / wheel-zooming the photo in the selected slot.
            const L = layout.current,
              list = getState().photos;
            if (!draggable || !L?.slots.length || !list.length) return;
            const slot = Math.min(getState().ui.slot, L.slots.length - 1),
              ph = list[slotPhotoIndex(slot, list.length, page, L.slots.length)],
              step = e.shiftKey ? 0.2 : 0.05,
              clamp = (v: number) => Math.max(-1, Math.min(1, v));
            const move: Record<string, () => void> = {
              ArrowLeft: () => patchPhoto(ph.id, { px: clamp(ph.px - step) }),
              ArrowRight: () => patchPhoto(ph.id, { px: clamp(ph.px + step) }),
              ArrowUp: () => patchPhoto(ph.id, { py: clamp(ph.py - step) }),
              ArrowDown: () => patchPhoto(ph.id, { py: clamp(ph.py + step) }),
              '+': () => patchPhoto(ph.id, { zoom: Math.min(4, ph.zoom * 1.1) }),
              '=': () => patchPhoto(ph.id, { zoom: Math.min(4, ph.zoom * 1.1) }),
              '-': () => patchPhoto(ph.id, { zoom: Math.max(1, ph.zoom / 1.1) }),
            };
            const fn = move[e.key];
            if (!fn) return;
            e.preventDefault();
            fn();
          }}
          className={`${flipKey ? 'flip' : ''} ${draggable ? 'draggable' : ''} ${dragging ? 'dragging' : ''}`}
          style={{ width: tw * scale, height: th * scale, borderRadius: guides ? 2 : circle ? '50%' : corner ? corner * scale : 2 }}
          onPointerDown={(e) => {
            const h = hit(e.clientX, e.clientY);
            if (!h) return;
            selectSlot(h.slot);
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: h.ph.id, d: h.d, sx: e.clientX, sy: e.clientY, px: h.ph.px, py: h.ph.py };
            setDragging(true);
          }}
          onPointerMove={(e) => {
            const g = drag.current,
              el = cv.current;
            if (!g || !el) return;
            const ph = getState().photos.find((p) => p.id === g.id);
            if (!ph) return;
            const k = el.width / el.getBoundingClientRect().width,
              sc = coverScale(ph, g.d);
            const ox = ph.sw * sc - g.d.w,
              oy = ph.sh * sc - g.d.h;
            patchPhoto(g.id, {
              px: ox > 0 ? Math.max(-1, Math.min(1, g.px - (2 * (e.clientX - g.sx) * k) / ox)) : ph.px,
              py: oy > 0 ? Math.max(-1, Math.min(1, g.py - (2 * (e.clientY - g.sy) * k) / oy)) : ph.py,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
        />
      </div>
      {side === 'front' && <PhotoTray />}
      <p className="caption">
        {side === 'front' ? 'Front' : 'Back'}, {sizeOf(design).name}, {Math.round(w * 10) / 10} × {Math.round(h * 10) / 10} mm
        {guides ? `, shown with ${design.exp.bleed} mm bleed` : ''}
      </p>
    </section>
  );
}
