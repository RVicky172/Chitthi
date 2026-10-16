// The camera over the paper sizes mat (Paper3D): orbit by dragging, slide with Shift + drag (or any drag at actual
// size), pinch or scroll to zoom, arrow keys and + / - too. A click without a drag picks the piece under the pointer.
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { reduced } from './paper3dScene';

/** Where the camera looks from: tilt and spin in degrees, and zoom. */
export interface Camera {
  tilt: number;
  spin: number;
  zoom: number;
}

/** The preset views. */
export const VIEWS = {
  top: { tilt: 0, spin: 0 },
  angled: { tilt: 52, spin: -18 },
  low: { tilt: 70, spin: -32 },
} satisfies Record<string, Partial<Camera>>;

/** A point on the screen. */
interface Point {
  x: number;
  y: number;
}

/** The pointers down on the view and how far they have moved. */
interface PointerDrag {
  x: number;
  y: number;
  moved: number;
  points: Map<number, Point>;
  /** The distance between two fingers at the last move (0 until a pinch starts). */
  pinch: number;
}

/**
 * The distance between the first two pointers.
 * @param points the pointers
 * @returns the distance, or 0 with fewer than two
 */
function pinchDistance(points: Map<number, Point>): number {
  const all = [...points.values()],
    first = all.at(0),
    second = all.at(1);
  return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
}

/**
 * A zoom kept between 0.3 and 8.
 * @param zoom the zoom
 * @returns the clamped zoom
 */
export const clampZoom = (zoom: number) => Math.min(8, Math.max(0.3, zoom));

/** What the pointer handlers read and change. */
interface MatPointerState {
  cam: Camera;
  actual: boolean;
  setAnim: (anim: boolean) => void;
  setPan: Dispatch<SetStateAction<Point>>;
  setCamAnim: (change: Partial<Camera>, animate?: boolean) => void;
  onPick: (id: string) => void;
}

/**
 * The view's pointer handlers: orbit, pan, pinch, and a click that picks a piece.
 * @param state the camera, whether at actual size, and the setters
 * @returns the down, move and up handlers
 */
function useMatPointer({ cam, actual, setAnim, setPan, setCamAnim, onPick }: MatPointerState) {
  const drag = useRef<PointerDrag | null>(null);

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = drag.current ?? {
      x: event.clientX,
      y: event.clientY,
      moved: 0,
      points: new Map<number, Point>(),
      pinch: 0,
    };
    pointer.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointer.points.size === 2) pointer.pinch = pinchDistance(pointer.points);
    drag.current = pointer;
    setAnim(false);
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = drag.current;
    if (!pointer?.points.has(event.pointerId)) return;
    pointer.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointer.points.size === 2) {
      const distance = pinchDistance(pointer.points);
      if (pointer.pinch) setCamAnim({ zoom: clampZoom(cam.zoom * (distance / pointer.pinch)) }, false);
      pointer.pinch = distance;
      pointer.moved += 10;
      return;
    }
    const dx = event.clientX - pointer.x,
      dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved += Math.abs(dx) + Math.abs(dy);
    if (pointer.moved <= 4) return;
    if (actual || event.shiftKey) {
      setAnim(false);
      setPan((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
    } else setCamAnim({ spin: cam.spin + dx * 0.35, tilt: Math.min(80, Math.max(0, cam.tilt - dy * 0.3)) }, false);
  };

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = drag.current;
    if (!pointer) return;
    pointer.points.delete(event.pointerId);
    if (pointer.points.size) return;
    // A click without a drag picks the piece under the pointer.
    if (pointer.moved <= 4) {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-pid]');
      if (hit?.dataset.pid) onPick(hit.dataset.pid);
    }
    drag.current = null;
  };

  return { onDown, onMove, onUp };
}

/**
 * The mat's camera and its pointer, wheel and key handlers.
 * @param box the view element (the wheel listener goes on it)
 * @param onPick a click without a drag on a piece (its data-pid)
 * @returns the camera, its state and handlers
 */
export function useMatCamera(box: RefObject<HTMLDivElement | null>, onPick: (id: string) => void) {
  const [cam, setCam] = useState<Camera>({ tilt: 52, spin: -18, zoom: 1 });
  const [anim, setAnim] = useState(true);
  const [actual, setActual] = useState(false);
  // Screen-space pan: drag in actual-size view (or Shift + drag) to slide the mat.
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const tilt = actual ? 0 : cam.tilt,
    spin = actual ? 0 : cam.spin;

  const setCamAnim = (change: Partial<Camera>, animate = true) => {
    setAnim(animate && !reduced());
    setActual(false);
    setCam((current) => ({ ...current, ...change }));
  };

  const { onDown, onMove, onUp } = useMatPointer({ cam, actual, setAnim, setPan, setCamAnim, onPick });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    // A non-passive listener so the page doesn't scroll while zooming the scene.
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setAnim(false);
      setActual(false);
      setCam((camera) => ({ ...camera, zoom: clampZoom(camera.zoom * Math.exp(-event.deltaY * 0.0015)) }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
    };
  }, [box]);

  const onKey = (event: KeyboardEvent) => {
    const key = event.key;
    if (key === 'ArrowLeft' || key === 'ArrowRight') setCamAnim({ spin: spin + (key === 'ArrowLeft' ? -8 : 8) });
    else if (key === 'ArrowUp' || key === 'ArrowDown')
      setCamAnim({ tilt: Math.min(80, Math.max(0, tilt + (key === 'ArrowUp' ? -6 : 6))) });
    else if (key === '+' || key === '=') setCamAnim({ zoom: Math.min(8, cam.zoom * 1.2) });
    else if (key === '-' || key === '_') setCamAnim({ zoom: Math.max(0.3, cam.zoom / 1.2) });
    else if (key === '0') setCamAnim({ ...VIEWS.angled, zoom: 1 });
    else return;
    event.preventDefault();
  };

  return {
    cam,
    tilt,
    spin,
    anim,
    setAnim,
    actual,
    setActual,
    pan,
    setPan,
    setCamAnim,
    handlers: {
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onUp,
      onKeyDown: onKey,
    },
  };
}
