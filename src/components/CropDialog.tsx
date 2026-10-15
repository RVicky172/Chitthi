import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { cardMM } from '../engine/design';
import { computeLayout } from '../engine/layout';
import { toast } from '../lib/toast';
import { getState, patchPhoto, setUI, useApp } from '../state/store';
import {
  cornerAt,
  draggedCrop,
  fittedCrop,
  nudgedCrop,
  paintCrop,
  pressAction,
  rotatedPhoto,
  type Aspect,
  type CropView,
} from './cropGeometry';

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

/**
 * A pointer's position over the canvas in display pixels.
 * @param event the pointer event on the canvas
 * @param view the crop tool's state (its display size)
 * @returns x and y
 */
function displayPoint(event: PointerEvent<HTMLCanvasElement>, view: CropView): [number, number] {
  const box = event.currentTarget.getBoundingClientRect();
  return [((event.clientX - box.left) * view.DW) / box.width, ((event.clientY - box.top) * view.DH) / box.height];
}

/**
 * The shape of the photo's slot in the current layout.
 * @param photoId the photo
 * @returns the slot's width ÷ height (the card's when the photo has no slot)
 */
function slotAspect(photoId: string | null): number {
  const { design, photos } = getState(),
    { w, h } = cardMM(design);
  const computed = computeLayout(design.layout, { x: 0, y: 0, w, h, e: 0 }, design),
    index = photos.findIndex((candidate) => candidate.id === photoId),
    count = photos.length || 1;
  const slot = computed.slots.find((_, slotIndex) => slotIndex % count === index);
  return slot ? slot.w / slot.h : w / h;
}

/** The crop tool: turn, mirror and crop the photo opened from the studio, in a free or fixed shape. */
export function CropDialog() {
  const cropId = useApp((state) => state.ui.cropId);
  const photo = useApp((state) => state.photos.find((candidate) => candidate.id === state.ui.cropId) ?? null);
  const dlg = useRef<HTMLDialogElement>(null),
    cv = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const st = useRef<CropView>({ DW: 0, DH: 0, cr: { x: 0, y: 0, w: 0, h: 0 }, disp: null, act: null, first: true });
  const [rot, setRot] = useState(0),
    [flip, setFlip] = useState(false),
    [aspect, setAspect] = useState<Aspect>(0),
    [info, setInfo] = useState('');

  const aspectValue = useCallback((): number => (aspect === 'fit' ? slotAspect(cropId) : aspect), [aspect, cropId]);

  const draw = useCallback(() => {
    const context = cv.current?.getContext('2d'),
      view = st.current;
    if (!context || !view.disp || !cv.current || !photo) return;
    paintCrop(context, view, cv.current.width / view.DW);
    const original = photo.orig,
      turnedW = rot % 180 ? original.naturalHeight : original.naturalWidth,
      turnedH = rot % 180 ? original.naturalWidth : original.naturalHeight,
      box = view.cr;
    setInfo(
      `Crop keeps ${Math.round((box.w / view.DW) * turnedW)}×${Math.round((box.h / view.DH) * turnedH)} px of the original.`,
    );
  }, [photo, rot]);

  const fullCrop = useCallback(() => {
    const view = st.current;
    view.cr = fittedCrop(view.DW, view.DH, aspectValue());
  }, [aspectValue]);

  // Open / close with the store.
  useEffect(() => {
    const dialog = dlg.current;
    if (!dialog) return;
    if (cropId && photo) {
      setRot(photo.rot);
      setFlip(photo.flip);
      setAspect(0);
      st.current.first = true;
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) dialog.close();
    // Runs only when a different photo is opened; later photo edits must not reset the tool.
  }, [cropId]);

  // Build the rotated preview image whenever the photo, rotation or mirroring changes.
  useEffect(() => {
    if (!photo || !cropId) return;
    const frame = requestAnimationFrame(() => {
      const original = photo.orig,
        turnedW = rot % 180 ? original.naturalHeight : original.naturalWidth,
        turnedH = rot % 180 ? original.naturalWidth : original.naturalHeight;
      const box = stage.current,
        canvas = cv.current,
        view = st.current;
      if (!box || !canvas) return;
      const scale = Math.min((box.clientWidth - 24) / turnedW, (box.clientHeight - 24) / turnedH, 1),
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.DW = Math.max(40, turnedW * scale);
      view.DH = Math.max(40, turnedH * scale);
      canvas.style.width = `${view.DW}px`;
      canvas.style.height = `${view.DH}px`;
      canvas.width = Math.round(view.DW * dpr);
      canvas.height = Math.round(view.DH * dpr);
      const preview = rotatedPhoto(original, rot, flip, canvas.width, canvas.height);
      if (!preview) return;
      view.disp = preview;
      if (view.first) {
        const crop = photo.crop;
        view.cr = { x: crop.x * view.DW, y: crop.y * view.DH, w: crop.w * view.DW, h: crop.h * view.DH };
        view.first = false;
      } else fullCrop();
      draw();
      canvas.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [photo, cropId, rot, flip, fullCrop, draw]);

  useEffect(() => {
    if (!st.current.first && st.current.disp) {
      fullCrop();
      draw();
    }
  }, [aspect, fullCrop, draw]);

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
  const reset = () => {
    setRot(0);
    setFlip(false);
    setAspect(0);
    st.current.first = false;
    if (!rot && !flip) {
      fullCrop();
      draw();
    }
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
        <button type="button" className="btn" onClick={reset}>
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
              onClick={() => setAspect(value)}
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
            const [x, y] = displayPoint(event, st.current);
            event.currentTarget.setPointerCapture(event.pointerId);
            st.current.act = pressAction(st.current.cr, x, y);
          }}
          onPointerMove={(event) => {
            const [x, y] = displayPoint(event, st.current),
              view = st.current,
              action = view.act;
            if (!action) {
              event.currentTarget.style.cursor = cornerAt(view.cr, x, y) ? 'nwse-resize' : 'move';
              return;
            }
            view.cr = draggedCrop(view, action, x, y, aspectValue());
            draw();
          }}
          onPointerUp={() => {
            st.current.act = null;
          }}
          onPointerCancel={() => {
            st.current.act = null;
          }}
          onKeyDown={(event) => {
            const moved = nudgedCrop(st.current, event.key, event.shiftKey);
            if (!moved) return;
            event.preventDefault();
            st.current.cr = moved;
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
