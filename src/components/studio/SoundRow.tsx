import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Tool } from '../../engine/edits';
import { chainGainAt, type DuckCurves } from '../../engine/mixGain';
import { soundLength } from '../../engine/soundClips';
import { audioPlan, type SoundSource } from '../../engine/soundPlan';
import { waveformColumns, type SoundScan, type WaveClip, type WaveGain } from '../../engine/soundScan';
import { formatTime } from '../../engine/timeline';
import { lockedReason, type Track } from '../../engine/tracks';
import { toast } from '../../lib/toast';
import { scanSnapshot, subscribeScans } from '../../state/soundScan';
import { soundDucks } from '../../state/videoExportJob';
import {
  moveSoundTo,
  rippleSoundEdge,
  rollSoundBy,
  setSoundFades,
  setSoundVolume,
  slideSoundBy,
  slipSoundBy,
  trimSoundEdge,
} from '../../state/videoSound';
import {
  getVideo,
  projectOf,
  selectSound,
  setPlayhead,
  useVideo,
  type VClip,
  type VSound,
} from '../../state/videoStore';
import { LockIcon } from '../icons';
import { sayOnce, tell } from './timelineActions';
import { kindClass, soundKind } from './soundKinds';
import type { SnapTime } from './TimelineBars';
import { startDrag, toFrame } from './timelineDrag';
import {
  clipSilence,
  duckPoints,
  fadeAfterDrag,
  nudgedFade,
  nudgedVolume,
  gainAtY,
  soundBar,
  soundSilence,
  volumePoints,
  volumeY,
} from './timelineRows';

/*
 * One audio track's row (208 §9): a bar per sound clip with its name, its waveform (from the file's background scan,
 * through the export's gain chain, so it shows what is heard), fade handles at its top corners, its volume line, its
 * track's duck curve, and the part past the video's end dimmed (Q6). Dragging a bar works with the edit tool as on the
 * picture rows: Select moves it in time (onto another audio row when dropped there) and trims at its edges (Shift:
 * ripple), Roll moves the cut at an edge, Slip plays another part of its file, Slide moves it between its neighbours.
 */

/** A bar's vertical margins and borders inside its row, pixels (`.tl-sound`: 4 px above and below, 1 px borders). */
const BAR_INSET = 10;
/** The most columns a waveform canvas draws (a long clip's canvas is stretched). */
const MAX_COLUMNS = 2048;

/** What the waveforms and duck curves read: the export's sound plan, the duck curves and the scans. */
export interface SoundMix {
  plan: ReadonlyMap<string, SoundSource>;
  ducks: DuckCurves;
  scans: ReadonlyMap<string, SoundScan>;
}

/**
 * The export's sound plan, duck curves and the scans, recomputed only when the project's sound or a scan changes.
 * @returns the mix
 */
export function useSoundMix(): SoundMix {
  const { scans } = useSyncExternalStore(subscribeScans, scanSnapshot);
  const sounds = useVideo((state) => state.sounds);
  const clips = useVideo((state) => state.clips);
  const tracks = useVideo((state) => state.tracks);
  return useMemo(() => {
    const video = getVideo();
    return {
      plan: new Map(audioPlan(projectOf(video)).map((source) => [source.ref, source])),
      ducks: soundDucks(video),
      scans,
    };
    // The plan and the curves read only these (and the scans).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sounds, clips, tracks, scans]);
}

/**
 * What scales a sound clip's waveform: the export's chain gain, or why it isn't heard.
 * @param clip the sound clip
 * @param track its track
 * @param total the video's length
 * @param mix the plan and duck curves
 * @returns the gain, or the reason
 */
function waveGain(clip: VSound, track: Track, total: number, mix: SoundMix): WaveGain {
  return chainOrSilence(clip.id, soundSilence(clip, track, total), mix);
}

/**
 * What scales a video clip's waveform under its filmstrip (T103): the export's chain gain, or why it isn't heard.
 * @param clip the video clip
 * @param track its track
 * @param mix the plan and duck curves
 * @returns the gain, or the reason
 */
export function clipWaveGain(clip: VClip, track: Track, mix: SoundMix): WaveGain {
  return chainOrSilence(clip.id, clipSilence(clip, track), mix);
}

/**
 * The export's chain gain for a source, or why it is silent.
 * @param ref the source's ref (the clip's or sound clip's id)
 * @param silent why it is silent, or null
 * @param mix the plan and duck curves
 * @returns the gain, or the reason
 */
function chainOrSilence(ref: string, silent: string | null, mix: SoundMix): WaveGain {
  const source = mix.plan.get(ref);
  if (silent !== null || !source) return { silent: silent ?? 'It isn’t heard.' };
  const { tracks } = getVideo();
  return (time) => chainGainAt(source, tracks, mix.ducks, time);
}

/** A clip's waveform. */
interface WaveCanvasProps {
  /** The source file's scan; nothing is drawn until it is ready. */
  scan: SoundScan | undefined;
  clip: WaveClip;
  gain: WaveGain;
  /** The stretch of the timeline drawn, seconds. */
  from: number;
  to: number;
  /** The canvas's width and height, pixels. */
  width: number;
  height: number;
}

/**
 * A clip's waveform: a column per two pixels (at most 2,048, stretched), redrawn only when its inputs change (the
 * caller keeps `gain` the same between renders).
 * @param props the scan, the clip, its gain, the stretch and the canvas's size
 */
export function WaveCanvas({ scan, clip, gain, from, to, width, height }: Readonly<WaveCanvasProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const columns = Math.max(1, Math.min(MAX_COLUMNS, Math.round(width / 2)));
    canvas.width = columns;
    canvas.height = Math.max(1, Math.round(height));
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!scan) return;
    const wave = waveformColumns(scan, clip, gain, from, to, columns);
    context.fillStyle = getComputedStyle(canvas).color;
    const middle = canvas.height / 2;
    wave.heights.forEach((amplitude, column) => {
      const half = Math.max(0.5, Math.min(1, amplitude) * middle);
      context.fillRect(column, middle - half, 1, half * 2);
    });
  }, [scan, clip, gain, from, to, width, height]);
  return <canvas ref={canvasRef} aria-hidden="true" />;
}

/** What a sound bar's drags need. */
interface SoundDrag {
  clip: VSound;
  track: Track;
  total: number;
  zoom: number;
  tool: Tool;
  snap: SnapTime;
  /** The bar's inner height, pixels (the volume line's scale). */
  barHeight: number;
}

/**
 * Snaps a sound clip moved to start at a time: by its start, else by its end (its own edges left out).
 * @param drag the clip and the row's snapping
 * @param start the wanted start, seconds
 * @param length its length, seconds
 * @param event the pointer (Alt: to the frame only)
 * @returns the start, seconds
 */
function snapSound(drag: SoundDrag, start: number, length: number, event: PointerEvent): number {
  const skip = { sound: drag.clip.id };
  const byStart = drag.snap(start, skip, event);
  return byStart !== toFrame(start) ? byStart : drag.snap(start + length, skip, event) - length;
}

/**
 * Whether a sound clip's track is locked (and says why in a toast).
 * @param track the clip's track
 * @returns true when it can't be changed
 */
function refuseLockedTrack(track: Track): boolean {
  const why = lockedReason(getVideo().tracks, track.id);
  if (why) toast(why);
  return !!why;
}

/**
 * A sound clip as it is now (a drag edits from the store's current state, step by step).
 * @param id the clip
 * @returns it, or undefined when it is gone
 */
const soundNow = (id: string): VSound | undefined => getVideo().sounds.find((sound) => sound.id === id);

/**
 * The audio row under a point, other than the clip's own.
 * @param event the pointer
 * @param own the clip's track
 * @returns that row's element, or null
 */
function otherSoundRow(event: PointerEvent, own: string): HTMLElement | null {
  const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sound-track]');
  return row && row.dataset.soundTrack !== own ? row : null;
}

/**
 * Select's drag on a sound bar: moves it in time on its row; dropped on another audio row, it goes there at that time.
 * @param event the press
 * @param drag the clip and the row
 * @param onClick on release without a drag
 */
function moveWithSelect(event: ReactPointerEvent, drag: SoundDrag, onClick: (moved: boolean) => void): void {
  const { clip, zoom } = drag;
  const length = soundLength(clip, drag.total, getVideo().sounds);
  const say = sayOnce();
  let target: HTMLElement | null = null;
  const mark = (row: HTMLElement | null) => {
    target?.classList.remove('tl-drop-row');
    target = row;
    target?.classList.add('tl-drop-row');
  };
  startDrag(
    event,
    (dx, moveEvent) => {
      mark(otherSoundRow(moveEvent, clip.track));
      if (!target)
        say(moveSoundTo(clip.id, Math.max(0, snapSound(drag, clip.start + dx / zoom, length, moveEvent))));
    },
    (moved, upEvent) => {
      const landing = target?.dataset.soundTrack;
      mark(null);
      const latest = soundNow(clip.id);
      if (moved && landing && latest)
        say(moveSoundTo(clip.id, Math.max(0, snapSound(drag, latest.start, length, upEvent)), landing));
      onClick(moved);
    },
  );
}

/**
 * A press on a sound bar's body: selects it and drags it with the edit tool (Roll only selects); a click puts the
 * playhead in it.
 * @param event the press
 * @param drag the clip and the row
 */
function onSoundBody(event: ReactPointerEvent, drag: SoundDrag): void {
  const { clip, tool, zoom } = drag;
  selectSound(clip.id);
  if (refuseLockedTrack(drag.track)) return;
  const end = clip.start + soundLength(clip, drag.total, getVideo().sounds);
  const onClick = (moved: boolean) => {
    const now = getVideo().t;
    if (!moved && (now < clip.start || now >= end)) setPlayhead(clip.start);
  };
  const say = sayOnce();
  if (tool === 'slip' || tool === 'slide') {
    startDrag(
      event,
      (dx, moveEvent) => {
        const latest = soundNow(clip.id);
        if (!latest) return;
        // Slip: a drag right plays a later part of the file; Slide: the clip goes where it's dropped.
        if (tool === 'slip') say(slipSoundBy(clip.id, toFrame(dx / zoom) - (latest.in - clip.in)));
        else
          say(
            slideSoundBy(
              clip.id,
              snapSound(drag, clip.start + dx / zoom, end - clip.start, moveEvent) - latest.start,
            ),
          );
      },
      onClick,
    );
    return;
  }
  if (tool === 'roll') startDrag(event, () => undefined, onClick);
  else moveWithSelect(event, drag, onClick);
}

/**
 * A press on a sound bar's edge: Roll moves the cut there (with the clip touching it), Select trims (Shift: ripple).
 * Slip and Slide act on the whole clip, so the edge passes the press on.
 * @param event the press
 * @param side which edge
 * @param drag the clip and the row
 */
function onSoundEdge(event: ReactPointerEvent, side: 'start' | 'end', drag: SoundDrag): void {
  const { clip, tool, zoom, total, snap } = drag;
  if (tool === 'slip' || tool === 'slide') return;
  selectSound(clip.id);
  if (refuseLockedTrack(drag.track)) return;
  const say = sayOnce();
  const endOf = (sound: VSound) => sound.start + soundLength(sound, total, getVideo().sounds);
  const at = side === 'end' ? endOf(clip) : clip.start;
  if (tool === 'roll') {
    // The cut at this edge: this clip's end, or the end of the clip touching its start.
    const left =
      side === 'end'
        ? clip
        : getVideo().sounds.find((other) => other.track === clip.track && Math.abs(endOf(other) - clip.start) < 1e-6);
    if (!left) {
      event.stopPropagation();
      toast('There’s no sound touching this one to roll into.');
      return;
    }
    startDrag(event, (dx, moveEvent) => {
      const latest = soundNow(left.id);
      if (latest) say(rollSoundBy(left.id, snap(at + dx / zoom, { sound: clip.id }, moveEvent) - endOf(latest)));
    });
    return;
  }
  const isRipple = event.shiftKey;
  startDrag(event, (dx, moveEvent) => {
    const latest = soundNow(clip.id);
    if (!latest) return;
    const edgeNow = side === 'end' ? endOf(latest) : latest.start;
    const step = snap(at + dx / zoom, { sound: clip.id }, moveEvent) - edgeNow;
    say(isRipple ? rippleSoundEdge(clip.id, side, step) : trimSoundEdge(clip.id, side, step));
  });
}

/**
 * A fade handle's drag (AC-2): the fade in grows to the right, the fade out to the left.
 * @param event the press
 * @param side which fade
 * @param drag the clip and the row
 */
function onFadeHandle(event: ReactPointerEvent, side: 'in' | 'out', drag: SoundDrag): void {
  const { clip, zoom } = drag;
  selectSound(clip.id);
  if (refuseLockedTrack(drag.track)) return;
  const length = soundLength(clip, drag.total, getVideo().sounds);
  const fade = (side === 'in' ? clip.fadeIn : clip.fadeOut) ?? 0;
  const other = (side === 'in' ? clip.fadeOut : clip.fadeIn) ?? 0;
  const say = sayOnce();
  startDrag(event, (dx) => {
    const next = fadeAfterDrag(side, fade, other, length, dx, zoom);
    say(setSoundFades(clip.id, side === 'in' ? { fadeIn: next } : { fadeOut: next }));
  });
}

/**
 * The volume line's drag (AC-5): up to 200 % at the bar's top, 0 % at its bottom.
 * @param event the press
 * @param drag the clip and the row
 */
function onVolumeLine(event: ReactPointerEvent, drag: SoundDrag): void {
  const { clip, barHeight } = drag;
  selectSound(clip.id);
  if (refuseLockedTrack(drag.track)) return;
  const fromY = volumeY(clip.volume, barHeight);
  const say = sayOnce();
  startDrag(
    event,
    (dy) => say(setSoundVolume(clip.id, Math.round(gainAtY(fromY + dy, barHeight) * 100) / 100)),
    undefined,
    'y',
  );
}

/**
 * ← / → on a fade handle (AC-14): changes the fade (Shift: by a second), kept from the timeline's playhead keys.
 * @param event the key press
 * @param side which fade
 * @param drag the clip and the row
 */
function onFadeKey(event: ReactKeyboardEvent, side: 'in' | 'out', drag: SoundDrag): void {
  const { clip } = drag;
  const fade = (side === 'in' ? clip.fadeIn : clip.fadeOut) ?? 0;
  const other = (side === 'in' ? clip.fadeOut : clip.fadeIn) ?? 0;
  const next = nudgedFade(side, fade, other, soundLength(clip, drag.total, getVideo().sounds), event.key, event.shiftKey);
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  selectSound(clip.id);
  tell(setSoundFades(clip.id, side === 'in' ? { fadeIn: next } : { fadeOut: next }));
}

/**
 * ↑ / ↓ on the volume line (AC-14): changes the volume (Shift: by 25 %), kept from the timeline's keys.
 * @param event the key press
 * @param drag the clip and the row
 */
function onVolumeKey(event: ReactKeyboardEvent, drag: SoundDrag): void {
  const next = nudgedVolume(drag.clip.volume, event.key, event.shiftKey);
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  selectSound(drag.clip.id);
  tell(setSoundVolume(drag.clip.id, next));
}

/** A sound clip's bar. */
interface SoundBarProps extends Omit<SoundDrag, 'barHeight'> {
  mix: SoundMix;
  height: number;
  selected: boolean;
  /** The sound clips on its track (a Play to the end clip stops at the next one, T072). */
  siblings: readonly VSound[];
}

/**
 * A sound clip's bar: its waveform, name, fades, volume line, duck curve, the part past the video's end dimmed, its
 * edges and fade handles, and a button for screen readers with its name, length and whether it is heard.
 * @param props the clip, its track, the row's drags, the mix, the row's height and the selection
 */
function SoundBar({ mix, height, selected, siblings, clip, track, total, zoom, tool, snap }: Readonly<SoundBarProps>) {
  const drag: SoundDrag = {
    clip,
    track,
    total,
    zoom,
    tool,
    snap,
    barHeight: Math.max(1, height - BAR_INSET),
  };
  const box = soundBar(clip, total, zoom, siblings);
  const length = soundLength(clip, total, siblings);
  const gain = useMemo(() => waveGain(clip, track, total, mix), [clip, track, total, mix]);
  const name = clip.name ?? 'Sound';
  const silent = soundSilence(clip, track, total);
  const locked = lockedReason(getVideo().tracks, track.id) !== null;
  const duck = mix.ducks.get(track.id);
  const fadeIn = (clip.fadeIn ?? 0) * zoom;
  const fadeOut = (clip.fadeOut ?? 0) * zoom;
  const barH = drag.barHeight;
  const keyed = !!clip.keys?.volume?.length;
  const percent = Math.round(clip.volume * 100);
  const measuring = mix.scans.has(clip.url) ? '' : '\nWaveform: measuring…';
  const why = silent ? '\n' + silent : '';
  const spokenWhy = silent ? ', silent: ' + silent : '';
  const spoken = `${track.name}: ${name}, ${formatTime(clip.start)} to ${formatTime(clip.start + length)}, ${length.toFixed(1)} seconds${spokenWhy}`;
  return (
    <div
      className={`tl-bar tl-bar-music tl-sound ${kindClass(soundKind(track))}${selected ? ' on' : ''}${locked ? ' locked' : ''}${silent ? ' tl-silent' : ''}`}
      style={{ left: box.left, width: Math.max(10, box.width) }}
      onPointerDown={(event) => onSoundBody(event, drag)}
      title={`${name} · ${length.toFixed(1)} s · source ${formatTime(clip.in)}${why}${measuring}`}
    >
      <WaveCanvas
        scan={mix.scans.get(clip.url)}
        clip={clip}
        gain={gain}
        from={clip.start}
        to={clip.start + length}
        width={box.width}
        height={barH}
      />
      {box.heard < box.width && <span className="tl-sound-past" style={{ left: box.heard }} aria-hidden="true" />}
      <svg className="tl-sound-lines" width={box.width} height={barH} aria-hidden="true">
        {fadeIn > 0 && <polyline className="tl-fade-line" points={`0,${barH} ${fadeIn},0`} />}
        {fadeOut > 0 && <polyline className="tl-fade-line" points={`${box.width - fadeOut},0 ${box.width},${barH}`} />}
        {duck && <polyline className="tl-duck-line" points={duckPoints(duck, clip.start, length, zoom, barH)} />}
        <polyline className="tl-volume-line" points={volumePoints(clip, length, zoom, barH)} />
      </svg>
      <span className="tl-sound-name">
        {locked && <LockIcon on />}
        {name}
      </span>
      {!keyed && (
        <button
          type="button"
          className="tl-volume-grip"
          style={{ top: volumeY(clip.volume, barH) - 4 }}
          aria-label={`Volume of ${name}: ${percent} %. Up and down arrow keys change it.`}
          onPointerDown={(event) => onVolumeLine(event, drag)}
          onKeyDown={(event) => onVolumeKey(event, drag)}
        />
      )}
      <button
        type="button"
        className="tl-fade tl-fade-in"
        style={{ left: Math.max(0, fadeIn - 5) }}
        aria-label={`Fade in of ${name}: ${(clip.fadeIn ?? 0).toFixed(1)} s. Left and right arrow keys change it.`}
        onPointerDown={(event) => onFadeHandle(event, 'in', drag)}
        onKeyDown={(event) => onFadeKey(event, 'in', drag)}
      />
      <button
        type="button"
        className="tl-fade tl-fade-out"
        style={{ right: Math.max(0, fadeOut - 5) }}
        aria-label={`Fade out of ${name}: ${(clip.fadeOut ?? 0).toFixed(1)} s. Left and right arrow keys change it.`}
        onPointerDown={(event) => onFadeHandle(event, 'out', drag)}
        onKeyDown={(event) => onFadeKey(event, 'out', drag)}
      />
      <button
        type="button"
        className="tl-edge tl-edge-start"
        aria-label={`Trim the start of ${name}`}
        onPointerDown={(event) => onSoundEdge(event, 'start', drag)}
      />
      <button
        type="button"
        className="tl-edge tl-edge-end"
        aria-label={`Trim the end of ${name}`}
        onPointerDown={(event) => onSoundEdge(event, 'end', drag)}
      />
      <button
        type="button"
        className="vh"
        aria-label={spoken}
        aria-pressed={selected}
        onClick={() => selectSound(clip.id)}
      />
    </div>
  );
}

/** One audio track's row. */
interface SoundRowProps {
  track: Track;
  /** The track's sound clips, in start order. */
  sounds: VSound[];
  total: number;
  zoom: number;
  height: number;
  tool: Tool;
  /** The selected sound clip, or null. */
  selected: string | null;
  mix: SoundMix;
  snap: SnapTime;
  seekFrom: (event: ReactPointerEvent) => void;
}

/**
 * One audio track's row: its sound clips' bars, or a hint on the Music track while it is empty.
 * @param props the track, its sounds, the video's length, zoom, height, tool, selection, mix, snapping and seeking
 */
export function SoundRow({ track, sounds, height, selected, seekFrom, ...row }: Readonly<SoundRowProps>) {
  return (
    <div
      className={`tl-row tl-music tl-sound-row${track.muted ? ' tl-off' : ''}`}
      style={{ height }}
      data-sound-track={track.id}
      onPointerDown={seekFrom}
    >
      {sounds.length === 0 && <span className="tl-placeholder">{`${track.name}: add sound from the Audio tool`}</span>}
      {sounds.map((clip) => (
        <SoundBar key={clip.id} clip={clip} track={track} height={height} selected={clip.id === selected} siblings={sounds} {...row} />
      ))}
    </div>
  );
}
