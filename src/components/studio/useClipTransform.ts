import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { clipBoxPixels, movedTransform, nudgedTransform, partAt, resizedTransform, rotatedTransform, type BoxPart, type Point } from '../../engine/clipBox';
import { drawSelection } from '../../engine/layerPick';
import { type Box } from '../../engine/layers';
import { transformAt } from '../../engine/keyframes';
import { frameStack, type SnapGuide } from '../../engine/stack';
import { MAIN_VIDEO, lockedReason } from '../../engine/tracks';
import { type ClipTransform } from '../../engine/timeline';
import { toast } from '../../lib/toast';
import { setClipTransformAt } from '../../state/videoBox';
import { getVideo, projectOf, selectClip, type VClip } from '../../state/videoStore';
import { handleRadius } from '../ig/useLayerPointer';

/*
 * Moving, resizing and turning a picture clip's box on the video stage (203 §11, AC-5). It plugs into the layers'
 * pointer handling as its "background": layers are drawn on top, so a press goes to a layer first and only reaches a
 * clip's box when it misses every layer. A press on an overlay clip showing at the playhead selects it; on the selected
 * clip's box it drags the body (move, snapping to the frame's centre lines and edges within 8 screen pixels unless
 * Snap is off or Alt is held), the corner handle (resize, keeping the aspect) or the top handle (turn; Shift: 15°
 * steps). Arrow keys with the stage focused move it 1 % of the frame (Shift: 10 %). One drag is one undo step (its
 * changes share a key). A clip on a locked track shows no box and can't be changed.
 * The box is the one shown at the playhead (205 §8): an animated clip's box comes from its keyframes, and its changes go
 * through the router, so dragging it sets a keyframe at the playhead for each animated value it changes.
 */

/**
 * A clip's box as shown at the playhead (its keyframes evaluated).
 * @param clip the clip
 * @returns its box at the playhead
 */
const shownBox = (clip: VClip): ClipTransform => transformAt(clip, getVideo().t - clip.start);

/** A drag in progress on a clip's box. */
interface BoxDrag {
  clipId: string;
  part: BoxPart;
  start: ClipTransform;
  startBox: Box;
  pressedAt: Point;
  /** Groups the drag's changes into one undo step. */
  undoKey: string;
  /** The refusal last shown, so a repeated one isn't shown on every pointer move. */
  lastRefusal: string | null;
}

let dragCount = 0;

/**
 * A pointer's position in the canvas's own pixels (the frame's pixels).
 * @param canvas the stage canvas
 * @param event the pointer's client position
 * @returns the point in canvas pixels
 */
function canvasPoint(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: ((event.clientX - rect.left) * canvas.width) / rect.width, y: ((event.clientY - rect.top) * canvas.height) / rect.height };
}

/**
 * The selected clip whose box the stage shows: a picture clip showing at the playhead, not on a locked track, with no
 * layer selected; on the main track only when it has a transform (a full-frame main clip has nothing to drag).
 * @returns the clip, or null
 */
function editableClip(): VClip | null {
  const state = getVideo();
  if (state.layerSel || !state.selected) return null;
  const clip = state.clips.find((candidate) => candidate.id === state.selected);
  if (!clip || lockedReason(state.tracks, clip.track)) return null;
  if (clip.track === MAIN_VIDEO && !clip.tf && !clip.keys) return null;
  const showing = frameStack(projectOf(state), state.t).some((stackItem) => stackItem.clip.id === clip.id);
  return showing ? clip : null;
}

/**
 * The topmost overlay clip whose box is under a press at the playhead (hidden tracks left out), or null.
 * @param point the press, frame pixels
 * @param frameWidth the canvas width
 * @param frameHeight the canvas height
 * @returns the clip, or null
 */
function overlayClipAt(point: Point, frameWidth: number, frameHeight: number): VClip | null {
  const stack = frameStack(projectOf(getVideo()), getVideo().t);
  const topFirst = stack.map((stackItem) => stackItem.clip).reverse();
  return topFirst.find((clip) => clip.track !== MAIN_VIDEO && partAt(clipBoxPixels(shownBox(clip), frameWidth, frameHeight), point.x, point.y, 0) === 'move') ?? null;
}

/**
 * The clip and box part a press on the stage acts on: a part of the selected clip's box, else the overlay clip under
 * the press (selected now, ready to be moved).
 * @param stage the stage canvas
 * @param point the press, frame pixels
 * @returns the clip and the part, or null when the press is on no clip's box
 */
function pressedBox(stage: HTMLCanvasElement, point: Point): { clip: VClip; part: BoxPart } | null {
  const selected = editableClip();
  const partPressed = selected ? partAt(clipBoxPixels(shownBox(selected), stage.width, stage.height), point.x, point.y, handleRadius(stage)) : null;
  if (selected && partPressed) return { clip: selected, part: partPressed };
  const pressed = overlayClipAt(point, stage.width, stage.height);
  if (!pressed) return null;
  selectClip(pressed.id);
  const nowEditable = editableClip();
  return nowEditable ? { clip: nowEditable, part: 'move' } : null;
}

/**
 * The lines a move snapped to.
 * @param context the stage's 2D context
 * @param guides the snap lines
 * @param frame the canvas's size and handle radius
 * @param frame.width the canvas width
 * @param frame.height the canvas height
 * @param frame.radius the handle radius
 */
function drawGuides(context: CanvasRenderingContext2D, guides: SnapGuide[], frame: { width: number; height: number; radius: number }): void {
  context.save();
  context.strokeStyle = '#d97706';
  context.lineWidth = Math.max(1, frame.radius / 4);
  for (const guide of guides) {
    context.beginPath();
    if (guide.axis === 'x') {
      context.moveTo(guide.at, 0);
      context.lineTo(guide.at, frame.height);
    } else {
      context.moveTo(0, guide.at);
      context.lineTo(frame.width, guide.at);
    }
    context.stroke();
  }
  context.restore();
}

/**
 * The stage's clip-box editing.
 * @param canvas the stage canvas
 * @param redraw draws the stage again (the snap guides appear and go without a store change)
 * @returns `background` handlers for useLayerPointer, and `drawBox` to draw the selected clip's box and guides
 */
export function useClipTransform(canvas: RefObject<HTMLCanvasElement | null>, redraw: () => void) {
  const drag = useRef<BoxDrag | null>(null);
  const guides = useRef<SnapGuide[]>([]);

  // Applies a new transform to the dragged clip, showing a refusal once.
  const apply = (current: BoxDrag, transform: ClipTransform) => {
    const refusal = setClipTransformAt(current.clipId, transform, current.undoKey);
    if (refusal && refusal !== current.lastRefusal) toast(refusal);
    current.lastRefusal = refusal;
  };

  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stage = event.currentTarget;
    const point = canvasPoint(stage, event);
    const pressed = pressedBox(stage, point);
    if (!pressed) return;
    const { clip, part } = pressed;
    const start = shownBox(clip);
    drag.current = {
      clipId: clip.id,
      part,
      start,
      startBox: clipBoxPixels(start, stage.width, stage.height),
      pressedAt: point,
      undoKey: `box:${clip.id}:${++dragCount}`,
      lastRefusal: null,
    };
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current) return;
    const stage = event.currentTarget;
    const point = canvasPoint(stage, event);
    if (current.part === 'move') {
      const snapping = getVideo().snapping && !event.altKey;
      const moved = movedTransform(
        current.start,
        point.x - current.pressedAt.x,
        point.y - current.pressedAt.y,
        stage.width,
        stage.height,
        snapping ? handleRadius(stage) : null,
      );
      guides.current = moved.guides;
      apply(current, moved.transform);
    } else if (current.part === 'resize') apply(current, resizedTransform(current.start, current.startBox, current.pressedAt, point));
    else apply(current, rotatedTransform(current.start, current.startBox, point, event.shiftKey));
  };

  const up = () => {
    drag.current = null;
    if (guides.current.length) {
      guides.current = [];
      redraw();
    }
  };

  // Arrow keys move the selected clip's box; returns whether the key was used.
  const key = (event: ReactKeyboardEvent<HTMLCanvasElement>): boolean => {
    const clip = editableClip();
    const moved = clip && nudgedTransform(shownBox(clip), event.key, event.shiftKey);
    if (!clip || !moved) return false;
    event.preventDefault();
    const refusal = setClipTransformAt(clip.id, moved, `nudge:${clip.id}`);
    if (refusal) toast(refusal);
    return true;
  };

  // Draws the selected clip's box with its handles, and the lines a move snapped to.
  const drawBox = (context: CanvasRenderingContext2D, frameWidth: number, frameHeight: number) => {
    const clip = editableClip();
    const stage = canvas.current;
    if (!clip || !stage) return;
    drawSelection(context, clipBoxPixels(shownBox(clip), frameWidth, frameHeight), handleRadius(stage));
    if (drag.current && guides.current.length) drawGuides(context, guides.current, { width: frameWidth, height: frameHeight, radius: handleRadius(stage) });
  };

  return { background: { down, move, up, key }, drawBox };
}
