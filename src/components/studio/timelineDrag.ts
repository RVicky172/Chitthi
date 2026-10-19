import type { PointerEvent as ReactPointerEvent } from 'react';
import { endVStep, getVideo, type TrackHeight } from '../../state/videoStore';

/*
 * What the timeline's rows share for pointer work: the horizontal drag, a key per drag (one undo step each), frame
 * rounding, the snap distance, row and ruler sizes, and the ruler's ticks.
 */

/** How near, in pixels, a dragged edge snaps to another. */
export const SNAP_PX = 8;
/** Track heights in pixels (Q5; D-008: Medium for every track by default). */
export const TRACK_PX: Record<TrackHeight, number> = { small: 40, medium: 64, large: 96 };
/** The ruler's height in pixels: files dropped on it go to a new overlay track above the top row. */
export const RULER_PX = 24;

/** A drag's handler for each pointer move: the distance in pixels from where it started, and the event. */
export type DragMove = (dx: number, event: PointerEvent) => void;
/** A drag's handler on release: whether the pointer moved past the threshold, and the event. */
export type DragEnd = (moved: boolean, event: PointerEvent) => void;

/**
 * Starts a drag, horizontal unless asked; it ends the undo step on release.
 * @param event the pointer press
 * @param onMove gets the pointer's distance in px from where it started along the axis (after a 3 px threshold)
 * @param onEnd gets whether it moved, on release or cancel
 * @param axis 'y' for a vertical drag (a sound clip's volume line, 208)
 */
export function startDrag(event: ReactPointerEvent, onMove: DragMove, onEnd?: DragEnd, axis: 'x' | 'y' = 'x'): void {
  event.stopPropagation();
  event.preventDefault();
  const element = event.currentTarget;
  // Every draggable part of the timeline is an HTML element.
  if (!(element instanceof HTMLElement)) return;
  const startAt = axis === 'x' ? event.clientX : event.clientY;
  let moved = false;
  element.setPointerCapture(event.pointerId);
  const handleMove = (moveEvent: PointerEvent) => {
    const dx = (axis === 'x' ? moveEvent.clientX : moveEvent.clientY) - startAt;
    if (!moved && Math.abs(dx) < 3) return;
    moved = true;
    onMove(dx, moveEvent);
  };
  const handleUp = (upEvent: PointerEvent) => {
    element.removeEventListener('pointermove', handleMove);
    element.removeEventListener('pointerup', handleUp);
    element.removeEventListener('pointercancel', handleUp);
    onEnd?.(moved, upEvent);
    endVStep();
  };
  element.addEventListener('pointermove', handleMove);
  element.addEventListener('pointerup', handleUp);
  element.addEventListener('pointercancel', handleUp);
}

let dragCount = 0;

/**
 * A key for one drag's changes, so each drag is one undo step.
 * @param kind what the drag does ("drag", "trim", "ltime" …)
 * @param id the clip, layer or transition dragged
 * @returns a key no other drag has
 */
export const dragKey = (kind: string, id: string): string => `${kind}:${id}:${++dragCount}`;

/**
 * A time rounded to the project's frames.
 * @param time seconds
 * @returns the nearest frame's time
 */
export const toFrame = (time: number): number => Math.round(time * getVideo().fps) / getVideo().fps;

/**
 * A step between ruler ticks that leaves at least ~80 px between labels.
 * @param zoom pixels per second
 * @returns the step in seconds
 */
export function tickStep(zoom: number): number {
  for (const step of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]) if (step * zoom >= 80) return step;
  return 3600;
}

/**
 * Two digits.
 * @param value a whole number below 100
 * @returns it with a leading zero below 10
 */
const twoDigits = (value: number): string => String(value).padStart(2, '0');

/**
 * A ruler tick's label.
 * @param seconds the tick's time
 * @returns "m:ss", or "h:mm:ss" from an hour
 */
export function rulerLabel(seconds: number): string {
  const secondsPart = twoDigits(Math.floor(seconds % 60));
  if (seconds < 3600) return `${Math.floor(seconds / 60)}:${secondsPart}`;
  return `${Math.floor(seconds / 3600)}:${twoDigits(Math.floor((seconds % 3600) / 60))}:${secondsPart}`;
}
