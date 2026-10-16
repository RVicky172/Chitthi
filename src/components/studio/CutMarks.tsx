import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Track } from '../../engine/tracks';
import { roomFor, TRANSITION_LIMITS, cutsOf } from '../../engine/transitions';
import { getVideo, selectTransition, useVideo, type VClip } from '../../state/videoStore';
import { removeTransition, setTransition } from '../../state/videoTransitions';
import { refuseLocked, sayOnce, tell } from './timelineActions';
import { dragKey, startDrag } from './timelineDrag';
import { clipLabel, draggedLength, transitionBlock, transitionName } from './timelineRows';

/** Opens the Transitions panel in the tool rail (VideoWorkspace listens): the timeline doesn't own the rail. */
export const OPEN_TRANSITIONS = 'chitthi:video-transitions';

/**
 * Selects a cut's transition (or the bare cut) and opens the Transitions panel for it.
 * @param id the clip before the cut
 */
function openFor(id: string): void {
  selectTransition(id);
  document.dispatchEvent(new CustomEvent(OPEN_TRANSITIONS));
}

/** A transition over a cut. */
interface TransitionBlockProps {
  before: VClip;
  after: VClip;
  /** The cut's time. */
  cut: number;
  /** "clip 2 and clip 3", for labels. */
  between: string;
  selected: boolean;
  zoom: number;
  fps: number;
}

/**
 * A transition as a block over its cut, as wide as it is long: a click selects it, Delete removes it, ← / → change its
 * length a frame (Shift: 0.5 s), and dragging either edge changes it on both sides of the cut, in whole frames up to
 * its room. Each change is one undo step.
 * @param props the clips, cut, label, selection, zoom and frame rate
 */
function TransitionBlock({ before, after, cut, between, selected, zoom, fps }: Readonly<TransitionBlockProps>) {
  const transition = before.transition;
  if (!transition) return null;
  const block = transitionBlock(cut, transition.dur, zoom);
  // The longest this transition can be: the room its clips leave, on frames.
  const longest = () => Math.floor(Math.min(TRANSITION_LIMITS.max, roomFor(before, after, getVideo().clips)) * fps + 1e-6) / fps;
  const onEdgeDown = (event: ReactPointerEvent, side: 'start' | 'end') => {
    event.stopPropagation();
    if (refuseLocked(before.id)) return;
    selectTransition(before.id);
    const startLength = transition.dur;
    const room = longest();
    const key = dragKey('tr-length', before.id);
    const say = sayOnce();
    startDrag(event, (dx) => say(setTransition(before.id, { dur: draggedLength(startLength, dx, side, zoom, fps, room) }, key)));
  };
  const onKey = (event: ReactKeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Delete' || event.key === 'Backspace') tell(removeTransition(before.id));
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 0.5 : 1 / fps);
      const length = Math.min(longest(), Math.max(TRANSITION_LIMITS.min, Math.round((transition.dur + step) * fps) / fps));
      tell(setTransition(before.id, { dur: length }, `tr-key:${before.id}`));
    } else if (event.key === 'Enter') openFor(before.id);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const name = transitionName(transition);
  const seconds = transition.dur.toFixed(2);
  return (
    <div className={`tl-trans${selected ? ' on' : ''}`} style={{ left: block.left, width: Math.max(8, block.width) }}>
      <button
        type="button"
        className="tl-trans-body"
        aria-label={`${name} between ${between}, ${seconds} s. Delete removes it, arrow keys change its length`}
        aria-pressed={selected}
        title={`${name}, ${seconds} s: drag an edge to change its length`}
        onPointerDown={(event) => {
          event.stopPropagation();
          selectTransition(before.id);
        }}
        onKeyDown={onKey}
      />
      <span className="tl-trans-edge tl-trans-edge-start" aria-hidden="true" onPointerDown={(event) => onEdgeDown(event, 'start')} />
      <span className="tl-trans-edge tl-trans-edge-end" aria-hidden="true" onPointerDown={(event) => onEdgeDown(event, 'end')} />
    </div>
  );
}

/** A picture row's cuts. */
interface CutMarksProps {
  track: Track;
  /** The track's clips in order. */
  clips: VClip[];
  zoom: number;
}

/**
 * A picture row's cuts (206 §7, D2): every cut between two touching clips is a small button (click or Enter selects it
 * and opens the Transitions panel for it), and a transition is a block over its cut (TransitionBlock).
 * @param props the track, its clips and the zoom
 */
export function CutMarks({ track, clips, zoom }: Readonly<CutMarksProps>) {
  const transitionSel = useVideo((state) => state.transitionSel);
  const fps = useVideo((state) => state.fps);
  return (
    <>
      {cutsOf(clips, track.id).map(([before, after]) => {
        const cut = after.start;
        const between = `${clipLabel(track, clips.indexOf(before) + 1, true)} and ${clipLabel(track, clips.indexOf(after) + 1, true)}`;
        const selected = transitionSel === before.id;
        if (before.transition?.to === after.id)
          return <TransitionBlock key={before.id} before={before} after={after} cut={cut} between={between} selected={selected} zoom={zoom} fps={fps} />;
        return (
          <button
            key={before.id}
            type="button"
            className={`tl-cut${selected ? ' on' : ''}`}
            style={{ left: cut * zoom }}
            aria-label={`Cut between ${between}: no transition. Press Enter to choose one`}
            aria-pressed={selected}
            title="A cut: click to choose a transition for it"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => openFor(before.id)}
          />
        );
      })}
    </>
  );
}
