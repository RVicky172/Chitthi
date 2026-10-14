import { useEffect, useId, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Tool } from '../../engine/edits';
import { snapTargets, snapTime } from '../../engine/timeSnap';
import { adjacentKey, type Keyframes } from '../../engine/keyframes';
import { layerName, type Layer } from '../../engine/layers';
import { MAIN_VIDEO, MUSIC, addTrack as withNewTrack, lockedReason, type Track } from '../../engine/tracks';
import { cutsOf, roomFor, TRANSITION_LIMITS } from '../../engine/transitions';
import { clipLength, formatTime } from '../../engine/timeline';
import { toast } from '../../lib/toast';
import { isDesktop } from '../../platform/desktop';
import { NEW_TRACK, addMedia, addTrack, clipLocked, deleteGap, deleteKeys, deleteTrack, duplicateClipWhy, endVStep, getVideo, moveClipTo, moveClipToTime, moveClipToTrack, moveTrack, nudgeClip, removeClip, removeTransition, renameTrack, removeVLayer, rippleDeleteClip, rippleTrimToPlayhead, rollClip, selectClip, selectTransition, selectVLayer, setPlayhead, setLayerTimes, setMagnetic, setPlaying, setSnapping, setTool, setTrack, setTrackHeight, setTransition, setZoom, slideClip, slipClip, slipMusic, splitAtPlayheadWhy, toggleKey, trimClip, updateMusic, useVideo, type KeyProp, type KeyTarget, type TrackHeight, type VClip, videoLength } from '../../state/video';
import { typingIn } from '../ig/LayerPanel';
import { MoreMenu } from '../MoreMenu';
import { KeyframeLane, KeyframeLaneHeads, animatedProps, type LaneItem } from './KeyframeLane';
import { useFallbackNote } from './previewFrame';
import { clipLabel, describeClipChange, describeKeyChange, describeTransitionChange, draggedLength, keyTimes, pictureTracksTopFirst, transitionBlock, transitionName, rowUnderPointer, type RowBounds, type RowTarget } from './timelineRows';
import { CopyIcon, EditToolIcon, HeightIcon, HideIcon, LockIcon, MagneticIcon, MusicIcon, MuteIcon, PauseIcon, PlayIcon, PlusIcon, ScissorsIcon, SkipBackIcon, SkipForwardIcon, SnapIcon, TrashIcon, ZoomInIcon, ZoomOutIcon } from '../icons';

/*
 * The video editor's timeline: a time ruler, one row per picture track (overlay tracks above the main video track, 203
 * §10) with their clips and filmstrips, one row per layer, and the music with its waveform. Add track (the + by the
 * ruler) adds an overlay track; files dropped on a row land there at the drop time, on the ruler in a new track; a
 * clip dragged onto another picture row moves to that track ("Move to" in the toolbar does it by keyboard). Everything
 * is direct: what a drag on a clip does depends on the edit tool (202): Select
 * reorders it (Magnetic on) or puts it at a time (off) and trims at its edges (ripple with Magnetic on or Shift), Roll
 * moves the cut at an edge, Slip changes what a video plays, Slide moves a clip between its neighbours. Drag a layer's
 * bar to move it in time or its ends to change when it shows, drag the music to slide the song, drag the playhead or
 * click anywhere to seek. Moves snap to clip edges, layer edges and the playhead (Snap off, or Alt held: to the frame,
 * as is everything that doesn't snap). Ctrl + wheel zooms; the playhead is
 * followed while playing. Keyboard (with the timeline focused): Space play / pause, S split, Delete remove (Magnetic
 * off: leaves a gap; Shift + Delete ripples; on a focused gap: closes it), Alt + ← → nudge the selected clip a frame
 * with the tool (Shift: a second), Q / W ripple-trim its start / end to the playhead,
 * ← → a frame (Shift: a second), Home / End, + / − zoom; V / R / Y / U pick the edit tool (Select, Roll, Slip, Slide).
 * An animated clip or layer, when selected, has a keyframe lane under its row (205 §9, KeyframeLane.tsx): K adds
 * keyframes at the playhead for its animated values (or removes the ones there), Alt + [ / ] jump to its previous / next.
 */

const SNAP_PX = 8;
let dragSeq = 0;

/** Starts a horizontal drag; `move` gets the pointer's distance in px from where it started. */
function drag(e: ReactPointerEvent, move: (dx: number, ev: PointerEvent) => void, up?: (moved: boolean, ev: PointerEvent) => void) {
  e.stopPropagation();
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  const x0 = e.clientX;
  let moved = false;
  el.setPointerCapture(e.pointerId);
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    if (!moved && Math.abs(dx) < 3) return;
    moved = true;
    move(dx, ev);
  };
  const onUp = (ev: PointerEvent) => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    up?.(moved, ev);
    endVStep();
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}

/** A step between ruler ticks that leaves at least ~80 px between labels. */
function tickStep(zoom: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]) if (s * zoom >= 80) return s;
  return 3600;
}
const label = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

export function Timeline() {
  const clips = useVideo((s) => s.clips),
    layers = useVideo((s) => s.layers),
    layerSel = useVideo((s) => s.layerSel),
    selected = useVideo((s) => s.selected),
    t = useVideo((s) => s.t),
    zoom = useVideo((s) => s.zoom),
    music = useVideo((s) => s.music),
    playing = useVideo((s) => s.playing),
    tracks = useVideo((s) => s.tracks),
    trackView = useVideo((s) => s.trackView),
    tool = useVideo((s) => s.tool);
  const px = (id: string) => TRACK_PX[trackView[id] ?? 'medium'];
  const musicTrack = tracks.find((tr) => tr.id === MUSIC)!;
  // The picture tracks as rows, the top overlay first and the main track last (203 §10).
  const pictureTracks = pictureTracksTopFirst(tracks);
  const pictureTrackIds = new Set(pictureTracks.map((track) => track.id));
  const pictureClips = clips.filter((clip) => pictureTrackIds.has(clip.track));
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(600);
  const total = useVideo(videoLength);
  const width = Math.max(view - 2, total * zoom + 160);

  // Each change to a picture track is announced (politely, once a drag settles): the clip, its track and new times.
  const [said, setSaid] = useState('');
  const before = useRef(clips);
  useEffect(() => {
    const was = before.current;
    before.current = clips;
    if (was === clips) return;
    const state = getVideo();
    // A clip's change and what it did to transitions (206: one dropped by an edit, or one added, changed, removed).
    const message = [describeClipChange(was, clips, state.tracks, state.selected), describeTransitionChange(was, clips, state.tracks)].filter(Boolean).join('. ');
    if (!message) return;
    const timer = setTimeout(() => setSaid(message), 250);
    return () => clearTimeout(timer);
  }, [clips]);

  // The selected clip or layer, for its keyframe lane, K and Alt + [ / ] (205 §9); the lane shows when it is animated.
  const [keysExpanded, setKeysExpanded] = useState(false);
  const keyed = selectedItem(pictureTracks, pictureClips, layers, selected, layerSel, total);
  const lane = keyed && animatedProps(keyed.item).length ? keyed : null;
  // Each change to its keyframes is announced too.
  const keysBefore = useRef<{ id: string; keys?: Keyframes<string> } | null>(null);
  const keyedId = keyed ? JSON.stringify(keyed.target) : '',
    keyedKeys = keyed?.item.keys;
  useEffect(() => {
    const was = keysBefore.current;
    keysBefore.current = { id: keyedId, keys: keyedKeys };
    if (!keyed || was?.id !== keyedId) return;
    const message = describeKeyChange(was.keys, keyedKeys, keyed.name, keyed.item.start, getVideo().fps);
    if (!message) return;
    const timer = setTimeout(() => setSaid(message), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of the keys (or of the selection) is announced
  }, [keyedId, keyedKeys]);

  // The picture rows' elements, so a drag or a file drop can tell which row the pointer is over.
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  /** The picture rows' bounds on screen, top row first. */
  const rowBounds = (): RowBounds[] =>
    pictureTracksTopFirst(getVideo().tracks).flatMap((track) => {
      const rect = rowElements.current.get(track.id)?.getBoundingClientRect();
      return rect ? [{ trackId: track.id, top: rect.top, bottom: rect.bottom }] : [];
    });
  /** The picture row (or the new-track strip: the ruler above the top row) under a pointer, or null. */
  const rowTargetAt = (clientY: number): RowTarget | null => rowUnderPointer(rowBounds(), clientY, RULER_PX);
  // Where a clip dragged onto another row, or files dragged over the timeline, would land: drawn as a marker there.
  const [dropMarker, setDropMarker] = useState<{ target: RowTarget; at: number } | null>(null);

  /** Files dragged over the timeline: a marker on the row (or above the top row: a new track) at the pointer's time. */
  const onFilesOver = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    const target = rowTargetAt(event.clientY);
    if (!target) return setDropMarker(null);
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropMarker({ target, at: toFrame(timeAt(event.clientX)) });
  };
  /** Files dropped on a row land there at the drop time; above the top row, on a new overlay track. */
  const onFilesDrop = (event: ReactDragEvent) => {
    const target = rowTargetAt(event.clientY);
    setDropMarker(null);
    if (!target || !event.dataTransfer.files.length) return;
    event.preventDefault();
    const files = [...event.dataTransfer.files].map((file) => ({ name: file.name, blob: file, type: file.type }));
    void addMedia(files, { track: target === 'new' ? NEW_TRACK : target, at: toFrame(timeAt(event.clientX)) }).then((messages) =>
      messages.forEach((message) => toast(message)),
    );
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView(el.clientWidth));
    ro.observe(el);
    setView(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Follow the playhead while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    const x = t * zoom;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 60) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.25);
  }, [t, zoom, playing]);

  // Ctrl + wheel zooms around the pointer (a native listener: React's wheel events are passive).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const z0 = getVideo().zoom,
        rect = el.getBoundingClientRect(),
        at = (el.scrollLeft + e.clientX - rect.left) / z0;
      const z1 = Math.max(4, Math.min(400, z0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      setZoom(z1);
      requestAnimationFrame(() => (el.scrollLeft = at * z1 - (e.clientX - rect.left)));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, []);

  const timeAt = (clientX: number) => {
    const r = canvas.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, (clientX - r.left) / zoom));
  };
  /**
   * Snaps a time to the nearest clip edge, layer edge or the playhead within a few pixels, leaving out the dragged clip
   * or layer; with Snap off, Alt held, or nothing near, to the nearest frame.
   */
  const snap = (v: number, skip: { clip?: string; layer?: string } = {}, ev?: { altKey: boolean }) => {
    const s = getVideo();
    const to = s.snapping && !ev?.altKey ? snapTime(v, snapTargets(pictureClips, layers, s.t, total, skip), SNAP_PX / zoom) : v;
    return to === v ? toFrame(v) : to;
  };
  /** Snaps a clip moved to start at `s`: by its start, else by its end. */
  const snapSpan = (s: number, len: number, id: string, ev: PointerEvent) => {
    const a = snap(s, { clip: id }, ev);
    return a !== toFrame(s) ? a : snap(s + len, { clip: id }, ev) - len;
  };

  const seekFrom = (e: ReactPointerEvent) => {
    setPlaying(false);
    setPlayhead(timeAt(e.clientX));
    drag(e, (_dx, ev) => setPlayhead(timeAt(ev.clientX)));
  };

  const onKey = (e: ReactKeyboardEvent) => {
    // The track headers' buttons and menus handle their own keys.
    if (typingIn(e.target) || (e.target as HTMLElement).closest?.('.tl-heads')) return;
    const s = getVideo();
    // Alt + [ / ] (205 D2): the playhead to the selection's previous / next keyframe (by key position, any layout).
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
      e.preventDefault();
      if (!keyed) return void toast('Select a clip or a layer first.');
      const next = adjacentKey(keyed.item, s.t - keyed.item.start, e.code === 'BracketLeft' ? -1 : 1, s.fps);
      if (next === null) toast(animatedProps(keyed.item).length ? 'No more keyframes that way.' : 'Nothing is animated yet.');
      else setPlayhead(keyed.item.start + next);
      return;
    }
    // Alt + ← / → (Q5): nudge the selected clip with the tool, a frame (Shift: a second); kept from the browser's Back.
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const frames = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? s.fps : 1);
      if (s.selected) tell(nudgeClip(s.selected, frames));
      else if (s.tool === 'slip' && s.music) tell(slipMusic(frames / s.fps));
      else toast('Select a clip first.');
      return;
    }
    // Delete: a focused gap closes; a layer goes; a clip goes (Magnetic off: leaves a gap; Shift: ripples).
    const gap = (e.target as HTMLElement).closest?.<HTMLElement>('.tl-gap');
    const del = () => {
      if (gap) tell(deleteGap(Number(gap.dataset.at)));
      else if (s.layerSel) removeVLayer(s.layerSel);
      else if (s.selected && !refused(s.selected)) {
        if (e.shiftKey) tell(rippleDeleteClip(s.selected));
        else removeClip(s.selected);
      }
    };
    const map: Record<string, () => void> = {
      ' ': () => setPlaying(!s.playing),
      s: split,
      k: () => keyAtPlayhead(keyed, s.t, s.fps),
      q: () => tell(rippleTrimToPlayhead('start')),
      w: () => tell(rippleTrimToPlayhead('end')),
      Delete: del,
      Backspace: del,
      ArrowLeft: () => setPlayhead(s.t - (e.shiftKey ? 1 : 1 / 30)),
      ArrowRight: () => setPlayhead(s.t + (e.shiftKey ? 1 : 1 / 30)),
      Home: () => setPlayhead(0),
      End: () => setPlayhead(total),
      '+': () => setZoom(s.zoom * 1.25),
      '=': () => setZoom(s.zoom * 1.25),
      '-': () => setZoom(s.zoom / 1.25),
      ...Object.fromEntries(TOOLS.map(([tool, , key]) => [key.toLowerCase(), () => setTool(tool)])),
    };
    const f = map[e.key] ?? map[e.key.toLowerCase()];
    if (f && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      f();
    }
  };

  /** The selection's keyframe lane, under its row. */
  const laneRows = (shown: SelectedItem) => (
    <KeyframeLane
      key={shown.row}
      target={shown.target}
      item={shown.item}
      on={'clip' in shown.target ? 'clip' : 'layer'}
      name={shown.name}
      zoom={zoom}
      expanded={keysExpanded}
      snapAt={(v, ev) => snap(v, {}, ev)}
      drag={drag}
    />
  );

  const step = tickStep(zoom);
  const ticks = Array.from({ length: Math.floor(width / zoom / step) + 1 }, (_, i) => i * step);

  return (
    <div className={`tl tl-tool-${tool}`} onKeyDown={onKey}>
      <div className="tl-heads">
        <div className="tl-h tl-h-ruler">
          <AddTrackButton tracks={tracks} />
        </div>
        {pictureTracks.map((track) => (
          <div key={track.id}>
            <TrackHead track={track} height={trackView[track.id] ?? 'medium'} clipCount={clips.filter((clip) => clip.track === track.id).length} />
            {lane?.row === track.id && <KeyframeLaneHeads item={lane.item} on="clip" expanded={keysExpanded} onExpand={setKeysExpanded} />}
          </div>
        ))}
        {(layers.length ? [...layers].reverse() : [null]).map((l, i) => (
          <div key={l?.id ?? 'none'}>
            <div className="tl-h tl-h-layer" aria-hidden="true">
              {i === 0 ? 'Layers' : ''}
            </div>
            {l && lane?.row === l.id && <KeyframeLaneHeads item={lane.item} on="layer" expanded={keysExpanded} onExpand={setKeysExpanded} />}
          </div>
        ))}
        <TrackHead track={musicTrack} height={trackView[MUSIC] ?? 'medium'} />
      </div>
      <div className="tl-live vh" aria-live="polite">
        {said}
      </div>
      <div className="tl-scroll" ref={scroller} tabIndex={0} role="group" aria-label={`Timeline, ${formatTime(total)}. Space plays, S splits, Delete removes, arrow keys move the playhead, V R Y U pick the edit tool, Alt + arrow keys nudge the selected clip, Q and W trim it to the playhead.`}>
        <div className="tl-canvas" ref={canvas} style={{ width }} onDragOver={onFilesOver} onDragLeave={() => setDropMarker(null)} onDrop={onFilesDrop}>
          <div className={`tl-ruler${dropMarker?.target === 'new' ? ' tl-new-track' : ''}`} onPointerDown={seekFrom}>
            {ticks.map((s) => (
              <span key={s} className="tl-tick" style={{ left: s * zoom }}>
                {label(s)}
              </span>
            ))}
            {dropMarker?.target === 'new' && <span className="tl-drop" style={{ left: dropMarker.at * zoom }} />}
          </div>

          {pictureTracks.map((track) => (
            <div key={track.id}>
              <PictureRow
                track={track}
                clips={clips.filter((clip) => clip.track === track.id)}
                height={px(track.id)}
                zoom={zoom}
                tool={tool}
                selected={layerSel ? null : selected}
                snap={snap}
                snapSpan={snapSpan}
                seekFrom={seekFrom}
                rowRef={(element) => (element ? rowElements.current.set(track.id, element) : rowElements.current.delete(track.id))}
                rowTargetAt={rowTargetAt}
                dropMarkerAt={dropMarker?.target === track.id ? dropMarker.at : null}
                setDropMarker={setDropMarker}
              />
              {lane?.row === track.id && laneRows(lane)}
            </div>
          ))}

          {layers.length === 0 && (
            <div className="tl-row tl-layer tl-empty" onPointerDown={seekFrom}>
              <span>Text, stickers and drawings appear here, one row each</span>
            </div>
          )}
          {[...layers].reverse().map((l) => (
            <div key={l.id}>
              <div className="tl-row tl-layer" onPointerDown={seekFrom}>
                <LayerBar
                  layer={l}
                  total={total}
                  zoom={zoom}
                  selected={l.id === layerSel}
                  onBody={(e) => {
                    selectVLayer(l.id);
                    const s0 = l.start ?? 0,
                      e0 = Math.min(l.end ?? total, total),
                      len = e0 - s0,
                      key = `ltime:${l.id}:${++dragSeq}`;
                    drag(
                      e,
                      (dx, ev) => {
                        let s = snap(s0 + dx / zoom, { layer: l.id }, ev);
                        if (Math.abs(s - toFrame(s0 + dx / zoom)) < 1e-9) s = snap(s0 + dx / zoom + len, { layer: l.id }, ev) - len;
                        s = Math.max(0, Math.min(total - len, s));
                        // Moved whole: its keyframes go with it.
                        setLayerTimes(l.id, { start: s, end: s + len >= total - 0.01 ? undefined : s + len }, key);
                      },
                      (moved) => {
                        const now = getVideo().t;
                        if (!moved && (now < s0 || now >= e0)) setPlayhead(s0);
                      },
                    );
                  }}
                  onEdge={(e, side) => {
                    selectVLayer(l.id);
                    const s0 = l.start ?? 0,
                      e0 = Math.min(l.end ?? total, total),
                      key = `ltime:${l.id}:${++dragSeq}`;
                    drag(e, (dx, ev) => {
                      const v = snap((side === 'start' ? s0 : e0) + dx / zoom, { layer: l.id }, ev);
                      // Its start edge: the keyframes stay where they are on the timeline (205 AC-3).
                      if (side === 'start') setLayerTimes(l.id, { start: Math.max(0, Math.min(e0 - 0.2, v)) }, key);
                      else {
                        const end = Math.max(s0 + 0.2, Math.min(total, v));
                        setLayerTimes(l.id, { end: end >= total - 0.01 ? undefined : end }, key);
                      }
                    });
                  }}
                />
              </div>
              {lane?.row === l.id && laneRows(lane)}
            </div>
          ))}

          <div className={`tl-row tl-music${musicTrack.muted ? ' tl-off' : ''}`} style={{ height: px(MUSIC) }} onPointerDown={seekFrom}>
            {music ? (
              <MusicBar
                total={total}
                zoom={zoom}
                height={px(MUSIC)}
                onDrag={(e) => {
                  const o0 = music.offset;
                  if (refusedMusic()) return;
                  drag(e, (dx) => updateMusic({ offset: Math.max(0, Math.min(Math.max(0, music.dur - Math.min(total, music.dur)), o0 - dx / zoom)) }));
                }}
              />
            ) : (
              <span className="tl-placeholder">Add music from the Audio tool</span>
            )}
          </div>

          <div className="tl-playhead" style={{ left: Math.min(t, total) * zoom }}>
            <button
              type="button"
              className="tl-playhead-grip"
              aria-label={`Playhead at ${formatTime(t)}`}
              onPointerDown={(e) => {
                setPlaying(false);
                drag(e, (_dx, ev) => setPlayhead(snap(timeAt(ev.clientX), {}, ev)));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One picture track's row: its clips (with filmstrips), their trims and drags with the edit tool, the gaps between
 * them (main track only: an overlay's gaps are see-through, and overlay clips are lifted, never rippled, 203 Q8), and
 * the drop markers of a clip being moved or files being dropped. A clip dragged with Select onto another picture row
 * moves to that track at the time it is dropped (`moveClipToTrack`); the target row draws the marker.
 */
function PictureRow({
  track,
  clips,
  height,
  zoom,
  tool,
  selected,
  snap,
  snapSpan,
  seekFrom,
  rowRef,
  rowTargetAt,
  dropMarkerAt,
  setDropMarker,
}: {
  track: Track;
  /** The track's clips in order. */
  clips: VClip[];
  height: number;
  zoom: number;
  tool: Tool;
  /** The selected clip, or null (none, or a layer is selected). */
  selected: string | null;
  /** The timeline's snapping, so moves catch edges on every row. */
  snap: (v: number, skip?: { clip?: string; layer?: string }, ev?: { altKey: boolean }) => number;
  snapSpan: (s: number, len: number, id: string, ev: PointerEvent) => number;
  seekFrom: (e: ReactPointerEvent) => void;
  /** Registers the row's element, so drags can tell which row the pointer is over. */
  rowRef: (element: HTMLDivElement | null) => void;
  /** The picture row (or `'new'`, above the top row) under a pointer, or null. */
  rowTargetAt: (clientY: number) => RowTarget | null;
  /** Where a clip from another row or a dropped file would land on this row, in seconds; null when nothing is. */
  dropMarkerAt: number | null;
  /** Shows (or, with null, hides) the drop marker on a row: the timeline draws it. */
  setDropMarker: (marker: { target: RowTarget; at: number } | null) => void;
}) {
  const isMainTrack = track.id === MAIN_VIDEO;
  // A clip being dragged by its body: `to` is its place in the order (Magnetic on), `at` the time it goes to (off),
  // `elsewhere` while it is over another row (that row draws the marker).
  const [reorder, setReorder] = useState<{ id: string; dx: number; to: number; at?: number; elsewhere?: boolean } | null>(null);
  const placed = clips.map((clip, index) => ({ clip, index, start: clip.start, end: clip.start + clipLength(clip) }));
  // The gaps on the main track (Magnetic off): before the first clip and between clips.
  const holes = isMainTrack
    ? placed.flatMap((p, i) => {
        const from = i ? placed[i - 1].end : 0;
        return p.start - from > 1e-6 ? [{ start: from, end: p.start }] : [];
      })
    : [];
  // Where a dragged clip would land: before the first other clip whose middle is right of the dragged clip's centre.
  const others = (id: string) => placed.filter((q) => q.clip.id !== id);
  const reorderTarget = (id: string, centreX: number) => {
    const list = others(id),
      at = centreX / zoom;
    const k = list.findIndex((q) => at < (q.start + q.end) / 2);
    return k < 0 ? list.length : k;
  };
  /** The drop marker sits at the start of the clip it will go before (or the end of the last one). */
  const markerAt = (id: string, to: number) => {
    const list = others(id);
    return (list[to]?.start ?? list.at(-1)?.end ?? 0) * zoom;
  };

  return (
    <div ref={rowRef} className={`tl-row tl-video${isMainTrack ? '' : ' tl-overlay'}${track.hidden ? ' tl-off' : ''}`} style={{ height }} onPointerDown={seekFrom}>
      {placed.map((p) => (
        <ClipBlock
          key={p.clip.id}
          clip={p.clip}
          label={clipLabel(track, p.index + 1)}
          labelInSentence={clipLabel(track, p.index + 1, true)}
          left={p.start * zoom}
          width={(p.end - p.start) * zoom}
          selected={p.clip.id === selected}
          dragging={reorder?.id === p.clip.id ? reorder.dx : null}
          locked={track.locked}
          onBody={(e) => {
            if (refused(p.clip.id)) return;
            selectClip(p.clip.id);
            selectVLayer(null);
            const id = p.clip.id,
              len = p.end - p.start,
              key = `drag:${id}:${++dragSeq}`,
              say = refusals();
            // A click (no drag) puts the playhead in the clip, if it isn't there already.
            const clicked = (moved: boolean) => {
              const now = getVideo().t;
              if (!moved && (now < p.start || now >= p.end)) setPlayhead(p.start);
            };
            if (tool === 'slip' || tool === 'slide') {
              const in0 = p.clip.in;
              drag(
                e,
                (dx, ev) => {
                  const c = current(id);
                  if (!c) return;
                  // Slip: a drag right plays a later part of the video; Slide: the clip goes where it's dropped.
                  if (tool === 'slip') say(slipClip(id, toFrame(dx / zoom) - (c.in - in0), key));
                  else say(slideClip(id, snapSpan(p.start + dx / zoom, len, id, ev) - c.start, key));
                },
                clicked,
              );
              return;
            }
            if (tool === 'roll') {
              drag(e, () => undefined, clicked);
              return;
            }
            // Select: over another picture row the clip goes to that track at the drop time; on its own row it is
            // reordered (the main track with Magnetic on) or put at a time (Magnetic off, and every overlay track).
            const reordering = isMainTrack && getVideo().magnetic;
            let otherRow: { trackId: string; at: number } | null = null;
            drag(
              e,
              (dx, ev) => {
                const at = Math.max(0, snapSpan(p.start + dx / zoom, len, id, ev));
                const target = rowTargetAt(ev.clientY);
                if (target && target !== 'new' && target !== track.id) {
                  otherRow = { trackId: target, at };
                  setDropMarker({ target, at });
                  setReorder({ id, dx, to: 0, elsewhere: true });
                  return;
                }
                otherRow = null;
                setDropMarker(null);
                if (reordering) setReorder({ id, dx, to: reorderTarget(id, p.start * zoom + dx + (len * zoom) / 2) });
                else setReorder({ id, dx, to: 0, at });
              },
              (moved) => {
                setDropMarker(null);
                const landing = otherRow;
                setReorder((r) => {
                  if (moved && landing) say(moveClipToTrack(id, landing.trackId, landing.at, key));
                  else if (moved && r && reordering) moveClipTo(r.id, r.to);
                  else if (moved && r?.at !== undefined) say(moveClipToTime(r.id, r.at, key));
                  return null;
                });
                clicked(moved);
              },
            );
          }}
          onEdge={(e, side) => {
            // Slip and Slide act on the whole clip: the edge passes the press on to the body.
            if (tool === 'slip' || tool === 'slide') return;
            if (refused(p.clip.id)) return;
            selectClip(p.clip.id);
            const id = p.clip.id,
              key = `trim:${id}:${++dragSeq}`,
              say = refusals(),
              at = side === 'end' ? p.end : p.start;
            if (tool === 'roll') {
              // The cut at this edge: this clip's end, or the end of the clip before it.
              const left = side === 'end' ? p.clip : placed[p.index - 1]?.clip;
              if (!left) {
                e.stopPropagation();
                toast('There’s no clip before this one to roll into.');
                return;
              }
              drag(e, (dx, ev) => {
                const c = current(left.id);
                if (c) say(rollClip(left.id, snap(at + dx / zoom, { clip: id }, ev) - (c.start + clipLength(c)), key));
              });
              return;
            }
            // Select: trim; ripple with Magnetic on or Shift held (Q3). A ripple start trim keeps the clip's start.
            const ripple = e.shiftKey || getVideo().magnetic,
              len0 = p.end - p.start;
            drag(e, (dx, ev) => {
              const c = current(id);
              if (!c) return;
              const step =
                side === 'end'
                  ? snap(at + dx / zoom, { clip: id }, ev) - (c.start + clipLength(c))
                  : ripple
                    ? toFrame(dx / zoom) - (len0 - clipLength(c))
                    : snap(at + dx / zoom, { clip: id }, ev) - c.start;
              say(trimClip(id, side, step, { ripple }, key));
            });
          }}
        />
      ))}
      {holes.map((g) => (
        <button
          key={g.start}
          type="button"
          className="tl-gap"
          data-at={g.start}
          style={{ left: g.start * zoom, width: Math.max(8, (g.end - g.start) * zoom - 2) }}
          aria-label={`Gap, ${(g.end - g.start).toFixed(1)} s, from ${formatTime(g.start)}`}
          title="A gap: black, with the layers on top. Select it and press Delete to close it."
          // Not a seek: a click selects (focuses) the gap.
          onPointerDown={(e) => e.stopPropagation()}
        />
      ))}
      <CutMarks track={track} clips={clips} zoom={zoom} />
      {reorder && !reorder.elsewhere && <span className="tl-drop" style={{ left: reorder.at !== undefined ? reorder.at * zoom : markerAt(reorder.id, reorder.to) }} />}
      {dropMarkerAt !== null && <span className="tl-drop" style={{ left: dropMarkerAt * zoom }} />}
    </div>
  );
}

/** Opens the Transitions panel in the tool rail (VideoWorkspace listens): the timeline doesn't own the rail. */
export const OPEN_TRANSITIONS = 'chitthi:video-transitions';

/**
 * A picture row's cuts (206 §7, D2): every cut between two touching clips is a small button (click or Enter selects it
 * and opens the Transitions panel for it), and a transition is a block over its cut, as wide as it is long: a click
 * selects it (the inspector shows it), Delete removes it, ← / → change its length a frame (Shift: 0.5 s), and dragging
 * either edge changes it on both sides of the cut, in whole frames up to its room. Each change is one undo step.
 */
function CutMarks({ track, clips, zoom }: { track: Track; clips: VClip[]; zoom: number }) {
  const transitionSel = useVideo((s) => s.transitionSel);
  const fps = useVideo((s) => s.fps);
  const openFor = (id: string) => {
    selectTransition(id);
    document.dispatchEvent(new CustomEvent(OPEN_TRANSITIONS));
  };
  return (
    <>
      {cutsOf(clips, track.id).map(([before, after]) => {
        const cut = after.start;
        const between = `${clipLabel(track, clips.indexOf(before) + 1, true)} and ${clipLabel(track, clips.indexOf(after) + 1, true)}`;
        const transition = before.transition?.to === after.id ? before.transition : undefined;
        const selected = transitionSel === before.id;
        if (!transition)
          return (
            <button
              key={before.id}
              type="button"
              className={`tl-cut${selected ? ' on' : ''}`}
              style={{ left: cut * zoom }}
              aria-label={`Cut between ${between}: no transition. Press Enter to choose one`}
              aria-pressed={selected}
              title="A cut: click to choose a transition for it"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => openFor(before.id)}
            />
          );
        const block = transitionBlock(cut, transition.dur, zoom);
        /** The longest this transition can be: the room its clips leave, on frames. */
        const most = () => {
          const all = getVideo().clips;
          return Math.floor(Math.min(TRANSITION_LIMITS.max, roomFor(before, after, all)) * fps + 1e-6) / fps;
        };
        const edgeDrag = (e: ReactPointerEvent, side: 'start' | 'end') => {
          e.stopPropagation();
          if (refused(before.id)) return;
          selectTransition(before.id);
          const dur0 = transition.dur,
            room = most(),
            key = `tr-length:${before.id}:${++dragSeq}`,
            say = refusals();
          drag(e, (dx) => say(setTransition(before.id, { dur: draggedLength(dur0, dx, side, zoom, fps, room) }, key)));
        };
        const onKey = (e: ReactKeyboardEvent) => {
          if (e.altKey || e.ctrlKey || e.metaKey) return;
          if (e.key === 'Delete' || e.key === 'Backspace') tell(removeTransition(before.id));
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const step = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.5 : 1 / fps);
            const dur = Math.min(most(), Math.max(TRANSITION_LIMITS.min, Math.round((transition.dur + step) * fps) / fps));
            tell(setTransition(before.id, { dur }, `tr-key:${before.id}`));
          } else if (e.key === 'Enter') openFor(before.id);
          else return;
          e.preventDefault();
          e.stopPropagation();
        };
        return (
          <div key={before.id} className={`tl-trans${selected ? ' on' : ''}`} style={{ left: block.left, width: Math.max(8, block.width) }}>
            <button
              type="button"
              className="tl-trans-body"
              aria-label={`${transitionName(transition)} between ${between}, ${transition.dur.toFixed(2)} s. Delete removes it, arrow keys change its length`}
              aria-pressed={selected}
              title={`${transitionName(transition)}, ${transition.dur.toFixed(2)} s: drag an edge to change its length`}
              onPointerDown={(e) => {
                e.stopPropagation();
                selectTransition(before.id);
              }}
              onKeyDown={onKey}
            />
            <span className="tl-trans-edge tl-trans-edge-start" aria-hidden="true" onPointerDown={(e) => edgeDrag(e, 'start')} />
            <span className="tl-trans-edge tl-trans-edge-end" aria-hidden="true" onPointerDown={(e) => edgeDrag(e, 'end')} />
          </div>
        );
      })}
    </>
  );
}

function ClipBlock(p: {
  clip: VClip;
  /** The clip's name for screen readers: "Clip 2", or "Overlay 1, clip 2" (timelineRows.ts clipLabel). */
  label: string;
  /** The same name inside a sentence ("Trim the start of clip 2"). */
  labelInSentence: string;
  left: number;
  width: number;
  selected: boolean;
  dragging: number | null;
  /** On a locked track: a lock badge, and the pointer doesn't drag it. */
  locked: boolean;
  onBody: (e: ReactPointerEvent) => void;
  onEdge: (e: ReactPointerEvent, side: 'start' | 'end') => void;
}) {
  const c = p.clip;
  // A clip the decoder pool can't decode previews from its <video>, but the export can't use it (204 §7).
  const cantExport = useFallbackNote(c.file);
  // Filmstrip tiles for the part of the source that is used.
  const tiles = Math.max(1, Math.min(24, Math.round(p.width / 56)));
  const frames = Array.from({ length: tiles }, (_, k) => {
    if (c.kind !== 'video' || c.strip.length <= 1) return c.strip[0] ?? c.thumb;
    const time = c.in + ((k + 0.5) / tiles) * (c.out - c.in);
    return c.strip[Math.min(c.strip.length - 1, Math.floor((time / c.srcDur) * c.strip.length))];
  });
  return (
    <div
      className={`tl-clip tl-${c.kind}${p.selected ? ' on' : ''}${p.dragging !== null ? ' dragging' : ''}${p.locked ? ' locked' : ''}`}
      style={{ left: p.left, width: Math.max(8, p.width - 2), transform: p.dragging !== null ? `translateX(${p.dragging}px)` : undefined }}
      onPointerDown={p.onBody}
      title={`${c.name} · ${clipLength(c).toFixed(1)} s${c.kind === 'video' ? ` · source ${c.in.toFixed(1)}–${c.out.toFixed(1)} s` : ''}${cantExport ? `\n${cantExport}` : ''}`}
    >
      <div className="tl-film" aria-hidden="true">
        {frames.map((src, k) => (
          <img key={k} src={src} alt="" draggable={false} />
        ))}
      </div>
      <span className="tl-clip-label">
        {p.locked && <LockIcon on />}
        {cantExport && <span aria-hidden="true">⚠ </span>}
        {c.kind === 'video' ? '▶ ' : ''}
        {clipLength(c).toFixed(1)}s{c.fade ? ' · fade' : ''}
      </span>
      <button type="button" className="tl-edge tl-edge-start" aria-label={`Trim the start of ${p.labelInSentence}`} onPointerDown={(e) => p.onEdge(e, 'start')} />
      <button type="button" className="tl-edge tl-edge-end" aria-label={`Trim the end of ${p.labelInSentence}`} onPointerDown={(e) => p.onEdge(e, 'end')} />
      <button type="button" className="vh" aria-label={`${p.label}: ${c.name}, ${c.kind}, ${clipLength(c).toFixed(1)} seconds${cantExport ? `. ${cantExport}` : ''}`} aria-pressed={p.selected} onClick={() => selectClip(c.id)} />
    </div>
  );
}

function LayerBar(p: { layer: Layer; total: number; zoom: number; selected: boolean; onBody: (e: ReactPointerEvent) => void; onEdge: (e: ReactPointerEvent, side: 'start' | 'end') => void }) {
  const l = p.layer;
  const s = l.start ?? 0,
    e = Math.min(l.end ?? p.total, p.total);
  return (
    <div
      className={`tl-bar tl-bar-${l.kind}${p.selected ? ' on' : ''}${l.hidden ? ' off' : ''}`}
      style={{ left: s * p.zoom, width: Math.max(10, (e - s) * p.zoom) }}
      onPointerDown={p.onBody}
      title={`${layerName(l)} · ${formatTime(s)}–${formatTime(e)}`}
    >
      <span>{layerName(l)}</span>
      <button type="button" className="tl-edge tl-edge-start" aria-label={`When ${layerName(l)} appears`} onPointerDown={(ev) => p.onEdge(ev, 'start')} />
      <button type="button" className="tl-edge tl-edge-end" aria-label={`When ${layerName(l)} disappears`} onPointerDown={(ev) => p.onEdge(ev, 'end')} />
    </div>
  );
}

function MusicBar({ total, zoom, height, onDrag }: { total: number; zoom: number; height: number; onDrag: (e: ReactPointerEvent) => void }) {
  const music = useVideo((s) => s.music)!;
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.max(10, Math.min(total, music.dur - music.offset) * zoom);
  useEffect(() => {
    const cv = ref.current,
      x = cv?.getContext('2d');
    if (!cv || !x) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.min(8000, Math.round(width * dpr));
    cv.height = Math.round((height - 8) * dpr);
    x.clearRect(0, 0, cv.width, cv.height);
    const peaks = music.peaks;
    if (!peaks.length) return;
    x.fillStyle = getComputedStyle(cv).color;
    const n = cv.width;
    for (let i = 0; i < n; i += 2) {
      const songT = music.offset + (i / n) * (width / zoom);
      const v = peaks[Math.min(peaks.length - 1, Math.floor((songT / music.dur) * peaks.length))] * music.volume;
      const h = Math.max(1, v * cv.height * 0.9);
      x.fillRect(i, (cv.height - h) / 2, 1.5, h);
    }
  }, [music, width, zoom, height]);
  return (
    <div className="tl-bar tl-bar-music" style={{ left: 0, width }} onPointerDown={onDrag} title={`${music.name}: drag to choose where the song starts`}>
      <canvas ref={ref} aria-hidden="true" />
      <span>
        {music.name} · from {formatTime(music.offset)}
      </span>
    </div>
  );
}

/** Shows a refusal's reason, if any. */
const tell = (why: string | null) => why && toast(why);

/** The selected clip or layer as the keyframe lane sees it (205 §9). */
interface SelectedItem {
  target: KeyTarget;
  item: LaneItem;
  /** Its name in labels and announcements. */
  name: string;
  /** The row the lane goes under: the clip's track or the layer. */
  row: string;
}

/** The selected picture clip (when no layer is) or layer, or null. */
function selectedItem(pictureTracks: Track[], pictureClips: VClip[], layers: Layer[], selected: string | null, layerSel: string | null, total: number): SelectedItem | null {
  if (layerSel) {
    const layer = layers.find((candidate) => candidate.id === layerSel);
    if (!layer) return null;
    const start = layer.start ?? 0;
    return { target: { layer: layer.id }, item: { start, length: Math.max(0, Math.min(layer.end ?? total, total) - start), keys: layer.keys }, name: layerName(layer), row: layer.id };
  }
  const clip = pictureClips.find((candidate) => candidate.id === selected);
  const track = clip && pictureTracks.find((candidate) => candidate.id === clip.track);
  if (!clip || !track) return null;
  const numberOnTrack = pictureClips.filter((candidate) => candidate.track === clip.track).indexOf(clip) + 1;
  return { target: { clip: clip.id }, item: { start: clip.start, length: clipLength(clip), keys: clip.keys }, name: clipLabel(track, numberOnTrack), row: track.id };
}

/**
 * K (205 D2): keyframes at the playhead for every animated value of the selection, or, when it has keyframes there,
 * removes them.
 */
function keyAtPlayhead(keyed: SelectedItem | null, t: number, fps: number): void {
  if (!keyed) return void toast('Select a clip or a layer first.');
  const props = animatedProps(keyed.item);
  if (!props.length) return void toast('Nothing is animated yet: start with a keyframe button in the inspector.');
  const local = t - keyed.item.start;
  const atKey = keyTimes(keyed.item, fps).some((time) => Math.abs(time.t - local) < 0.5 / fps);
  tell(atKey ? deleteKeys(keyed.target, 'all', local) : toggleKey(keyed.target, props as KeyProp[]));
}

/** A clip as it is now (a drag edits from the store's current state, step by step). */
const current = (id: string) => getVideo().clips.find((c) => c.id === id);
/** A time rounded to the project's frames. */
const toFrame = (t: number) => Math.round(t * getVideo().fps) / getVideo().fps;
/** Says a drag's refusal once (the same reason would repeat on every pointer move). */
function refusals(): (why: string | null) => void {
  let said = '';
  return (why) => {
    if (why && why !== said) toast(why);
    said = why ?? said;
  };
}

/** True (and says why in a toast) when the clip is on a locked track. */
function refused(id: string): boolean {
  const why = clipLocked(id);
  if (why) toast(why);
  return !!why;
}
function refusedMusic(): boolean {
  const why = lockedReason(getVideo().tracks, MUSIC);
  if (why) toast(why);
  return !!why;
}
/** Splits the clip under the playhead (S, the Split button), or says why not (locked, outside a clip, or over the
 * videos-at-once limit). */
function split(): void {
  tell(splitAtPlayheadWhy());
}

/** Track heights in pixels (Q5; D-008: Medium for every track by default). */
const TRACK_PX: Record<TrackHeight, number> = { small: 40, medium: 64, large: 96 };
/** The ruler's height in pixels: files dropped on it go to a new overlay track above the top row. */
const RULER_PX = 24;
const HEIGHTS: [TrackHeight, string][] = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];

/**
 * Adds an overlay track at the top of the picture tracks (203 Q12). At the track limit it is disabled and its title
 * says why.
 */
function AddTrackButton({ tracks }: { tracks: Track[] }) {
  const result = withNewTrack(tracks, isDesktop);
  const refusal = 'error' in result ? result.error : null;
  return (
    <button
      type="button"
      className="tl-tbtn tl-add-track"
      aria-label="Add an overlay track"
      title={refusal ?? 'Add an overlay track above the others, for picture-in-picture and B-roll'}
      aria-disabled={!!refusal}
      onClick={() => tell(refusal ?? addTrack())}
    >
      <PlusIcon />
    </button>
  );
}

/**
 * A track's header: its name, Hide (picture tracks) and Mute (overlay and sound tracks), Lock and its height. An
 * overlay track's header also renames it (the name is a button that becomes a text field: Enter keeps, Escape
 * cancels), and its menu (the height button) moves it up or down among the overlays and deletes it (asking first when
 * it holds clips).
 */
function TrackHead({ track, height, clipCount = 0 }: { track: Track; height: TrackHeight; clipCount?: number }) {
  const isPicture = track.kind !== 'audio';
  const isOverlay = track.kind === 'overlay';
  const [renaming, setRenaming] = useState(false);

  /** Keeps a new name (or says why it can't be used) and leaves the text field. */
  const finishRename = (name: string) => {
    tell(renameTrack(track.id, name));
    setRenaming(false);
  };
  /** Deletes the track, asking first when it holds clips. */
  const confirmDelete = () => {
    const question = `Delete ${track.name} and its ${clipCount === 1 ? 'clip' : `${clipCount} clips`}? Undo brings them back.`;
    if (clipCount === 0 || confirm(question)) tell(deleteTrack(track.id));
  };

  const hideButton = isPicture && (
    <button
      type="button"
      className="tl-tbtn"
      aria-pressed={track.hidden}
      aria-label={`Hide ${track.name}`}
      title={track.hidden ? 'Hidden: not drawn in the preview or the export (its sound still plays)' : 'Hide this track in the preview and the export'}
      onClick={() => setTrack(track.id, { hidden: !track.hidden })}
    >
      <HideIcon on={track.hidden} />
    </button>
  );
  // The main video track has no Mute: its clips' sound is set per clip (201 D2).
  const muteButton = (isOverlay || !isPicture) && (
    <button
      type="button"
      className="tl-tbtn"
      aria-pressed={track.muted}
      aria-label={`Mute ${track.name}`}
      title={track.muted ? 'Muted: silent in the preview and the export' : 'Mute this track in the preview and the export'}
      onClick={() => setTrack(track.id, { muted: !track.muted })}
    >
      <MuteIcon on={track.muted} />
    </button>
  );

  return (
    <div className={`tl-h tl-h-track tl-h-${height}${isOverlay ? ' tl-h-overlay' : ''}`} style={{ height: TRACK_PX[height] }} role="group" aria-label={`${track.name} track`}>
      {renaming ? (
        <input
          className="tl-h-rename"
          aria-label={`Rename ${track.name}`}
          defaultValue={track.name}
          maxLength={40}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') finishRename(event.currentTarget.value);
            else if (event.key === 'Escape') setRenaming(false);
          }}
          onBlur={(event) => finishRename(event.currentTarget.value)}
        />
      ) : isOverlay ? (
        <button type="button" className="tl-h-name tl-h-name-button" aria-label={`Rename ${track.name}`} title="Rename this track" onClick={() => setRenaming(true)}>
          {track.name}
        </button>
      ) : (
        <span className="tl-h-name" aria-hidden="true">
          {!isPicture && <MusicIcon />} {track.name}
        </span>
      )}
      <span className="tl-h-tools">
        {hideButton}
        {muteButton}
        <button
          type="button"
          className="tl-tbtn"
          aria-pressed={track.locked}
          aria-label={`Lock ${track.name}`}
          title={track.locked ? 'Locked: its clips can’t be changed' : 'Lock this track so its clips can’t be changed'}
          onClick={() => setTrack(track.id, { locked: !track.locked })}
        >
          <LockIcon on={track.locked} />
        </button>
        <HeightMenu
          track={track}
          height={height}
          actions={
            isOverlay
              ? [
                  { label: 'Move up (drawn over the track above)', onSelect: () => tell(moveTrack(track.id, 1)) },
                  { label: 'Move down', onSelect: () => tell(moveTrack(track.id, -1)) },
                  { label: `Delete ${track.name}`, onSelect: confirmDelete },
                ]
              : []
          }
        />
      </span>
    </div>
  );
}

/** An extra row in a track's menu (an overlay track's Move up, Move down, Delete). */
interface TrackMenuAction {
  label: string;
  onSelect: () => void;
}

/**
 * The track height button and its menu (Small / Medium / Large, then any `actions`): arrows, Home / End, Enter,
 * Escape. An overlay track's menu also moves it up or down and deletes it (203 §10), so its header stays one row.
 */
function HeightMenu({ track, height, actions = [] }: { track: Track; height: TrackHeight; actions?: TrackMenuAction[] }) {
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLUListElement>(null),
    id = useId();
  const label = actions.length ? `${track.name} track: height and more` : `${track.name} track height`;
  const close = (focus: boolean) => {
    setAt(null);
    if (focus) btn.current?.focus();
  };
  useEffect(() => {
    if (!at) return;
    const onDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setAt(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [at]);
  // Land on the size in use as soon as the menu is there, so the very next key goes to it.
  useLayoutEffect(() => {
    if (at) list.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [at]);
  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    const menuHeight = 120 + actions.length * 32;
    // A fixed menu in a portal: inside the timeline it would be clipped by its scrolling and painted under the clips.
    // Opens upwards near the bottom of the window.
    setAt(r.bottom + menuHeight > window.innerHeight ? { left: r.left, bottom: window.innerHeight - r.top + 2 } : { left: r.left, top: r.bottom + 2 });
  };
  const onListKey = (e: ReactKeyboardEvent) => {
    // React events bubble out of a portal to the timeline, whose keys (Space, S, Delete, arrows) mustn't act here.
    e.stopPropagation();
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = { ArrowDown: Math.min(items.length - 1, i + 1), ArrowUp: Math.max(0, i - 1), Home: 0, End: items.length - 1 }[e.key];
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      close(true);
    } else if (next !== undefined) {
      e.preventDefault();
      items[next]?.focus();
    }
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="tl-tbtn"
        aria-label={label}
        title={`Track height: ${HEIGHTS.find(([h]) => h === height)?.[1]}${actions.length ? '; move or delete the track' : ''}`}
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-controls={at ? id : undefined}
        onClick={() => (at ? close(false) : open())}
      >
        <HeightIcon />
      </button>
      {at &&
        createPortal(
        <ul ref={list} id={id} className="tl-hmenu" role="menu" aria-label={label} style={{ position: 'fixed', ...at }} onKeyDown={onListKey}>
          {HEIGHTS.map(([h, name]) => (
            <li key={h} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={h === height}
                onClick={() => {
                  setTrackHeight(track.id, h);
                  close(true);
                }}
              >
                {name}
              </button>
            </li>
          ))}
          {actions.length > 0 && <li role="separator" className="tl-hmenu-sep" />}
          {actions.map((action) => (
            <li key={action.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close(true);
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>,
          document.body,
        )}
    </>
  );
}

/** The edit tools (202, Q5): what dragging a clip or its edge does, and its key. */
const TOOLS: [Tool, string, string, string][] = [
  ['select', 'Select', 'V', 'drag a clip to move it, its edges to trim (Shift: ripple)'],
  ['roll', 'Roll', 'R', 'drag a cut to move it between two clips; the length stays'],
  ['slip', 'Slip', 'Y', 'drag a video clip to play another part of it, in the same place'],
  ['slide', 'Slide', 'U', 'drag a clip between its neighbours; they give and take the time'],
];

/** Play controls, editing buttons, the edit tools, Magnetic and Snap, and zoom, above the timeline. */
export function Transport() {
  const playing = useVideo((s) => s.playing),
    t = useVideo((s) => s.t),
    clips = useVideo((s) => s.clips),
    selected = useVideo((s) => s.selected),
    zoom = useVideo((s) => s.zoom),
    tool = useVideo((s) => s.tool),
    magnetic = useVideo((s) => s.magnetic),
    snapping = useVideo((s) => s.snapping),
    tracks = useVideo((s) => s.tracks);
  const total = useVideo(videoLength);
  const group = useId();
  return (
    <div className="tl-transport" role="toolbar" aria-label="Playback and editing">
      <button type="button" className="pbtn" aria-label="Go to the start" onClick={() => (setPlaying(false), setPlayhead(0))}>
        <SkipBackIcon />
      </button>
      <button type="button" className="tl-play" aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} disabled={!clips.length} onClick={() => setPlaying(!playing)}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" className="pbtn" aria-label="Go to the end" onClick={() => (setPlaying(false), setPlayhead(total))}>
        <SkipForwardIcon />
      </button>
      <span className="tl-time">
        <b>{formatTime(t)}</b> / {formatTime(total)}
      </span>
      <span className="tl-sep" />
      <button type="button" className="sbtn" disabled={!clips.length} onClick={split} title="Split at the playhead (S)" aria-label="Split">
        <ScissorsIcon />
        <span className="mst-l">Split</span>
      </button>
      <button type="button" className="sbtn" disabled={!selected} onClick={() => selected && !refused(selected) && tell(duplicateClipWhy(selected))} title="Duplicate the clip" aria-label="Duplicate">
        <CopyIcon />
        <span className="mst-l">Duplicate</span>
      </button>
      <MoveToTrackMenu selectedId={selected} tracks={tracks} clips={clips} />
      <button type="button" className="sbtn" disabled={!selected} onClick={() => selected && !refused(selected) && removeClip(selected)} title="Remove the clip (Delete)" aria-label="Delete">
        <TrashIcon />
        <span className="mst-l">Delete</span>
      </button>
      <span className="tl-sep" />
      <div className="tl-tools" role="radiogroup" aria-label="Edit tool">
        {TOOLS.map(([id, name, key, what]) => (
          <label key={id} className="tl-tool" title={`${name} (${key}): ${what}`}>
            <input type="radio" className="vh" name={group} checked={tool === id} onChange={() => setTool(id)} aria-label={name} title={`${name} (${key}): ${what}`} />
            <EditToolIcon tool={id} />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="tl-switch"
        aria-pressed={magnetic}
        aria-label="Magnetic"
        title={magnetic ? 'Magnetic: clips stay end to end, edits ripple (switch off to leave gaps)' : 'Magnetic off: edits leave gaps; Shift ripples (switch on to close every gap)'}
        onClick={() => tell(setMagnetic(!magnetic))}
      >
        <MagneticIcon />
        <span className="mst-l">Magnetic</span>
      </button>
      <button
        type="button"
        className="tl-switch"
        aria-pressed={snapping}
        aria-label="Snap"
        title={snapping ? 'Snapping: drags catch clip edges, layer edges and the playhead (hold Alt to skip)' : 'Snapping off: drags follow the pointer to the frame'}
        onClick={() => setSnapping(!snapping)}
      >
        <SnapIcon />
        <span className="mst-l">Snap</span>
      </button>
      <span className="tl-grow" />
      <button type="button" className="pbtn" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.25)}>
        <ZoomOutIcon />
      </button>
      <input className="tl-zoom" type="range" min={4} max={400} step={1} value={zoom} aria-label="Timeline zoom" onChange={(e) => setZoom(+e.target.value)} />
      <button type="button" className="pbtn" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.25)}>
        <ZoomInIcon />
      </button>
      <button
        type="button"
        className="sbtn"
        onClick={() => {
          const el = document.querySelector<HTMLElement>('.tl-scroll');
          if (el && total) setZoom((el.clientWidth - 40) / total);
        }}
      >
        Fit
      </button>
    </div>
  );
}

/**
 * "Move to track": moves the selected clip to another picture track at the same time (or the nearest free spot
 * there), so a clip changes track without a mouse (203 §10). Lists the other picture tracks, top first.
 */
function MoveToTrackMenu({ selectedId, tracks, clips }: { selectedId: string | null; tracks: Track[]; clips: VClip[] }) {
  const selectedClip = clips.find((clip) => clip.id === selectedId);
  const otherTracks = pictureTracksTopFirst(tracks).filter((track) => track.id !== selectedClip?.track);
  const items = otherTracks.map((track) => ({
    key: track.id,
    label: track.name,
    disabled: !selectedClip,
    onSelect: () => selectedClip && !refused(selectedClip.id) && tell(moveClipToTrack(selectedClip.id, track.id)),
  }));
  if (!items.length) items.push({ key: 'none', label: 'Add an overlay track first', disabled: true, onSelect: () => undefined });
  return <MoreMenu items={items} label="Move the clip to another track" text="Move to" className="tl-move-menu" align="left" />;
}
