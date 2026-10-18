import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Tool } from '../../engine/edits';
import { clipLength, formatTime } from '../../engine/timeline';
import { MAIN_VIDEO, type Track } from '../../engine/tracks';
import { toast } from '../../lib/toast';
import { moveClipTo, moveClipToTime, moveClipToTrack, rollClip, slideClip, slipClip, trimClip } from '../../state/videoClips';
import { getVideo, selectClip, selectVLayer, setPlayhead, type VClip } from '../../state/videoStore';
import { LockIcon } from '../icons';
import { CutMarks } from './CutMarks';
import { useFallbackNote } from './previewFrame';
import { clipNow, refuseLocked, sayOnce } from './timelineActions';
import type { SnapTime } from './TimelineBars';
import { dragKey, startDrag, toFrame } from './timelineDrag';
import { clipLabel, filmstripTimes, speedBadge } from './timelineRows';

/*
 * One picture track's row: its clips (with filmstrips), their trims and drags with the edit tool, the gaps between
 * them (main track only: an overlay's gaps are see-through, and overlay clips are lifted, never rippled, 203 Q8), and
 * the drop markers of a clip being moved or files being dropped. A clip dragged with Select onto another picture row
 * moves to that track at the time it is dropped (`moveClipToTrack`); the target row draws the marker.
 */

/** A drop marker on a row: where a clip or files would land. */
export interface DropMarker {
  target: string;
  at: number;
}

/** Snaps a clip moved to start at a time: by its start, else by its end. */
export type SnapSpan = (start: number, length: number, id: string, event: PointerEvent) => number;

/** A clip being dragged by its body. */
interface Reorder {
  id: string;
  /** How far it has been dragged, in pixels. */
  dx: number;
  /** Its place in the order (Magnetic on). */
  to: number;
  /** The time it goes to (Magnetic off). */
  at?: number;
  /** While it is over another row (that row draws the marker). */
  elsewhere?: boolean;
}

/** A clip on the row with its place. */
interface PlacedClip {
  clip: VClip;
  index: number;
  start: number;
  end: number;
}

/** What a clip's drags need from its row. */
interface DragContext {
  track: Track;
  placed: PlacedClip[];
  zoom: number;
  tool: Tool;
  snap: SnapTime;
  snapSpan: SnapSpan;
  rowTargetAt: (clientY: number) => string | null;
  setDropMarker: (marker: DropMarker | null) => void;
  setReorder: (update: Reorder | null | ((previous: Reorder | null) => Reorder | null)) => void;
  /** Where the dragged clip would go in the order, from its centre in pixels. */
  reorderTarget: (id: string, centreX: number) => number;
}

/**
 * A press on a clip's body: drags it with the edit tool (Select moves it, Slip and Slide play or place it, Roll only
 * selects); a click (no drag) puts the playhead in it.
 * @param event the press
 * @param placed the clip and its place
 * @param context the row
 */
function onClipBody(event: ReactPointerEvent, placed: PlacedClip, context: DragContext): void {
  const { clip, start, end } = placed;
  const { tool, zoom } = context;
  if (refuseLocked(clip.id)) return;
  selectClip(clip.id);
  selectVLayer(null);
  const { id } = clip;
  const length = end - start;
  const key = dragKey('drag', id);
  const say = sayOnce();
  const onClick = (moved: boolean) => {
    const now = getVideo().t;
    if (!moved && (now < start || now >= end)) setPlayhead(start);
  };
  if (tool === 'slip' || tool === 'slide') {
    const startIn = clip.in;
    startDrag(
      event,
      (dx, moveEvent) => {
        const latest = clipNow(id);
        if (!latest) return;
        // Slip: a drag right plays a later part of the video; Slide: the clip goes where it's dropped.
        if (tool === 'slip') say(slipClip(id, toFrame(dx / zoom) - (latest.in - startIn), key));
        else say(slideClip(id, context.snapSpan(start + dx / zoom, length, id, moveEvent) - latest.start, key));
      },
      onClick,
    );
    return;
  }
  if (tool === 'roll') {
    startDrag(event, () => undefined, onClick);
    return;
  }
  moveWithSelect(event, placed, context, { key, say, onClick });
}

/**
 * Select's drag: over another picture row the clip goes to that track at the drop time; on its own row it is
 * reordered (the main track with Magnetic on) or put at a time (Magnetic off, and every overlay track).
 * @param event the press
 * @param placed the clip and its place
 * @param context the row
 * @param drag the drag's undo key, its refusal reporter and its click handler
 */
function moveWithSelect(
  event: ReactPointerEvent,
  { clip, start, end }: PlacedClip,
  context: DragContext,
  drag: { key: string; say: (why: string | null) => void; onClick: (moved: boolean) => void },
): void {
  const { track, zoom } = context;
  const { id } = clip;
  const length = end - start;
  const isReordering = track.id === MAIN_VIDEO && getVideo().magnetic;
  let otherRow: { trackId: string; at: number } | null = null;
  startDrag(
    event,
    (dx, moveEvent) => {
      const at = Math.max(0, context.snapSpan(start + dx / zoom, length, id, moveEvent));
      const target = context.rowTargetAt(moveEvent.clientY);
      if (target && target !== 'new' && target !== track.id) {
        otherRow = { trackId: target, at };
        context.setDropMarker({ target, at });
        context.setReorder({ id, dx, to: 0, elsewhere: true });
        return;
      }
      otherRow = null;
      context.setDropMarker(null);
      if (isReordering) context.setReorder({ id, dx, to: context.reorderTarget(id, start * zoom + dx + (length * zoom) / 2) });
      else context.setReorder({ id, dx, to: 0, at });
    },
    (moved) => {
      context.setDropMarker(null);
      const landing = otherRow;
      context.setReorder((reorder) => {
        if (moved && landing) drag.say(moveClipToTrack(id, landing.trackId, landing.at, drag.key));
        else if (moved && reorder && isReordering) moveClipTo(reorder.id, reorder.to);
        else if (moved && reorder?.at !== undefined) drag.say(moveClipToTime(reorder.id, reorder.at, drag.key));
        return null;
      });
      drag.onClick(moved);
    },
  );
}

/**
 * A press on a clip's edge: Roll moves the cut there, Select trims (ripple with Magnetic on or Shift held, Q3; a ripple
 * start trim keeps the clip's start). Slip and Slide act on the whole clip, so the edge passes the press on.
 * @param event the press
 * @param side which edge
 * @param placed the clip and its place
 * @param context the row
 */
function onClipEdge(event: ReactPointerEvent, side: 'start' | 'end', placed: PlacedClip, context: DragContext): void {
  const { clip, start, end, index } = placed;
  const { tool, zoom, snap } = context;
  if (tool === 'slip' || tool === 'slide') return;
  if (refuseLocked(clip.id)) return;
  selectClip(clip.id);
  const { id } = clip;
  const key = dragKey('trim', id);
  const say = sayOnce();
  const at = side === 'end' ? end : start;
  if (tool === 'roll') {
    // The cut at this edge: this clip's end, or the end of the clip before it.
    const left = side === 'end' ? clip : context.placed.find((other) => other.index === index - 1)?.clip;
    if (!left) {
      event.stopPropagation();
      toast('There’s no clip before this one to roll into.');
      return;
    }
    startDrag(event, (dx, moveEvent) => {
      const latest = clipNow(left.id);
      if (latest) say(rollClip(left.id, snap(at + dx / zoom, { clip: id }, moveEvent) - (latest.start + clipLength(latest)), key));
    });
    return;
  }
  const isRipple = event.shiftKey || getVideo().magnetic;
  const startLength = end - start;
  startDrag(event, (dx, moveEvent) => {
    const latest = clipNow(id);
    if (!latest) return;
    let step: number;
    if (side === 'end') step = snap(at + dx / zoom, { clip: id }, moveEvent) - (latest.start + clipLength(latest));
    else if (isRipple) step = toFrame(dx / zoom) - (startLength - clipLength(latest));
    else step = snap(at + dx / zoom, { clip: id }, moveEvent) - latest.start;
    say(trimClip(id, side, step, { ripple: isRipple }, key));
  });
}

/** A clip's block on its row. */
interface ClipBlockProps {
  clip: VClip;
  /** The clip's name for screen readers: "Clip 2", or "Overlay 1, clip 2" (timelineRows.ts clipLabel). */
  label: string;
  /** The same name inside a sentence ("Trim the start of clip 2"). */
  labelInSentence: string;
  left: number;
  width: number;
  selected: boolean;
  /** How far it is being dragged, in pixels, or null. */
  dragging: number | null;
  /** On a locked track: a lock badge, and the pointer doesn't drag it. */
  locked: boolean;
  onBody: (event: ReactPointerEvent) => void;
  onEdge: (event: ReactPointerEvent, side: 'start' | 'end') => void;
}

/**
 * The filmstrip tiles for the part of the source a clip uses.
 * @param clip the clip
 * @param width the block's width in pixels
 * @returns the tiles' pictures
 */
function filmstrip(clip: VClip, width: number): string[] {
  const tiles = Math.max(1, Math.min(24, Math.round(width / 56)));
  const times = filmstripTimes(clip, tiles);
  return Array.from({ length: tiles }, (_, tile) => {
    if (clip.kind !== 'video' || clip.strip.length <= 1) return clip.strip[0] ?? clip.thumb;
    // Through the speed (207): a reversed clip's tiles run backwards, a freeze frame's all show its still.
    const time = times[tile] ?? clip.in;
    return clip.strip[Math.min(clip.strip.length - 1, Math.floor((time / clip.srcDur) * clip.strip.length))] ?? clip.thumb;
  });
}

/**
 * A clip's block: its filmstrip, length, trim edges and a button for screen readers.
 * @param props the clip, its labels, place, selection, drag state and handlers
 */
function ClipBlock({ clip, label, labelInSentence, left, width, selected, dragging, locked, onBody, onEdge }: Readonly<ClipBlockProps>) {
  // A clip the decoder pool can't decode previews from its <video>, but the export can't use it (204 §7).
  const cantExport = useFallbackNote(clip.file);
  const seconds = clipLength(clip).toFixed(1);
  const badge = speedBadge(clip);
  const spokenBadge = badge ? `, ${badge.replace('◀', 'reversed')}` : '';
  const source = clip.kind === 'video' ? ' · source ' + clip.in.toFixed(1) + '–' + clip.out.toFixed(1) + ' s' : '';
  const warning = cantExport ? '\n' + cantExport : '';
  const spokenWarning = cantExport ? '. ' + cantExport : '';
  return (
    <div
      className={`tl-clip tl-${clip.kind}${clip.freeze === undefined ? '' : ' tl-still'}${selected ? ' on' : ''}${dragging !== null ? ' dragging' : ''}${locked ? ' locked' : ''}`}
      style={{ left, width: Math.max(8, width - 2), transform: dragging !== null ? `translateX(${dragging}px)` : undefined }}
      onPointerDown={onBody}
      title={`${clip.name} · ${seconds} s${source}${warning}`}
    >
      <div className="tl-film" aria-hidden="true">
        {filmstrip(clip, width).map((picture, tile) => (
          <img key={tile} src={picture} alt="" draggable={false} />
        ))}
      </div>
      <span className="tl-clip-label">
        {locked && <LockIcon on />}
        {cantExport && <span aria-hidden="true">⚠ </span>}
        {clip.kind === 'video' && clip.freeze === undefined ? '▶ ' : ''}
        {seconds}s{clip.fade ? ' · fade' : ''}
      </span>
      {badge && (
        <span className="tl-speed" aria-hidden="true">
          {badge}
        </span>
      )}
      <button type="button" className="tl-edge tl-edge-start" aria-label={`Trim the start of ${labelInSentence}`} onPointerDown={(event) => onEdge(event, 'start')} />
      <button type="button" className="tl-edge tl-edge-end" aria-label={`Trim the end of ${labelInSentence}`} onPointerDown={(event) => onEdge(event, 'end')} />
      <button type="button" className="vh" aria-label={`${label}: ${clip.name}, ${clip.kind}, ${seconds} seconds${spokenBadge}${spokenWarning}`} aria-pressed={selected} onClick={() => selectClip(clip.id)} />
    </div>
  );
}

/** One picture track's row. */
interface PictureRowProps {
  track: Track;
  /** The track's clips in order. */
  clips: VClip[];
  height: number;
  zoom: number;
  tool: Tool;
  /** The selected clip, or null (none, or a layer is selected). */
  selected: string | null;
  /** The timeline's snapping, so moves catch edges on every row. */
  snap: SnapTime;
  snapSpan: SnapSpan;
  seekFrom: (event: ReactPointerEvent) => void;
  /** Registers the row's element, so drags can tell which row the pointer is over. */
  rowRef: (element: HTMLDivElement | null) => void;
  /** The picture row (or `'new'`, above the top row) under a pointer, or null. */
  rowTargetAt: (clientY: number) => string | null;
  /** Where a clip from another row or a dropped file would land on this row, in seconds; null when nothing is. */
  dropMarkerAt: number | null;
  /** Shows (or, with null, hides) the drop marker on a row: the timeline draws it. */
  setDropMarker: (marker: DropMarker | null) => void;
}

/**
 * The gaps on the main track (Magnetic off): before the first clip and between clips.
 * @param placed the clips with their places
 * @returns the gaps' start and end times
 */
const gapsBetween = (placed: PlacedClip[]): { start: number; end: number }[] =>
  placed.flatMap((clip, index) => {
    const from = index ? (placed[index - 1]?.end ?? 0) : 0;
    return clip.start - from > 1e-6 ? [{ start: from, end: clip.start }] : [];
  });

/**
 * One picture track's row (see the file's comment).
 * @param props the track, its clips, sizes, tool, selection, snapping, row lookup and drop marker
 */
export function PictureRow({ track, clips, height, zoom, tool, selected, snap, snapSpan, seekFrom, rowRef, rowTargetAt, dropMarkerAt, setDropMarker }: Readonly<PictureRowProps>) {
  const isMainTrack = track.id === MAIN_VIDEO;
  const [reorder, setReorder] = useState<Reorder | null>(null);
  const placed: PlacedClip[] = clips.map((clip, index) => ({ clip, index, start: clip.start, end: clip.start + clipLength(clip) }));
  const gaps = isMainTrack ? gapsBetween(placed) : [];
  // Where a dragged clip would land: before the first other clip whose middle is right of the dragged clip's centre.
  const others = (id: string) => placed.filter((other) => other.clip.id !== id);
  const reorderTarget = (id: string, centreX: number) => {
    const list = others(id);
    const at = centreX / zoom;
    const before = list.findIndex((other) => at < (other.start + other.end) / 2);
    return before < 0 ? list.length : before;
  };
  // The drop marker sits at the start of the clip it will go before (or the end of the last one).
  const markerAt = (id: string, to: number) => {
    const list = others(id);
    return (list.at(to)?.start ?? list.at(-1)?.end ?? 0) * zoom;
  };
  const context: DragContext = { track, placed, zoom, tool, snap, snapSpan, rowTargetAt, setDropMarker, setReorder, reorderTarget };
  let reorderMarker: number | null = null;
  if (reorder && !reorder.elsewhere) reorderMarker = reorder.at !== undefined ? reorder.at * zoom : markerAt(reorder.id, reorder.to);

  return (
    <div ref={rowRef} className={`tl-row tl-video${isMainTrack ? '' : ' tl-overlay'}${track.hidden ? ' tl-off' : ''}`} style={{ height }} onPointerDown={seekFrom}>
      {placed.map((clipPlace) => (
        <ClipBlock
          key={clipPlace.clip.id}
          clip={clipPlace.clip}
          label={clipLabel(track, clipPlace.index + 1)}
          labelInSentence={clipLabel(track, clipPlace.index + 1, true)}
          left={clipPlace.start * zoom}
          width={(clipPlace.end - clipPlace.start) * zoom}
          selected={clipPlace.clip.id === selected}
          dragging={reorder?.id === clipPlace.clip.id ? reorder.dx : null}
          locked={track.locked}
          onBody={(event) => onClipBody(event, clipPlace, context)}
          onEdge={(event, side) => onClipEdge(event, side, clipPlace, context)}
        />
      ))}
      {gaps.map((gap) => (
        <button
          key={gap.start}
          type="button"
          className="tl-gap"
          data-at={gap.start}
          style={{ left: gap.start * zoom, width: Math.max(8, (gap.end - gap.start) * zoom - 2) }}
          aria-label={`Gap, ${(gap.end - gap.start).toFixed(1)} s, from ${formatTime(gap.start)}`}
          title="A gap: black, with the layers on top. Select it and press Delete to close it."
          // Not a seek: a click selects (focuses) the gap.
          onPointerDown={(event) => event.stopPropagation()}
        />
      ))}
      <CutMarks track={track} clips={clips} zoom={zoom} />
      {reorderMarker !== null && <span className="tl-drop" style={{ left: reorderMarker }} />}
      {dropMarkerAt !== null && <span className="tl-drop" style={{ left: dropMarkerAt * zoom }} />}
    </div>
  );
}
