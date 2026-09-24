import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { cardMM } from '../engine/design';
import { computeLayout } from '../engine/layout';
import { toast } from '../lib/toast';
import { getState, patchPhoto, setUI, useApp } from '../state/store';
import type { Rect } from '../types';

type Aspect = number | 'fit';
const ASPECTS: [string, Aspect][] = [
  ['Free', 0],
  ['Fit this layout', 'fit'],
  ['1:1', 1],
  ['4:5', 0.8],
  ['3:4', 0.75],
  ['2:3', 2 / 3],
  ['4:3', 4 / 3],
  ['3:2', 1.5],
  ['16:9', 16 / 9],
];
type Action = { t: 'move'; sx: number; sy: number; ox: number; oy: number } | { t: 'resize'; ax: number; ay: number };
const HANDLE = 16;

export function CropDialog() {
  const cropId = useApp((s) => s.ui.cropId);
  const photo = useApp((s) => s.photos.find((p) => p.id === s.ui.cropId) ?? null);
  const dlg = useRef<HTMLDialogElement>(null),
    cv = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const st = useRef({
    DW: 0,
    DH: 0,
    cr: { x: 0, y: 0, w: 0, h: 0 } as Rect,
    disp: null as HTMLCanvasElement | null,
    act: null as Action | null,
    first: true,
  });
  const [rot, setRot] = useState(0),
    [flip, setFlip] = useState(false),
    [aspect, setAspect] = useState<Aspect>(0),
    [info, setInfo] = useState('');

  const aspectValue = useCallback((): number => {
    if (aspect !== 'fit') return aspect;
    const { design, photos } = getState(),
      { w, h } = cardMM(design);
    const L = computeLayout(design.layout, { x: 0, y: 0, w, h, e: 0 }, design),
      i = photos.findIndex((p) => p.id === cropId),
      n = photos.length || 1;
    const s = L.slots.find((_, k) => k % n === i);
    return s ? s.w / s.h : w / h;
  }, [aspect, cropId]);

  const draw = useCallback(() => {
    const c = cv.current?.getContext('2d'),
      s = st.current;
    if (!c || !s.disp || !cv.current || !photo) return;
    const k = cv.current.width / s.DW,
      cr = s.cr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.current.width, cv.current.height);
    c.drawImage(s.disp, 0, 0);
    c.scale(k, k);
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.beginPath();
    c.rect(0, 0, s.DW, s.DH);
    c.rect(cr.x, cr.y, cr.w, cr.h);
    c.fill('evenodd');
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.strokeRect(cr.x, cr.y, cr.w, cr.h);
    c.strokeStyle = 'rgba(255,255,255,.45)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 3; i++) {
      c.moveTo(cr.x + (cr.w * i) / 3, cr.y);
      c.lineTo(cr.x + (cr.w * i) / 3, cr.y + cr.h);
      c.moveTo(cr.x, cr.y + (cr.h * i) / 3);
      c.lineTo(cr.x + cr.w, cr.y + (cr.h * i) / 3);
    }
    c.stroke();
    c.fillStyle = '#fff';
    for (const [a, b] of [
      [cr.x, cr.y],
      [cr.x + cr.w, cr.y],
      [cr.x, cr.y + cr.h],
      [cr.x + cr.w, cr.y + cr.h],
    ])
      c.fillRect(a - 6, b - 6, 12, 12);
    const o = photo.orig,
      rw = rot % 180 ? o.naturalHeight : o.naturalWidth,
      rh = rot % 180 ? o.naturalWidth : o.naturalHeight;
    setInfo(`Crop keeps ${Math.round((cr.w / s.DW) * rw)}×${Math.round((cr.h / s.DH) * rh)} px of the original.`);
  }, [photo, rot]);

  const fullCrop = useCallback(() => {
    const s = st.current,
      a = aspectValue();
    if (!a) {
      s.cr = { x: 0, y: 0, w: s.DW, h: s.DH };
      return;
    }
    let w = s.DW,
      h = w / a;
    if (h > s.DH) {
      h = s.DH;
      w = h * a;
    }
    s.cr = { x: (s.DW - w) / 2, y: (s.DH - h) / 2, w, h };
  }, [aspectValue]);

  // Open / close with the store.
  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    if (cropId && photo) {
      setRot(photo.rot);
      setFlip(photo.flip);
      setAspect(0);
      st.current.first = true;
      if (!el.open) el.showModal();
    } else if (el.open) el.close();
    // Runs only when a different photo is opened; later photo edits must not reset the tool.
  }, [cropId]);

  // Build the rotated preview image whenever the photo, rotation or mirroring changes.
  useEffect(() => {
    if (!photo || !cropId) return;
    const id = requestAnimationFrame(() => {
      const o = photo.orig,
        iw = o.naturalWidth,
        ih = o.naturalHeight,
        rw = rot % 180 ? ih : iw,
        rh = rot % 180 ? iw : ih;
      const box = stage.current,
        el = cv.current,
        s = st.current;
      if (!box || !el) return;
      const sc = Math.min((box.clientWidth - 24) / rw, (box.clientHeight - 24) / rh, 1),
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.DW = Math.max(40, rw * sc);
      s.DH = Math.max(40, rh * sc);
      el.style.width = `${s.DW}px`;
      el.style.height = `${s.DH}px`;
      el.width = Math.round(s.DW * dpr);
      el.height = Math.round(s.DH * dpr);
      const d = document.createElement('canvas');
      d.width = el.width;
      d.height = el.height;
      const x = d.getContext('2d');
      if (!x) return;
      const k = d.width / rw;
      x.imageSmoothingQuality = 'high';
      x.scale(k, k);
      x.translate(rw / 2, rh / 2);
      x.rotate((rot * Math.PI) / 180);
      if (flip) x.scale(-1, 1);
      x.drawImage(o, -iw / 2, -ih / 2);
      s.disp = d;
      if (s.first) {
        const c = photo.crop;
        s.cr = { x: c.x * s.DW, y: c.y * s.DH, w: c.w * s.DW, h: c.h * s.DH };
        s.first = false;
      } else fullCrop();
      draw();
      el.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [photo, cropId, rot, flip, fullCrop, draw]);

  const chooseAspect = (a: Aspect) => {
    setAspect(a);
  };
  useEffect(() => {
    if (!st.current.first && st.current.disp) {
      fullCrop();
      draw();
    }
  }, [aspect, fullCrop, draw]);

  const pos = (e: PointerEvent) => {
    const r = cv.current!.getBoundingClientRect(),
      s = st.current;
    return [((e.clientX - r.left) * s.DW) / r.width, ((e.clientY - r.top) * s.DH) / r.height] as const;
  };
  const corners = (cr: Rect) =>
    [
      ['tl', cr.x, cr.y],
      ['tr', cr.x + cr.w, cr.y],
      ['bl', cr.x, cr.y + cr.h],
      ['br', cr.x + cr.w, cr.y + cr.h],
    ] as const;

  const apply = () => {
    if (!photo) return;
    const { cr, DW, DH } = st.current;
    patchPhoto(photo.id, { rot, flip, crop: { x: cr.x / DW, y: cr.y / DH, w: cr.w / DW, h: cr.h / DH }, zoom: 1, px: 0, py: 0 });
    dlg.current?.close();
    toast('Crop applied.');
  };

  return (
    <dialog className="crop" ref={dlg} aria-labelledby="cropTitle" onClose={() => setUI({ cropId: null })}>
      <div className="dhead">
        <h2 id="cropTitle">Crop photo</h2>
        <button type="button" className="btn" onClick={() => setRot((r) => (r + 270) % 360)}>
          ⟲ Rotate left
        </button>
        <button type="button" className="btn" onClick={() => setRot((r) => (r + 90) % 360)}>
          ⟳ Rotate right
        </button>
        <button type="button" className="btn" onClick={() => setFlip((f) => !f)}>
          Mirror
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setRot(0);
            setFlip(false);
            setAspect(0);
            st.current.first = false;
            if (!rot && !flip) {
              fullCrop();
              draw();
            }
          }}
        >
          Reset
        </button>
      </div>
      <div className="dhead">
        <span className="hint">Shape</span>
        <div className="chips">
          {ASPECTS.map(([l, v]) => (
            <button
              key={l}
              type="button"
              className="chip"
              aria-pressed={aspect === v}
              style={aspect === v ? { background: 'var(--text)', color: 'var(--panel)' } : undefined}
              onClick={() => chooseAspect(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="cropstage" ref={stage}>
        <canvas
          ref={cv}
          id="cropCv"
          tabIndex={0}
          aria-label="Crop area. Drag to move, drag corners to resize, arrow keys to nudge."
          onPointerDown={(e) => {
            const [mx, my] = pos(e),
              s = st.current,
              cr = s.cr;
            e.currentTarget.setPointerCapture(e.pointerId);
            const hit = corners(cr).find(([, a, b]) => Math.abs(mx - a) < HANDLE && Math.abs(my - b) < HANDLE);
            if (hit)
              s.act = {
                t: 'resize',
                ax: hit[0].includes('l') ? cr.x + cr.w : cr.x,
                ay: hit[0].includes('t') ? cr.y + cr.h : cr.y,
              };
            else if (mx >= cr.x && mx <= cr.x + cr.w && my >= cr.y && my <= cr.y + cr.h)
              s.act = { t: 'move', sx: mx, sy: my, ox: cr.x, oy: cr.y };
            else s.act = { t: 'resize', ax: mx, ay: my };
          }}
          onPointerMove={(e) => {
            const [mx, my] = pos(e),
              s = st.current,
              a = s.act;
            if (!a) {
              const on = corners(s.cr).some(([, x, y]) => Math.abs(mx - x) < HANDLE && Math.abs(my - y) < HANDLE);
              e.currentTarget.style.cursor = on ? 'nwse-resize' : 'move';
              return;
            }
            if (a.t === 'move') {
              s.cr = {
                ...s.cr,
                x: Math.max(0, Math.min(s.DW - s.cr.w, a.ox + mx - a.sx)),
                y: Math.max(0, Math.min(s.DH - s.cr.h, a.oy + my - a.sy)),
              };
            } else {
              const asp = aspectValue(),
                sx = mx < a.ax ? -1 : 1,
                sy = my < a.ay ? -1 : 1;
              let w = Math.min(Math.abs(mx - a.ax), sx < 0 ? a.ax : s.DW - a.ax),
                h = Math.min(Math.abs(my - a.ay), sy < 0 ? a.ay : s.DH - a.ay);
              if (asp) {
                if (w / h > asp) w = h * asp;
                else h = w / asp;
              }
              w = Math.max(w, 20);
              h = Math.max(h, 20);
              s.cr = { x: sx < 0 ? a.ax - w : a.ax, y: sy < 0 ? a.ay - h : a.ay, w, h };
            }
            draw();
          }}
          onPointerUp={() => {
            st.current.act = null;
          }}
          onPointerCancel={() => {
            st.current.act = null;
          }}
          onKeyDown={(e) => {
            const k = (
              { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>
            )[e.key];
            if (!k) return;
            e.preventDefault();
            const s = st.current,
              step = e.shiftKey ? 20 : 4;
            s.cr = {
              ...s.cr,
              x: Math.max(0, Math.min(s.DW - s.cr.w, s.cr.x + k[0] * step)),
              y: Math.max(0, Math.min(s.DH - s.cr.h, s.cr.y + k[1] * step)),
            };
            draw();
          }}
        />
      </div>
      <div className="dfoot">
        <span className="hint">{info}</span>
        <button type="button" className="btn" onClick={() => dlg.current?.close()}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={apply}>
          Apply crop
        </button>
      </div>
    </dialog>
  );
}
