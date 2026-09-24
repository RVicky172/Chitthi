import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cardMM, sizeOf } from '../engine/design';
import { coverScale, renderCard } from '../engine/render';
import { open3D } from '../state/actions';
import { getState, patchPhoto, setUI, useApp } from '../state/store';
import type { Layout, Photo, Rect } from '../types';
import { Seg } from './common';
import { CubeIcon } from './icons';

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
    fontTick = useApp((s) => s.ui.fontTick);
  const wrap = useRef<HTMLDivElement>(null),
    cv = useRef<HTMLCanvasElement>(null);
  const layout = useRef<Layout | null>(null),
    drag = useRef<Drag | null>(null);
  const [box, setBox] = useState({ w: 600, h: 400 });
  const [flipKey, setFlipKey] = useState(0);
  const [dragging, setDragging] = useState(false);

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
  const instax = !!sizeOf(design).instax;

  useEffect(() => {
    if (cv.current)
      layout.current = renderCard(cv.current, side, scale * dpr, bleed, { d: design, photos }, { hint: true, guides });
  }, [design, photos, side, guides, scale, dpr, bleed, fontTick, flipKey]);

  const hit = (x: number, y: number): { d: Rect; ph: Photo } | null => {
    const L = layout.current,
      list = getState().photos;
    if (!L || side !== 'front' || !list.length || !cv.current) return null;
    const r = cv.current.getBoundingClientRect(),
      px = ((x - r.left) * cv.current.width) / r.width,
      py = ((y - r.top) * cv.current.height) / r.height;
    for (let i = L.slots.length - 1; i >= 0; i--) {
      const d = L.slots[i].d;
      if (px >= d.x && px <= d.x + d.w && py >= d.y && py <= d.y + d.h) return { d, ph: list[i % list.length] };
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
            onChange={(v) => {
              setUI({ side: v });
              setFlipKey((k) => k + 1);
            }}
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
        <div className="pill">
          <button type="button" className="pbtn" onClick={() => void open3D()}>
            <CubeIcon />
            3D view
          </button>
        </div>
      </div>
      <div className="cardwrap" ref={wrap}>
        <canvas
          key={flipKey}
          ref={cv}
          role="img"
          aria-label={`${side === 'front' ? 'Front' : 'Back'} of the postcard`}
          className={`${flipKey ? 'flip' : ''} ${draggable ? 'draggable' : ''} ${dragging ? 'dragging' : ''}`}
          style={{ width: tw * scale, height: th * scale, borderRadius: instax && !guides ? 3 * scale : 2 }}
          onPointerDown={(e) => {
            const h = hit(e.clientX, e.clientY);
            if (!h) return;
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
      <p className="caption">
        {side === 'front' ? 'Front' : 'Back'}, {sizeOf(design).name}, {Math.round(w * 10) / 10} × {Math.round(h * 10) / 10} mm
        {guides ? `, shown with ${design.exp.bleed} mm bleed` : ''}
      </p>
    </section>
  );
}
