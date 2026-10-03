import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { addStroke, handleAt, hitLayer, layerBox, rotationFor, scaleLayer, type Box, type DrawLayer, type Layer } from '../../engine/layers';
import { ensureFonts } from '../../lib/fonts';
import { brushWidth, type LayerTools } from '../../state/instagram';

/*
 * Pointer and keyboard editing of layers on a preview canvas, shared by the photo and video editors. Coordinates are
 * the canvas's own pixels, so layers (stored as shares of the frame) map 1:1 to what is drawn. With the draw tool a
 * stroke goes into the selected drawing (or a new one); otherwise a press picks the topmost layer under the pointer and
 * drags it, or its resize / rotate handle when it is selected. A press on no layer goes to `onBackground` (the photo
 * editor pans the photo with it). With the mask tool (photo editor) every press, move and release goes to `onMask`.
 */

export interface LayerPointerOptions {
  canvas: RefObject<HTMLCanvasElement | null>;
  layers: Layer[];
  selected: string | null;
  tools: LayerTools;
  /** Video: the playhead, so only layers showing now can be picked. */
  t?: number;
  onSelect: (id: string | null) => void;
  /** A changed layer; `key` groups one drag into one undo step. */
  onUpdate: (id: string, layer: Layer, key: string) => void;
  /** All layers replaced (a stroke drawn); `select` is the drawing to select. */
  onSetLayers: (layers: Layer[], key: string, select: string) => void;
  onRemove: (id: string) => void;
  /** Ends an undo step (pointer up), so the next drag is its own step. */
  onEndStep?: () => void;
  /** The mask brush: canvas pixels of the press and each move, and the release. */
  onMask?: {
    down: (x: number, y: number, W: number, H: number) => void;
    move: (x: number, y: number) => void;
    up: () => void;
  };
  onBackground?: {
    down: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
    move: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
    up: () => void;
    key?: (e: ReactKeyboardEvent<HTMLCanvasElement>) => boolean;
  };
}

type Drag =
  | { mode: 'move' | 'resize' | 'rotate'; id: string; orig: Layer; box: Box; x0: number; y0: number; key: string }
  | { mode: 'draw'; base: DrawLayer | null; pts: number[]; key: string; others: Layer[]; index: number }
  | { mode: 'background' }
  | { mode: 'mask' };

let dragSeq = 0;

/** Canvas pixels for a pointer event. */
function at(cv: HTMLCanvasElement, e: { clientX: number; clientY: number }): [number, number] {
  const r = cv.getBoundingClientRect();
  return [((e.clientX - r.left) * cv.width) / r.width, ((e.clientY - r.top) * cv.height) / r.height];
}
/** Handle radius in canvas pixels (about 8 screen pixels at any zoom). */
export const handleRadius = (cv: HTMLCanvasElement) => 8 * (cv.width / Math.max(1, cv.getBoundingClientRect().width));

export function useLayerPointer(o: LayerPointerOptions) {
  const drag = useRef<Drag | null>(null);
  const opts = useRef(o);
  opts.current = o;

  const ctx = () => o.canvas.current?.getContext('2d') ?? null;

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget,
      x = ctx();
    if (!x) return;
    cv.setPointerCapture(e.pointerId);
    cv.focus({ preventScroll: true });
    const [px, py] = at(cv, e),
      W = cv.width,
      H = cv.height;
    const { layers, selected, tools, t } = opts.current;
    if (tools.tool === 'mask' && opts.current.onMask) {
      drag.current = { mode: 'mask' };
      opts.current.onMask.down(px, py, W, H);
      return;
    }
    if (tools.tool === 'draw') {
      const sel = layers.find((l) => l.id === selected);
      const base = sel && sel.kind === 'draw' && sel.rot === 0 && (t === undefined || ((sel.start ?? 0) <= t && t < (sel.end ?? Infinity))) ? sel : null;
      const index = base ? layers.indexOf(base) : layers.length;
      drag.current = { mode: 'draw', base, pts: [px, py], key: `stroke:${++dragSeq}`, others: layers.filter((l) => l !== base), index };
      paintStroke(W, H);
      return;
    }
    const r = handleRadius(cv);
    const sel = layers.find((l) => l.id === selected);
    if (sel) {
      const box = layerBox(x, sel, W, H),
        h = handleAt(box, px, py, r);
      if (h) {
        drag.current = { mode: h, id: sel.id, orig: sel, box, x0: px, y0: py, key: `${h}:${++dragSeq}` };
        return;
      }
    }
    const hit = hitLayer(x, layers, px, py, W, H, r * 0.5, t);
    if (hit) {
      if (hit.id !== selected) opts.current.onSelect(hit.id);
      drag.current = { mode: 'move', id: hit.id, orig: hit, box: layerBox(x, hit, W, H), x0: px, y0: py, key: `move:${++dragSeq}` };
      return;
    }
    if (selected) opts.current.onSelect(null);
    drag.current = { mode: 'background' };
    opts.current.onBackground?.down(e);
  };

  /** Rebuilds the drawing with the stroke in progress. */
  const paintStroke = (W: number, H: number) => {
    const d = drag.current;
    if (!d || d.mode !== 'draw') return;
    const { tools, t } = opts.current;
    let layer = addStroke(d.base, d.pts, tools.brush, tools.brushColor, W, H, brushWidth(tools) * W);
    if (!layer) return;
    // A new drawing on a video shows from the playhead to the end, like other new layers.
    if (!d.base && t !== undefined) layer = { ...layer, start: Math.max(0, t) };
    const out = d.others.slice();
    out.splice(d.index, 0, layer);
    opts.current.onSetLayers(out, d.key, layer.id);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current,
      cv = e.currentTarget;
    if (!d) return;
    if (d.mode === 'background') return opts.current.onBackground?.move(e);
    const [px, py] = at(cv, e),
      W = cv.width,
      H = cv.height;
    if (d.mode === 'mask') return opts.current.onMask?.move(px, py);
    if (d.mode === 'draw') {
      const n = d.pts.length;
      // Skip points closer than a pixel: smoother lines, smaller files.
      if (Math.hypot(px - d.pts[n - 2], py - d.pts[n - 1]) < 1.5) return;
      d.pts.push(px, py);
      paintStroke(W, H);
      return;
    }
    let next: Layer;
    if (d.mode === 'move') {
      let nx = d.orig.x + (px - d.x0) / W,
        ny = d.orig.y + (py - d.y0) / H;
      // Snap to the centre lines.
      if (Math.abs(nx - 0.5) < 0.012) nx = 0.5;
      if (Math.abs(ny - 0.5) < 0.012) ny = 0.5;
      next = { ...d.orig, x: nx, y: ny };
    } else if (d.mode === 'resize') {
      const f = Math.hypot(px - d.box.cx, py - d.box.cy) / Math.max(1, Math.hypot(d.x0 - d.box.cx, d.y0 - d.box.cy));
      next = scaleLayer(d.orig, f);
    } else next = { ...d.orig, rot: rotationFor(d.box, px, py) };
    opts.current.onUpdate(d.id, next, d.key);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === 'background') opts.current.onBackground?.up();
    if (d?.mode === 'mask') opts.current.onMask?.up();
    opts.current.onEndStep?.();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const { layers, selected } = opts.current;
    const sel = layers.find((l) => l.id === selected);
    if (sel) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        opts.current.onRemove(sel.id);
        return;
      }
      if (e.key === 'Escape') {
        opts.current.onSelect(null);
        return;
      }
      const step = e.shiftKey ? 0.05 : 0.01;
      const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (move[e.key]) {
        e.preventDefault();
        opts.current.onUpdate(sel.id, { ...sel, x: sel.x + move[e.key][0], y: sel.y + move[e.key][1] }, `nudge:${sel.id}`);
        return;
      }
      if (e.key === '+' || e.key === '=' || e.key === '-') {
        e.preventDefault();
        opts.current.onUpdate(sel.id, scaleLayer(sel, e.key === '-' ? 0.95 : 1.05), `size:${sel.id}`);
        return;
      }
    }
    opts.current.onBackground?.key?.(e);
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown };
}

/** A number that changes whenever web fonts finish loading, and loads the fonts the layers use: redraw on change. */
export function useFontsTick(layers: Layer[]): number {
  const [tick, setTick] = useState(0);
  const fonts = [...new Set(layers.flatMap((l) => (l.kind === 'text' || l.kind === 'shape' ? [l.font] : [])))].join('|');
  useEffect(() => {
    if (fonts) void ensureFonts(fonts.split('|')).then(() => setTick((n) => n + 1));
  }, [fonts]);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    document.fonts.addEventListener('loadingdone', on);
    return () => document.fonts.removeEventListener('loadingdone', on);
  }, []);
  return tick;
}
