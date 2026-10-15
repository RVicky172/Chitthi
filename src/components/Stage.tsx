import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { calPages, cardMM, cornerMM, sizeOf } from '../engine/design';
import { MONTHS } from '../data/products';
import { slotPhotoIndex } from '../engine/layout';
import { softProof } from '../engine/proof';
import { calMonth } from '../engine/calendarDraw';
import { coverScale } from '../engine/photoSlots';
import { renderCard } from '../engine/render';
import { open3D } from '../state/actions';
import { selectSlot } from '../state/photoSlots';
import { getState, patchPhoto, setUI, useApp } from '../state/store';
import type { Layout, Photo, Rect } from '../types';
import { Seg } from './common';
import { CubeIcon, PrevIcon, NextIcon } from './icons';
import { MoreMenu } from './MoreMenu';
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
  const design = useApp((state) => state.design),
    photos = useApp((state) => state.photos);
  const side = useApp((state) => state.ui.side),
    guides = useApp((state) => state.ui.guides),
    proof = useApp((state) => state.ui.proof),
    fontTick = useApp((state) => state.ui.fontTick),
    calPage = useApp((state) => state.ui.calPage),
    loading = useApp((state) => state.ui.loading);
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
    setFlipKey((key) => key + 1);
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
      layout.current = renderCard(
        cv.current,
        side,
        scale * dpr,
        bleed,
        { d: design, photos },
        { hint: true, guides, page },
      );
    if (cv.current && proof) softProof(cv.current);
  }, [design, photos, side, guides, proof, scale, dpr, bleed, fontTick, flipKey, page]);

  const hit = (x: number, y: number): { d: Rect; ph: Photo; slot: number } | null => {
    const drawn = layout.current,
      list = getState().photos;
    if (!drawn || side !== 'front' || !list.length || !cv.current) return null;
    const canvasBox = cv.current.getBoundingClientRect(),
      px = ((x - canvasBox.left) * cv.current.width) / canvasBox.width,
      py = ((y - canvasBox.top) * cv.current.height) / canvasBox.height;
    for (let slot = drawn.slots.length - 1; slot >= 0; slot--) {
      const rect = drawn.slots[slot].d;
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h)
        return { d: rect, ph: list[slotPhotoIndex(slot, list.length, page, drawn.slots.length)], slot: slot };
    }
    return null;
  };

  // Wheel zoom needs a non-passive listener.
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const hitPhoto = hit(event.clientX, event.clientY);
      if (!hitPhoto) return;
      event.preventDefault();
      patchPhoto(hitPhoto.ph.id, { zoom: Math.max(1, Math.min(4, hitPhoto.ph.zoom * (1 - event.deltaY * 0.0015))) });
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
            onChange={(value) => setUI({ side: value })}
          />
        </div>
        <div className="pill hide-sm">
          <label className="check">
            <input type="checkbox" checked={guides} onChange={(event) => setUI({ guides: event.target.checked })} />{' '}
            Print guides
          </label>
          <label
            className="check"
            title="How colours come out on paper: very bright blues, greens and pinks print duller than on screen. The print files are not changed."
          >
            <input type="checkbox" checked={proof} onChange={(event) => setUI({ proof: event.target.checked })} /> Print
            colours
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
            <button
              type="button"
              className="pbtn"
              aria-label="Previous month"
              disabled={page === 0}
              onClick={() => setUI({ calPage: page - 1 })}
            >
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
          <button type="button" className="pbtn" aria-label="3D view" onClick={() => void open3D()}>
            <CubeIcon />
            <span className="hide-sm">3D view</span>
          </button>
        </div>
        {/* Phones: the two view toggles fold into a menu so the bar stays on one row above the card. */}
        <MoreMenu
          className="show-sm pill-menu"
          label="View options"
          items={[
            {
              key: 'guides',
              label: 'Print guides (trim and safe area)',
              checked: guides,
              onSelect: () => setUI({ guides: !guides }),
            },
            {
              key: 'proof',
              label: 'Print colours (how colours print)',
              checked: proof,
              onSelect: () => setUI({ proof: !proof }),
            },
          ]}
        />
      </div>
      <div className="cardwrap" ref={wrap} aria-busy={!!loading}>
        {loading && (
          <div className="stage-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            {loading}
          </div>
        )}
        <div className={guides ? 'trim bleed' : 'trim'}>
          <canvas
            key={flipKey}
            ref={cv}
            role="img"
            tabIndex={draggable ? 0 : undefined}
            aria-label={`${side === 'front' ? 'Front' : 'Back'} of the ${design.product === 'frame' ? 'print' : design.product === 'magnet' ? 'magnet' : design.product}${draggable ? '. Arrow keys move the photo in the selected slot, Shift for bigger steps, plus and minus to zoom.' : ''}`}
            onKeyDown={(event) => {
              // Keyboard equivalent of dragging / wheel-zooming the photo in the selected slot.
              const drawn = layout.current,
                list = getState().photos;
              if (!draggable || !drawn?.slots.length || !list.length) return;
              const slot = Math.min(getState().ui.slot, drawn.slots.length - 1),
                ph = list[slotPhotoIndex(slot, list.length, page, drawn.slots.length)],
                step = event.shiftKey ? 0.2 : 0.05,
                clamp = (value: number) => Math.max(-1, Math.min(1, value));
              const move: Record<string, () => void> = {
                ArrowLeft: () => patchPhoto(ph.id, { px: clamp(ph.px - step) }),
                ArrowRight: () => patchPhoto(ph.id, { px: clamp(ph.px + step) }),
                ArrowUp: () => patchPhoto(ph.id, { py: clamp(ph.py - step) }),
                ArrowDown: () => patchPhoto(ph.id, { py: clamp(ph.py + step) }),
                '+': () => patchPhoto(ph.id, { zoom: Math.min(4, ph.zoom * 1.1) }),
                '=': () => patchPhoto(ph.id, { zoom: Math.min(4, ph.zoom * 1.1) }),
                '-': () => patchPhoto(ph.id, { zoom: Math.max(1, ph.zoom / 1.1) }),
              };
              const fn = move[event.key];
              if (!fn) return;
              event.preventDefault();
              fn();
            }}
            className={`${flipKey ? 'flip' : ''} ${draggable ? 'draggable' : ''} ${dragging ? 'dragging' : ''}`}
            style={{
              width: tw * scale,
              height: th * scale,
              borderRadius: guides ? 2 : circle ? '50%' : corner ? corner * scale : 2,
            }}
            onPointerDown={(event) => {
              const hitPhoto = hit(event.clientX, event.clientY);
              if (!hitPhoto) return;
              selectSlot(hitPhoto.slot);
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: hitPhoto.ph.id,
                d: hitPhoto.d,
                sx: event.clientX,
                sy: event.clientY,
                px: hitPhoto.ph.px,
                py: hitPhoto.ph.py,
              };
              setDragging(true);
            }}
            onPointerMove={(event) => {
              const dragged = drag.current,
                el = cv.current;
              if (!dragged || !el) return;
              const ph = getState().photos.find((photo) => photo.id === dragged.id);
              if (!ph) return;
              const pixelsPerPoint = el.width / el.getBoundingClientRect().width,
                sc = coverScale(ph, dragged.d);
              const ox = ph.sw * sc - dragged.d.w,
                oy = ph.sh * sc - dragged.d.h;
              patchPhoto(dragged.id, {
                px:
                  ox > 0
                    ? Math.max(-1, Math.min(1, dragged.px - (2 * (event.clientX - dragged.sx) * pixelsPerPoint) / ox))
                    : ph.px,
                py:
                  oy > 0
                    ? Math.max(-1, Math.min(1, dragged.py - (2 * (event.clientY - dragged.sy) * pixelsPerPoint) / oy))
                    : ph.py,
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
      </div>
      {side === 'front' && <PhotoTray />}
      <p className="caption">
        {side === 'front' ? 'Front' : 'Back'}, {sizeOf(design).name}, {Math.round(w * 10) / 10} ×{' '}
        {Math.round(h * 10) / 10} mm
        {guides ? `, shown with ${design.exp.bleed} mm bleed` : ''}
      </p>
    </section>
  );
}
