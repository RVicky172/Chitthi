import { handleAt, rotationFor, toLocal, type Box } from './layers';
import { snapBox, type SnapGuide } from './stack';
import { clampTransform, type ClipTransform } from './timeline';

/*
 * The geometry of a picture clip's box on the stage (203 §11, AC-5), free of the DOM: where the box is in frame
 * pixels, which part of it a press is on, and the transform after a move, a corner resize, a turn or an arrow key.
 * The box is the whole frame scaled by the transform's width around its centre (as engine/video.ts draws it), so it
 * keeps the frame's aspect: one size number resizes it. Every result goes through clampTransform.
 */

/** A point in frame pixels. */
export interface Point {
  x: number;
  y: number;
}

/** Which part of a selected clip's box a press is on. */
export type BoxPart = 'move' | 'resize' | 'rotate';

/**
 * A clip's box in frame pixels.
 * @param transform the clip's transform
 * @param frameWidth the frame width in pixels
 * @param frameHeight the frame height in pixels
 * @returns the box's centre, size and turn (radians), as the layers' boxes are given
 */
export function clipBoxPixels(transform: ClipTransform, frameWidth: number, frameHeight: number): Box {
  return {
    cx: transform.x * frameWidth,
    cy: transform.y * frameHeight,
    w: transform.w * frameWidth,
    h: transform.w * frameHeight,
    rot: (transform.rot * Math.PI) / 180,
  };
}

/**
 * The part of a selected box under a press.
 * @param box the box in frame pixels
 * @param pointerX the press, frame pixels
 * @param pointerY the press, frame pixels
 * @param handleRadius the handles' radius in frame pixels (about 8 screen pixels)
 * @returns the corner resize handle, the rotate handle above the box, the body (with half a handle of slack), or null
 */
export function partAt(box: Box, pointerX: number, pointerY: number, handleRadius: number): BoxPart | null {
  const handle = handleAt(box, pointerX, pointerY, handleRadius);
  if (handle) return handle;
  const [localX, localY] = toLocal(box, pointerX, pointerY);
  const slack = handleRadius * 0.5;
  return Math.abs(localX) <= box.w / 2 + slack && Math.abs(localY) <= box.h / 2 + slack ? 'move' : null;
}

/**
 * The transform after dragging the box's body.
 * @param start the transform when the drag began
 * @param movedX how far the pointer moved, frame pixels
 * @param movedY how far the pointer moved, frame pixels
 * @param frameWidth the frame width in pixels
 * @param frameHeight the frame height in pixels
 * @param snapTolerance how close (frame pixels) the centre or an edge must come to the frame's centre lines or edges
 *   to snap to them; null with snapping off (the Snap switch, or Alt held)
 * @returns the new transform and the lines it snapped to (for the stage to draw)
 */
export function movedTransform(
  start: ClipTransform,
  movedX: number,
  movedY: number,
  frameWidth: number,
  frameHeight: number,
  snapTolerance: number | null,
): { transform: ClipTransform; guides: SnapGuide[] } {
  const moved = { ...start, x: start.x + movedX / frameWidth, y: start.y + movedY / frameHeight };
  if (snapTolerance === null) return { transform: clampTransform(moved), guides: [] };
  const snapped = snapBox(clipBoxPixels(moved, frameWidth, frameHeight), frameWidth, frameHeight, snapTolerance);
  return { transform: clampTransform({ ...moved, x: snapped.x, y: snapped.y }), guides: snapped.guides };
}

/**
 * The transform after dragging the corner handle: the size follows the pointer's distance from the box's centre, so
 * the aspect stays the frame's.
 * @param start the transform when the drag began
 * @param startBox the box when the drag began, frame pixels
 * @param pressedAt where the drag began, frame pixels
 * @param pointer where the pointer is now, frame pixels
 */
export function resizedTransform(start: ClipTransform, startBox: Box, pressedAt: Point, pointer: Point): ClipTransform {
  const startDistance = Math.max(1, Math.hypot(pressedAt.x - startBox.cx, pressedAt.y - startBox.cy));
  const distance = Math.hypot(pointer.x - startBox.cx, pointer.y - startBox.cy);
  return clampTransform({ ...start, w: (start.w * distance) / startDistance });
}

/**
 * The transform after dragging the rotate handle: the box's top faces the pointer.
 * @param start the transform when the drag began
 * @param box the box, frame pixels
 * @param pointer where the pointer is now, frame pixels
 * @param inSteps Shift held: whole 15° steps
 * @returns the transform turned clockwise from straight up, in −180…180°
 */
export function rotatedTransform(start: ClipTransform, box: Box, pointer: Point, inSteps: boolean): ClipTransform {
  let degrees = rotationFor(box, pointer.x, pointer.y);
  if (degrees > 180) degrees -= 360;
  if (inSteps) degrees = Math.round(degrees / 15) * 15;
  return clampTransform({ ...start, rot: degrees });
}

/** How far one arrow key press moves a clip, as a share of the frame: 1 %, 10 % with Shift (AC-5). */
const NUDGE = { normal: 0.01, shift: 0.1 };

/**
 * The transform after an arrow key with the stage focused.
 * @param start the clip's transform
 * @param key the key pressed (KeyboardEvent.key)
 * @param shift Shift held
 * @returns the moved transform, or null for any key other than the four arrows
 */
export function nudgedTransform(start: ClipTransform, key: string, shift: boolean): ClipTransform | null {
  const step = shift ? NUDGE.shift : NUDGE.normal;
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const move = moves[key];
  return move ? clampTransform({ ...start, x: start.x + move[0], y: start.y + move[1] }) : null;
}

/**
 * What a change to a clip's box says to screen readers (202's live region).
 * @param clipName the clip's name (timelineRows.ts clipLabel), e.g. "Overlay 1, clip 1"
 * @param transform its new transform
 * @returns "Overlay 1, clip 1: x 72 %, y 20 %, size 35 %", plus its turn, opacity and corners when not the default
 */
export function describeTransform(clipName: string, transform: ClipTransform): string {
  const percent = (share: number) => `${Math.round(share * 100)} %`;
  const parts = [`x ${percent(transform.x)}`, `y ${percent(transform.y)}`, `size ${percent(transform.w)}`];
  if (transform.rot !== 0) parts.push(`turned ${Math.round(transform.rot)}°`);
  if (transform.opacity !== 1) parts.push(`opacity ${percent(transform.opacity)}`);
  if (transform.radius !== 0) parts.push(`corners ${percent(transform.radius)}`);
  return `${clipName}: ${parts.join(', ')}`;
}
