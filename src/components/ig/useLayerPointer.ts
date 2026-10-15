import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { addStroke, scaleLayer, type Box, type DrawLayer, type Layer } from '../../engine/layers';
import { handleAt, hitLayer, rotationFor } from '../../engine/layerPick';
import { layerBox } from '../../engine/layerDraw';
import { ensureFonts } from '../../lib/fonts';
import { brushWidth, type LayerTools } from '../../state/instagram';

/*
 * Pointer and keyboard editing of layers on a preview canvas, shared by the photo and video editors. Coordinates are
 * the canvas's own pixels, so layers (stored as shares of the frame) map 1:1 to what is drawn. With the draw tool a
 * stroke goes into the selected drawing (or a new one); otherwise a press picks the topmost layer under the pointer and
 * drags it, or its resize / rotate handle when it is selected. A press on no layer goes to `onBackground` (the photo
 * editor pans the photo with it). With the mask tool (photo editor) every press, move and release goes to `onMask`.
 */

/** The canvas, its layers and the editors' handlers for useLayerPointer. */
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
    down: (x: number, y: number, width: number, height: number) => void;
    move: (x: number, y: number) => void;
    up: () => void;
  };
  onBackground?: {
    down: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
    move: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
    up: () => void;
    key?: (event: ReactKeyboardEvent<HTMLCanvasElement>) => boolean;
  };
}

/** Dragging a layer, or one of its resize / rotate handles, from where the press was. */
interface EditDrag {
  mode: 'move' | 'resize' | 'rotate';
  id: string;
  original: Layer;
  box: Box;
  startX: number;
  startY: number;
  key: string;
}

/** A stroke in progress: the drawing it goes into (or null for a new one), its points and where it sits. */
interface DrawDrag {
  mode: 'draw';
  base: DrawLayer | null;
  points: number[];
  key: string;
  /** The other layers, in order. */
  others: Layer[];
  /** Where the drawing goes among `others`. */
  index: number;
}

type Drag = EditDrag | DrawDrag | { mode: 'background' } | { mode: 'mask' };

let dragSeq = 0;

/**
 * Canvas pixels for a pointer event.
 * @param canvas the canvas
 * @param event the pointer's position on the screen
 * @returns x and y in the canvas's own pixels
 */
function canvasPoint(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): [number, number] {
  const box = canvas.getBoundingClientRect();
  return [
    ((event.clientX - box.left) * canvas.width) / box.width,
    ((event.clientY - box.top) * canvas.height) / box.height,
  ];
}

/**
 * Handle radius in canvas pixels (about 8 screen pixels at any zoom).
 * @param canvas the canvas
 * @returns the radius in its own pixels
 */
export const handleRadius = (canvas: HTMLCanvasElement) =>
  8 * (canvas.width / Math.max(1, canvas.getBoundingClientRect().width));

/**
 * The selected drawing a new stroke goes into: unrotated and (on a video) showing at the playhead; else null.
 * @param layers the layers
 * @param selected the selected layer's id
 * @param time the playhead (video), or undefined
 * @returns the drawing, or null for a new one
 */
function drawingToExtend(layers: Layer[], selected: string | null, time: number | undefined): DrawLayer | null {
  const layer = layers.find((candidate) => candidate.id === selected);
  if (layer?.kind !== 'draw' || layer.rot !== 0) return null;
  const showing = time === undefined || ((layer.start ?? 0) <= time && time < (layer.end ?? Infinity));
  return showing ? layer : null;
}

/**
 * A press with the move tool: a handle of the selected layer, else the topmost layer under the pointer.
 * @param context the preview's 2D context (for measuring text)
 * @param canvas the pressed canvas (its size)
 * @param options the hook's options
 * @param radius the handle radius, canvas pixels
 * @param point the press, canvas pixels
 * @returns the drag, or null when the press is on no layer
 */
function startEdit(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  options: LayerPointerOptions,
  radius: number,
  [x, y]: [number, number],
): EditDrag | null {
  const { layers, selected, t: time } = options;
  const { width, height } = canvas;
  const selectedLayer = layers.find((layer) => layer.id === selected);
  if (selectedLayer) {
    const box = layerBox(context, selectedLayer, width, height),
      handle = handleAt(box, x, y, radius);
    if (handle) {
      const key = `${handle}:${++dragSeq}`;
      return { mode: handle, id: selectedLayer.id, original: selectedLayer, box, startX: x, startY: y, key };
    }
  }
  const hit = hitLayer(context, layers, x, y, width, height, radius * 0.5, time);
  if (!hit) return null;
  if (hit.id !== selected) options.onSelect(hit.id);
  const box = layerBox(context, hit, width, height);
  return { mode: 'move', id: hit.id, original: hit, box, startX: x, startY: y, key: `move:${++dragSeq}` };
}

/**
 * The layer an edit drag makes at a pointer position. Moving snaps to the centre lines.
 * @param drag the drag
 * @param point the pointer, canvas pixels
 * @param width the canvas width
 * @param height the canvas height
 * @returns the changed layer
 */
function draggedLayer(drag: EditDrag, [x, y]: [number, number], width: number, height: number): Layer {
  const { original, box } = drag;
  if (drag.mode === 'move') {
    let nextX = original.x + (x - drag.startX) / width,
      nextY = original.y + (y - drag.startY) / height;
    if (Math.abs(nextX - 0.5) < 0.012) nextX = 0.5;
    if (Math.abs(nextY - 0.5) < 0.012) nextY = 0.5;
    return { ...original, x: nextX, y: nextY };
  }
  if (drag.mode === 'resize') {
    const fromCentre = Math.hypot(x - box.cx, y - box.cy),
      startFromCentre = Math.max(1, Math.hypot(drag.startX - box.cx, drag.startY - box.cy));
    return scaleLayer(original, fromCentre / startFromCentre);
  }
  return { ...original, rot: rotationFor(box, x, y) };
}

/**
 * Keyboard editing of the selected layer: Delete removes it, Escape deselects, arrows nudge (Shift: further), + / -
 * resize.
 * @param options the hook's options
 * @param layer the selected layer
 * @param event the key press
 * @returns whether the key was used
 */
function editWithKey(
  options: LayerPointerOptions,
  layer: Layer,
  event: ReactKeyboardEvent<HTMLCanvasElement>,
): boolean {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    options.onRemove(layer.id);
    return true;
  }
  if (event.key === 'Escape') {
    options.onSelect(null);
    return true;
  }
  const step = event.shiftKey ? 0.05 : 0.01;
  const nudges: Partial<Record<string, [number, number]>> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const nudge = nudges[event.key];
  if (nudge) {
    event.preventDefault();
    options.onUpdate(layer.id, { ...layer, x: layer.x + nudge[0], y: layer.y + nudge[1] }, `nudge:${layer.id}`);
    return true;
  }
  if (event.key === '+' || event.key === '=' || event.key === '-') {
    event.preventDefault();
    options.onUpdate(layer.id, scaleLayer(layer, event.key === '-' ? 0.95 : 1.05), `size:${layer.id}`);
    return true;
  }
  return false;
}

/**
 * A stroke from a press with the draw tool, going into the selected drawing when it can (drawingToExtend).
 * @param options the hook's options
 * @param point the press, canvas pixels
 * @returns the stroke
 */
function startStroke(options: LayerPointerOptions, point: [number, number]): DrawDrag {
  const { layers } = options;
  const base = drawingToExtend(layers, options.selected, options.t);
  const index = base ? layers.indexOf(base) : layers.length;
  const others = layers.filter((_, layerIndex) => layerIndex !== index);
  return { mode: 'draw', base, points: [...point], key: `stroke:${++dragSeq}`, others, index };
}

/**
 * Rebuilds the drawing with the stroke in progress and hands the layers to `onSetLayers`.
 * @param stroke the stroke
 * @param options the hook's options
 * @param width the canvas width
 * @param height the canvas height
 */
function paintStroke(stroke: DrawDrag, options: LayerPointerOptions, width: number, height: number): void {
  const { tools, t: time } = options;
  const lineWidth = brushWidth(tools) * width;
  let layer = addStroke(stroke.base, stroke.points, tools.brush, tools.brushColor, width, height, lineWidth);
  if (!layer) return;
  // A new drawing on a video shows from the playhead to the end, like other new layers.
  if (!stroke.base && time !== undefined) layer = { ...layer, start: Math.max(0, time) };
  const layers = stroke.others.slice();
  layers.splice(stroke.index, 0, layer);
  options.onSetLayers(layers, stroke.key, layer.id);
}

/**
 * Pointer and keyboard handlers for editing layers on a canvas (see the file comment).
 * @param options the canvas, layers, selection, tools and the editors' handlers
 * @returns the handlers to spread on the canvas
 */
export function useLayerPointer(options: LayerPointerOptions) {
  const drag = useRef<Drag | null>(null);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget,
      context = latest.current.canvas.current?.getContext('2d');
    if (!context) return;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    const point = canvasPoint(canvas, event);
    const current = latest.current;
    if (current.tools.tool === 'mask' && current.onMask) {
      drag.current = { mode: 'mask' };
      current.onMask.down(point[0], point[1], canvas.width, canvas.height);
      return;
    }
    if (current.tools.tool === 'draw') {
      const stroke = startStroke(current, point);
      drag.current = stroke;
      paintStroke(stroke, current, canvas.width, canvas.height);
      return;
    }
    drag.current = startEdit(context, canvas, current, handleRadius(canvas), point);
    if (drag.current) return;
    if (current.selected) current.onSelect(null);
    drag.current = { mode: 'background' };
    current.onBackground?.down(event);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current,
      canvas = event.currentTarget;
    if (!current) return;
    if (current.mode === 'background') {
      latest.current.onBackground?.move(event);
      return;
    }
    const point = canvasPoint(canvas, event);
    if (current.mode === 'mask') {
      latest.current.onMask?.move(...point);
      return;
    }
    if (current.mode === 'draw') {
      const [x, y] = point;
      // Skip points closer than a pixel: smoother lines, smaller files.
      if (Math.hypot(x - (current.points.at(-2) ?? x), y - (current.points.at(-1) ?? y)) < 1.5) return;
      current.points.push(x, y);
      paintStroke(current, latest.current, canvas.width, canvas.height);
      return;
    }
    latest.current.onUpdate(current.id, draggedLayer(current, point, canvas.width, canvas.height), current.key);
  };

  const onPointerUp = () => {
    const ended = drag.current;
    drag.current = null;
    if (ended?.mode === 'background') latest.current.onBackground?.up();
    if (ended?.mode === 'mask') latest.current.onMask?.up();
    latest.current.onEndStep?.();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const { layers, selected } = latest.current;
    const layer = layers.find((candidate) => candidate.id === selected);
    if (layer && editWithKey(latest.current, layer, event)) return;
    latest.current.onBackground?.key?.(event);
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown };
}

/**
 * A number that changes whenever web fonts finish loading, and loads the fonts the layers use: redraw on change.
 * @param layers the layers whose fonts to load
 * @returns the counter
 */
export function useFontsTick(layers: Layer[]): number {
  const [tick, setTick] = useState(0);
  const fonts = [
    ...new Set(layers.flatMap((layer) => (layer.kind === 'text' || layer.kind === 'shape' ? [layer.font] : []))),
  ].join('|');
  useEffect(() => {
    if (fonts)
      void ensureFonts(fonts.split('|')).then(() => {
        setTick((count) => count + 1);
      });
  }, [fonts]);
  useEffect(() => {
    const onLoaded = () => {
      setTick((count) => count + 1);
    };
    document.fonts.addEventListener('loadingdone', onLoaded);
    return () => {
      document.fonts.removeEventListener('loadingdone', onLoaded);
    };
  }, []);
  return tick;
}
