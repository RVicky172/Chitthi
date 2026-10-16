// The 3D viewer's motion (Viewer3D): the card's turn, flick momentum, auto-turn, hover lean and zoom, kept in a ref
// and advanced once a frame, with the light and shadow that follow it. Everything here is plain data and maths.

/** What the viewer shows: a card, every month in a ring, a wall calendar, or the envelope. */
export type Mode = 'card' | 'ring' | 'wall' | 'envelope';

/** A pointer drag in progress: where it started, the turn then, and the last move (for the flick speed). */
interface Drag {
  x: number;
  y: number;
  rx: number;
  ry: number;
  moved: boolean;
  t: number;
  px: number;
  py: number;
}

/** A point on the screen. */
interface Point {
  x: number;
  y: number;
}

/** The viewer's motion, changed by pointers and keys and advanced each frame. */
export interface Motion {
  rx: number;
  ry: number;
  /** A turn to ease towards (degrees), or null. */
  target: number | null;
  drag: Drag | null;
  /** Spin left over from a flick, in degrees per frame; decays each frame. */
  vry: number;
  vrx: number;
  zoom: number;
  zoomTo: number;
  /** Pointer position over the scene (−1…1), for the hover tilt. */
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  /** Active touch points, for pinch zoom. */
  touches: Map<number, Point>;
  pinch: { d: number; zoom: number } | null;
}

/**
 * The motion at rest, before the viewer opens.
 * @returns a new motion
 */
export function newMotion(): Motion {
  return {
    rx: -10,
    ry: -28,
    target: null,
    drag: null,
    vry: 0,
    vrx: 0,
    zoom: 1,
    zoomTo: 1,
    hx: 0,
    hy: 0,
    tx: 0,
    ty: 0,
    touches: new Map(),
    pinch: null,
  };
}

/** Each mode's resting turn about the vertical axis, degrees. */
export const HOME_RY: Record<Mode, number> = { card: -28, ring: 0, wall: -12, envelope: 158 };

/** Each mode's tilt when switched to, degrees. */
export const SWITCH_RX: Record<Mode, number> = { card: -10, ring: -10, wall: -6, envelope: -12 };

/**
 * The pose the viewer opens in.
 * @param start the mode it opens in
 * @returns the tilt and turn
 */
export function openPose(start: Mode): { rx: number; ry: number } {
  if (start === 'envelope') return { rx: -12, ry: 158 };
  return { rx: -10, ry: start === 'ring' ? 0 : -28 };
}

/**
 * The distance between the first two touch points.
 * @param touches the touch points
 * @returns the distance, or 0 with fewer than two
 */
export function touchDistance(touches: Map<number, Point>): number {
  const all = [...touches.values()],
    first = all.at(0),
    second = all.at(1);
  return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
}

/**
 * The ring page under a point on the screen.
 * @param x the point, client pixels
 * @param y the point, client pixels
 * @returns the page's index, or null
 */
export function pageUnder(x: number, y: number): number | null {
  const hit = document
    .elementsFromPoint(x, y)
    .find((element) => element instanceof HTMLElement && element.dataset.page);
  return hit instanceof HTMLElement ? +(hit.dataset.page ?? 0) : null;
}

/**
 * Advances the turn one frame: easing to a target, coasting after a flick, or turning slowly on its own; then the
 * hover lean and the zoom.
 * @param now the motion (changed in place)
 * @param auto whether it turns on its own
 * @param mode the view
 * @returns the tilt and turn to draw, lean included
 */
export function advance(now: Motion, auto: boolean, mode: Mode): { rx: number; ry: number } {
  const coasting = Math.abs(now.vry) > 0.02 || Math.abs(now.vrx) > 0.02;
  if (now.target !== null) {
    now.ry += (now.target - now.ry) * 0.12;
    if (Math.abs(now.target - now.ry) < 0.3) {
      now.ry = now.target;
      now.target = null;
    }
  } else if (!now.drag && coasting) {
    // Momentum after a flick: keeps turning and slows down, like a card spun on a table.
    now.ry += now.vry;
    now.rx = Math.max(-55, Math.min(55, now.rx + now.vrx));
    now.vry *= 0.93;
    now.vrx *= 0.9;
  } else if (!now.drag && auto && mode !== 'wall' && mode !== 'envelope') now.ry += mode === 'ring' ? 0.12 : 0.22;
  // Hover tilt: the object leans a little towards the pointer when it's not being turned.
  const lean = !now.drag && !coasting && now.target === null && mode !== 'ring';
  now.tx += ((lean ? now.hx * 7 : 0) - now.tx) * 0.08;
  now.ty += ((lean ? -now.hy * 6 : 0) - now.ty) * 0.08;
  now.zoom += (now.zoomTo - now.zoom) * 0.15;
  return { rx: now.rx + now.ty, ry: now.ry + now.tx };
}

/**
 * Turns the object and lights it from the upper left: each face darkens as it turns away, and the highlight slides
 * across it.
 * @param object the card, ring, wall calendar or envelope
 * @param prefix a transform before the turn (the ring's distance)
 * @param rx the tilt, degrees
 * @param ry the turn, degrees
 */
export function paintTurn(object: HTMLElement, prefix: string, rx: number, ry: number): void {
  object.style.transform = `${prefix}rotateX(${rx}deg) rotateY(${ry}deg)`;
  const rad = Math.PI / 180,
    facing = Math.cos(ry * rad) * Math.cos(rx * rad);
  object.style.setProperty('--gx', `${(((ry % 360) + 360) % 360) / 3.6}%`);
  object.style.setProperty('--gy', `${50 - rx}%`);
  object.style.setProperty('--shadeF', `${Math.max(0, 0.08 - facing * 0.08 + (1 - Math.max(0, facing)) * 0.35)}`);
  object.style.setProperty('--shadeB', `${Math.max(0, 0.08 + facing * 0.08 + (1 - Math.max(0, -facing)) * 0.35)}`);
}

/**
 * A pointer goes down: two fingers start a pinch, one starts a drag.
 * @param now the motion (changed in place)
 * @param pointerId the pointer
 * @param x its position, client pixels
 * @param y its position, client pixels
 */
export function pointerDown(now: Motion, pointerId: number, x: number, y: number): void {
  now.touches.set(pointerId, { x, y });
  if (now.touches.size === 2) {
    // Two fingers: pinch to zoom instead of turning.
    now.pinch = { d: touchDistance(now.touches), zoom: now.zoomTo };
    now.drag = null;
    return;
  }
  now.drag = { x, y, rx: now.rx, ry: now.ry, moved: false, t: performance.now(), px: x, py: y };
  now.target = null;
  now.vry = now.vrx = 0;
}

/**
 * A drag moves: turn with it, and keep the speed of the last move for the flick.
 * @param now the motion (changed in place)
 * @param x the pointer, client pixels
 * @param y the pointer, client pixels
 * @param mode the view (the ring turns slower)
 */
export function dragTo(now: Motion, x: number, y: number, mode: Mode): void {
  const drag = now.drag;
  if (!drag) return;
  const dx = x - drag.x,
    dy = y - drag.y,
    speed = mode === 'ring' ? 0.25 : 0.4;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  // Velocity from the last move, for the momentum when the pointer lets go.
  const time = performance.now(),
    dt = Math.max(8, time - drag.t);
  now.vry = ((x - drag.px) * speed * 16) / dt;
  now.vrx = (-(y - drag.py) * 0.3 * 16) / dt;
  drag.t = time;
  drag.px = x;
  drag.py = y;
  now.ry = drag.ry + dx * speed;
  now.rx = Math.max(-55, Math.min(55, drag.rx - dy * 0.3));
}

/**
 * A pointer lets go: end a pinch, or end a drag (coasting only after a real flick).
 * @param now the motion (changed in place)
 * @param pointerId the pointer
 * @returns whether it was a tap (a press without a drag)
 */
export function pointerUp(now: Motion, pointerId: number): boolean {
  now.touches.delete(pointerId);
  if (now.pinch) {
    if (now.touches.size < 2) now.pinch = null;
    return false;
  }
  const tap = !!now.drag && !now.drag.moved;
  // A slow release shouldn't coast: only keep speed from a real flick.
  if (now.drag && performance.now() - now.drag.t > 80) now.vry = now.vrx = 0;
  now.vry = Math.max(-8, Math.min(8, now.vry));
  now.drag = null;
  if (tap) now.vry = now.vrx = 0;
  return tap;
}

/**
 * A pointer is cancelled: drop the drag and the pinch.
 * @param now the motion (changed in place)
 * @param pointerId the pointer
 */
export function pointerCancel(now: Motion, pointerId: number): void {
  now.drag = null;
  now.pinch = null;
  now.touches.delete(pointerId);
}
