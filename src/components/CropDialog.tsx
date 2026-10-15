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
  const cropId = useApp((state) => state.ui.cropId);
  const photo = useApp((state) => state.photos.find((candidate) => candidate.id === state.ui.cropId) ?? null);
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
    const computed = computeLayout(design.layout, { x: 0, y: 0, w, h, e: 0 }, design),
      index = photos.findIndex((candidate) => candidate.id === cropId),
      count = photos.length || 1;
    const slot = computed.slots.find((_, slotIndex) => slotIndex % count === index);
    return slot ? slot.w / slot.h : w / h;
  }, [aspect, cropId]);

  const draw = useCallback(() => {
    const context = cv.current?.getContext('2d'),
      view = st.current;
    if (!context || !view.disp || !cv.current || !photo) return;
    const scale = cv.current.width / view.DW,
      cr = view.cr;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, cv.current.width, cv.current.height);
    context.drawImage(view.disp, 0, 0);
    context.scale(scale, scale);
    context.fillStyle = 'rgba(0,0,0,.55)';
    context.beginPath();
    context.rect(0, 0, view.DW, view.DH);
    context.rect(cr.x, cr.y, cr.w, cr.h);
    context.fill('evenodd');
    context.strokeStyle = '#fff';
    context.lineWidth = 1.5;
    context.strokeRect(cr.x, cr.y, cr.w, cr.h);
    context.strokeStyle = 'rgba(255,255,255,.45)';
    context.lineWidth = 1;
    context.beginPath();
    for (let third = 1; third < 3; third++) {
      context.moveTo(cr.x + (cr.w * third) / 3, cr.y);
      context.lineTo(cr.x + (cr.w * third) / 3, cr.y + cr.h);
      context.moveTo(cr.x, cr.y + (cr.h * third) / 3);
      context.lineTo(cr.x + cr.w, cr.y + (cr.h * third) / 3);
    }
    context.stroke();
    context.fillStyle = '#fff';
    for (const [cornerX, cornerY] of [
      [cr.x, cr.y],
      [cr.x + cr.w, cr.y],
      [cr.x, cr.y + cr.h],
      [cr.x + cr.w, cr.y + cr.h],
    ])
      context.fillRect(cornerX - 6, cornerY - 6, 12, 12);
    const original = photo.orig,
      rw = rot % 180 ? original.naturalHeight : original.naturalWidth,
      rh = rot % 180 ? original.naturalWidth : original.naturalHeight;
    setInfo(`Crop keeps ${Math.round((cr.w / view.DW) * rw)}×${Math.round((cr.h / view.DH) * rh)} px of the original.`);
  }, [photo, rot]);

  const fullCrop = useCallback(() => {
    const view = st.current,
      ratio = aspectValue();
    if (!ratio) {
      view.cr = { x: 0, y: 0, w: view.DW, h: view.DH };
      return;
    }
    let width = view.DW,
      height = width / ratio;
    if (height > view.DH) {
      height = view.DH;
      width = height * ratio;
    }
    view.cr = { x: (view.DW - width) / 2, y: (view.DH - height) / 2, w: width, h: height };
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
      const original = photo.orig,
        iw = original.naturalWidth,
        ih = original.naturalHeight,
        rw = rot % 180 ? ih : iw,
        rh = rot % 180 ? iw : ih;
      const box = stage.current,
        el = cv.current,
        view = st.current;
      if (!box || !el) return;
      const sc = Math.min((box.clientWidth - 24) / rw, (box.clientHeight - 24) / rh, 1),
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.DW = Math.max(40, rw * sc);
      view.DH = Math.max(40, rh * sc);
      el.style.width = `${view.DW}px`;
      el.style.height = `${view.DH}px`;
      el.width = Math.round(view.DW * dpr);
      el.height = Math.round(view.DH * dpr);
      const output = document.createElement('canvas');
      output.width = el.width;
      output.height = el.height;
      const x = output.getContext('2d');
      if (!x) return;
      const scale = output.width / rw;
      x.imageSmoothingQuality = 'high';
      x.scale(scale, scale);
      x.translate(rw / 2, rh / 2);
      x.rotate((rot * Math.PI) / 180);
      if (flip) x.scale(-1, 1);
      x.drawImage(original, -iw / 2, -ih / 2);
      view.disp = output;
      if (view.first) {
        const crop = photo.crop;
        view.cr = { x: crop.x * view.DW, y: crop.y * view.DH, w: crop.w * view.DW, h: crop.h * view.DH };
        view.first = false;
      } else fullCrop();
      draw();
      el.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [photo, cropId, rot, flip, fullCrop, draw]);

  const chooseAspect = (choice: Aspect) => {
    setAspect(choice);
  };
  useEffect(() => {
    if (!st.current.first && st.current.disp) {
      fullCrop();
      draw();
    }
  }, [aspect, fullCrop, draw]);

  const pos = (event: PointerEvent) => {
    const box = cv.current!.getBoundingClientRect(),
      view = st.current;
    return [
      ((event.clientX - box.left) * view.DW) / box.width,
      ((event.clientY - box.top) * view.DH) / box.height,
    ] as const;
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
    patchPhoto(photo.id, {
      rot,
      flip,
      crop: { x: cr.x / DW, y: cr.y / DH, w: cr.w / DW, h: cr.h / DH },
      zoom: 1,
      px: 0,
      py: 0,
    });
    dlg.current?.close();
    toast('Crop applied.');
  };

  return (
    <dialog className="crop" ref={dlg} aria-labelledby="cropTitle" onClose={() => setUI({ cropId: null })}>
      <div className="dhead">
        <h2 id="cropTitle">Crop photo</h2>
        <button type="button" className="btn" onClick={() => setRot((turn) => (turn + 270) % 360)}>
          ⟲ Rotate left
        </button>
        <button type="button" className="btn" onClick={() => setRot((turn) => (turn + 90) % 360)}>
          ⟳ Rotate right
        </button>
        <button type="button" className="btn" onClick={() => setFlip((flipped) => !flipped)}>
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
          {ASPECTS.map(([label, value]) => (
            <button
              key={label}
              type="button"
              className="chip"
              aria-pressed={aspect === value}
              style={aspect === value ? { background: 'var(--text)', color: 'var(--panel)' } : undefined}
              onClick={() => chooseAspect(value)}
            >
              {label}
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
          onPointerDown={(event) => {
            const [mx, my] = pos(event),
              view = st.current,
              cr = view.cr;
            event.currentTarget.setPointerCapture(event.pointerId);
            const hit = corners(cr).find(
              ([, cornerX, cornerY]) => Math.abs(mx - cornerX) < HANDLE && Math.abs(my - cornerY) < HANDLE,
            );
            if (hit)
              view.act = {
                t: 'resize',
                ax: hit[0].includes('l') ? cr.x + cr.w : cr.x,
                ay: hit[0].includes('t') ? cr.y + cr.h : cr.y,
              };
            else if (mx >= cr.x && mx <= cr.x + cr.w && my >= cr.y && my <= cr.y + cr.h)
              view.act = { t: 'move', sx: mx, sy: my, ox: cr.x, oy: cr.y };
            else view.act = { t: 'resize', ax: mx, ay: my };
          }}
          onPointerMove={(event) => {
            const [mx, my] = pos(event),
              view = st.current,
              active = view.act;
            if (!active) {
              const on = corners(view.cr).some(([, x, y]) => Math.abs(mx - x) < HANDLE && Math.abs(my - y) < HANDLE);
              event.currentTarget.style.cursor = on ? 'nwse-resize' : 'move';
              return;
            }
            if (active.t === 'move') {
              view.cr = {
                ...view.cr,
                x: Math.max(0, Math.min(view.DW - view.cr.w, active.ox + mx - active.sx)),
                y: Math.max(0, Math.min(view.DH - view.cr.h, active.oy + my - active.sy)),
              };
            } else {
              const asp = aspectValue(),
                sx = mx < active.ax ? -1 : 1,
                sy = my < active.ay ? -1 : 1;
              let width = Math.min(Math.abs(mx - active.ax), sx < 0 ? active.ax : view.DW - active.ax),
                height = Math.min(Math.abs(my - active.ay), sy < 0 ? active.ay : view.DH - active.ay);
              if (asp) {
                if (width / height > asp) width = height * asp;
                else height = width / asp;
              }
              width = Math.max(width, 20);
              height = Math.max(height, 20);
              view.cr = {
                x: sx < 0 ? active.ax - width : active.ax,
                y: sy < 0 ? active.ay - height : active.ay,
                w: width,
                h: height,
              };
            }
            draw();
          }}
          onPointerUp={() => {
            st.current.act = null;
          }}
          onPointerCancel={() => {
            st.current.act = null;
          }}
          onKeyDown={(event) => {
            const nudge = (
              { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<
                string,
                [number, number]
              >
            )[event.key];
            if (!nudge) return;
            event.preventDefault();
            const view = st.current,
              step = event.shiftKey ? 20 : 4;
            view.cr = {
              ...view.cr,
              x: Math.max(0, Math.min(view.DW - view.cr.w, view.cr.x + nudge[0] * step)),
              y: Math.max(0, Math.min(view.DH - view.cr.h, view.cr.y + nudge[1] * step)),
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
