import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { Keyframes } from '../../engine/keyframes';
import type { Layer } from '../../engine/layers';
import { formatTime } from '../../engine/timeline';
import { snapTargets, snapTime } from '../../engine/timeSnap';
import type { Track } from '../../engine/tracks';
import { toast } from '../../lib/toast';
import { addMedia, NEW_TRACK } from '../../state/videoMedia';
import { addFromPool } from '../../state/videoPool';
import { isPoolDrag, POOL_DRAG } from './poolList';
import {
  getVideo,
  setPlayhead,
  setPlaying,
  setZoom,
  useVideo,
  videoLength,
  type TrackHeight,
  type VClip,
  type VSound,
} from '../../state/videoStore';
import { KeyframeLane, KeyframeLaneHeads, animatedProps } from './KeyframeLane';
import { PictureRow, type DropMarker } from './PictureRow';
import { onTimelineKey, selectedItem, type SelectedItem } from './timelineActions';
import { SoundRow, useSoundMix } from './SoundRow';
import { LayerRow, type SnapTime } from './TimelineBars';
import { RULER_PX, rulerLabel, SNAP_PX, startDrag, tickStep, toFrame, TRACK_PX } from './timelineDrag';
import {
  describeClipChange,
  describeKeyChange,
  describeSpeedChange,
  describeTransitionChange,
  pictureTracksTopFirst,
  rowUnderPointer,
  soundAnnouncement,
  type RowBounds,
  type KeyOwner,
} from './timelineRows';
import { AddSoundTrackButton, AddTrackButton, TrackHead } from './TrackHead';

/*
 * The video editor's timeline: a time ruler, one row per picture track (overlay tracks above the main video track, 203
 * §10) with their clips and filmstrips, one row per layer, and one per audio track with its sound clips and their waveforms (208). Add track (the + by the
 * ruler) adds an overlay track; files dropped on a row land there at the drop time, on the ruler in a new track; a
 * clip dragged onto another picture row moves to that track ("Move to" in the toolbar does it by keyboard). Everything
 * is direct: what a drag on a clip does depends on the edit tool (202, PictureRow.tsx): Select
 * reorders it (Magnetic on) or puts it at a time (off) and trims at its edges (ripple with Magnetic on or Shift), Roll
 * moves the cut at an edge, Slip changes what a video plays, Slide moves a clip between its neighbours. Drag a layer's
 * bar to move it in time or its ends to change when it shows, drag a sound clip as a picture clip, its top corners to
 * fade it and its volume line to set its volume (208, SoundRow.tsx),
 * drag the playhead or click anywhere to seek. Moves snap to clip edges, layer edges and the playhead (Snap off, or Alt
 * held: to the frame, as is everything that doesn't snap). Ctrl + wheel zooms; the playhead is followed while playing.
 * Keyboard (with the timeline focused, timelineActions.ts): Space play / pause, S split, Shift + F freeze frame at the
 * playhead (207), Delete remove (Magnetic
 * off: leaves a gap; Shift + Delete ripples; on a focused gap: closes it), Alt + ← → nudge the selected clip a frame
 * with the tool (Shift: a second), Q / W ripple-trim its start / end to the playhead,
 * ← → a frame (Shift: a second), Home / End, + / − zoom; V / R / Y / U pick the edit tool (Select, Roll, Slip, Slide).
 * An animated clip or layer, when selected, has a keyframe lane under its row (205 §9, KeyframeLane.tsx): K adds
 * keyframes at the playhead for its animated values (or removes the ones there), Alt + [ / ] jump to its previous / next.
 */

/**
 * Announces each change to a picture track (the clip, its track and new times, and what it did to transitions) and to
 * the selection's keyframes and the sound clips (208: "Audio 2: Whoosh, fade in 0.5 s"), politely, once a drag settles.
 * @param clips the clips
 * @param sounds the sound clips
 * @param keyed the selection
 * @returns the latest announcement
 */
function useAnnouncements(clips: VClip[], sounds: VSound[], keyed: SelectedItem | null): string {
  const [said, setSaid] = useState('');
  const clipsBefore = useRef(clips);
  useEffect(() => {
    const previous = clipsBefore.current;
    clipsBefore.current = clips;
    if (previous === clips) return;
    const state = getVideo();
    // A clip's change and what it did to transitions (206: one dropped by an edit, or one added, changed, removed).
    // A speed change (207) is said as one ("Clip 2: 0.5×, now 8.4 s") rather than as the clip's new times.
    const clipChange =
      describeSpeedChange(previous, clips, state.tracks) ||
      describeClipChange(previous, clips, state.tracks, state.selected);
    const message = [clipChange, describeTransitionChange(previous, clips, state.tracks)].filter(Boolean).join('. ');
    if (!message) return;
    const timer = setTimeout(() => setSaid(message), 250);
    return () => clearTimeout(timer);
  }, [clips]);
  const soundsBefore = useRef(sounds);
  useEffect(() => {
    const previous = soundsBefore.current;
    soundsBefore.current = sounds;
    if (previous === sounds) return;
    const message = soundAnnouncement(previous, sounds, getVideo().tracks, videoLength(getVideo()));
    if (!message) return;
    const timer = setTimeout(() => setSaid(message), 250);
    return () => clearTimeout(timer);
  }, [sounds]);
  const keysBefore = useRef<{ id: string; keys?: Keyframes<string> } | null>(null);
  const keyedId = keyed ? JSON.stringify(keyed.target) : '';
  const keyedKeys = keyed?.item.keys;
  useEffect(() => {
    const previous = keysBefore.current;
    keysBefore.current = { id: keyedId, keys: keyedKeys };
    if (!keyed || previous?.id !== keyedId) return;
    const message = describeKeyChange(previous.keys, keyedKeys, keyed.name, keyed.item.start, getVideo().fps);
    if (!message) return;
    const timer = setTimeout(() => setSaid(message), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of the keys (or of the selection) is announced
  }, [keyedId, keyedKeys]);
  return said;
}

/**
 * The scrolling element: its width (followed as it resizes; a ResizeObserver reports it once on observing), following
 * the playhead while playing, and Ctrl + wheel zooming around the pointer (a native listener: React's wheel events are
 * passive).
 * @param time the playhead
 * @param zoom pixels per second
 * @param playing whether the video plays
 * @returns the element's ref and its width in pixels
 */
function useScroller(
  time: number,
  zoom: number,
  playing: boolean,
): { scroller: RefObject<HTMLDivElement | null>; viewWidth: number } {
  const scroller = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(600);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = scroller.current;
    if (!element || !playing) return;
    const x = time * zoom;
    if (x < element.scrollLeft + 40 || x > element.scrollLeft + element.clientWidth - 60)
      element.scrollLeft = Math.max(0, x - element.clientWidth * 0.25);
  }, [time, zoom, playing]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const oldZoom = getVideo().zoom;
      const rect = element.getBoundingClientRect();
      const at = (element.scrollLeft + event.clientX - rect.left) / oldZoom;
      const newZoom = Math.max(4, Math.min(400, oldZoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
      setZoom(newZoom);
      requestAnimationFrame(() => {
        element.scrollLeft = at * newZoom - (event.clientX - rect.left);
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);
  return { scroller, viewWidth };
}

/** The left column of track headers. */
interface TimelineHeadsProps {
  tracks: Track[];
  pictureTracks: Track[];
  clips: VClip[];
  /** The sound clips (208): a sound track's header asks before deleting the ones it holds. */
  sounds: readonly { track: string }[];
  layers: Layer[];
  trackView: Partial<Record<string, TrackHeight>>;
  lane: SelectedItem | null;
  keysExpanded: boolean;
  setKeysExpanded: (expanded: boolean) => void;
}

/**
 * The left column: the add-track buttons, each picture track's header (with the keyframe lane's heads under the
 * selection's row), the layers' label and each sound track's header (208).
 * @param props the tracks, clips, layers, heights and the keyframe lane
 */
function TimelineHeads({
  tracks,
  pictureTracks,
  clips,
  sounds,
  layers,
  trackView,
  lane,
  keysExpanded,
  setKeysExpanded,
}: Readonly<TimelineHeadsProps>) {
  const soundTracks = tracks.filter((track) => track.kind === 'audio');
  const layerRows = layers.length ? [...layers].reverse() : [null];
  return (
    <div className="tl-heads">
      <div className="tl-h tl-h-ruler">
        <AddTrackButton tracks={tracks} />
        <AddSoundTrackButton tracks={tracks} />
      </div>
      {pictureTracks.map((track) => (
        <div key={track.id}>
          <TrackHead
            track={track}
            height={trackView[track.id] ?? 'medium'}
            clipCount={clips.filter((clip) => clip.track === track.id).length}
          />
          {lane?.row === track.id && (
            <KeyframeLaneHeads item={lane.item} on="clip" expanded={keysExpanded} onExpand={setKeysExpanded} />
          )}
        </div>
      ))}
      {layerRows.map((layer, index) => (
        <div key={layer?.id ?? 'none'}>
          <div className="tl-h tl-h-layer" aria-hidden="true">
            {index === 0 ? 'Layers' : ''}
          </div>
          {layer && lane?.row === layer.id && (
            <KeyframeLaneHeads item={lane.item} on="layer" expanded={keysExpanded} onExpand={setKeysExpanded} />
          )}
        </div>
      ))}
      {soundTracks.map((track) => (
        <div key={track.id}>
          <TrackHead
            track={track}
            height={trackView[track.id] ?? 'medium'}
            clipCount={sounds.filter((sound) => sound.track === track.id).length}
          />
          {lane?.row === track.id && (
            <KeyframeLaneHeads item={lane.item} on="sound" expanded={keysExpanded} onExpand={setKeysExpanded} />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Whose keys a lane shows, for its names.
 * @param shown the selection
 * @returns a clip's, a layer's or a sound clip's
 */
function laneKind(shown: SelectedItem): KeyOwner {
  if ('clip' in shown.target) return 'clip';
  return 'sound' in shown.target ? 'sound' : 'layer';
}

/** The time ruler. */
interface RulerProps {
  width: number;
  zoom: number;
  dropMarker: DropMarker | null;
  seekFrom: (event: ReactPointerEvent) => void;
}

/**
 * The time ruler: ticks with labels, a click seeks; files dragged over it go to a new track (its marker).
 * @param props the canvas width, zoom, drop marker and seeking
 */
function Ruler({ width, zoom, dropMarker, seekFrom }: Readonly<RulerProps>) {
  const step = tickStep(zoom);
  const ticks = Array.from({ length: Math.floor(width / zoom / step) + 1 }, (_, index) => index * step);
  const isNewTrack = dropMarker?.target === 'new';
  return (
    <div className={`tl-ruler${isNewTrack ? ' tl-new-track' : ''}`} onPointerDown={seekFrom}>
      {ticks.map((tick) => (
        <span key={tick} className="tl-tick" style={{ left: tick * zoom }}>
          {rulerLabel(tick)}
        </span>
      ))}
      {isNewTrack && <span className="tl-drop" style={{ left: dropMarker.at * zoom }} />}
    </div>
  );
}

/** The video editor's timeline (see the file's comment). */
export function Timeline() {
  const clips = useVideo((state) => state.clips);
  const layers = useVideo((state) => state.layers);
  const layerSel = useVideo((state) => state.layerSel);
  const selected = useVideo((state) => state.selected);
  const time = useVideo((state) => state.t);
  const zoom = useVideo((state) => state.zoom);
  const playing = useVideo((state) => state.playing);
  const tracks = useVideo((state) => state.tracks);
  const trackView = useVideo((state) => state.trackView);
  const tool = useVideo((state) => state.tool);
  const total = useVideo(videoLength);
  const rowHeight = (id: string) => TRACK_PX[trackView[id] ?? 'medium'];
  // The picture tracks as rows, the top overlay first and the main track last (203 §10).
  const pictureTracks = pictureTracksTopFirst(tracks);
  const pictureTrackIds = new Set(pictureTracks.map((track) => track.id));
  const pictureClips = clips.filter((clip) => pictureTrackIds.has(clip.track));
  const soundTracks = tracks.filter((track) => track.kind === 'audio');
  const sounds = useVideo((state) => state.sounds);
  const soundSel = useVideo((state) => state.soundSel);
  const mix = useSoundMix();
  const { scroller, viewWidth } = useScroller(time, zoom, playing);
  const canvas = useRef<HTMLDivElement>(null);
  const width = Math.max(viewWidth - 2, total * zoom + 160);

  // The selected clip or layer, for its keyframe lane, K and Alt + [ / ] (205 §9); the lane shows when it is animated.
  const [keysExpanded, setKeysExpanded] = useState(false);
  const keyed = selectedItem({
    pictureTracks,
    pictureClips,
    layers,
    selected,
    layerSel,
    total,
    soundTracks,
    sounds,
    soundSel,
  });
  const lane = keyed && animatedProps(keyed.item).length ? keyed : null;
  const said = useAnnouncements(clips, sounds, keyed);

  // The picture rows' elements, so a drag or a file drop can tell which row the pointer is over.
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const rowBounds = (): RowBounds[] =>
    pictureTracksTopFirst(getVideo().tracks).flatMap((track) => {
      const rect = rowElements.current.get(track.id)?.getBoundingClientRect();
      return rect ? [{ trackId: track.id, top: rect.top, bottom: rect.bottom }] : [];
    });
  // The picture row (or the new-track strip: the ruler above the top row) under a pointer, or null.
  const rowTargetAt = (clientY: number): string | null => rowUnderPointer(rowBounds(), clientY, RULER_PX);
  // Where a clip dragged onto another row, or files dragged over the timeline, would land: drawn as a marker there.
  const [dropMarker, setDropMarker] = useState<DropMarker | null>(null);

  const timeAt = (clientX: number) => {
    const left = canvas.current?.getBoundingClientRect().left ?? 0;
    return Math.max(0, Math.min(total, (clientX - left) / zoom));
  };
  // The sound row under a drag, by its track id (SoundRow's data-sound-track), or null.
  const soundRowAt = (event: ReactDragEvent): string | null =>
    event.target instanceof Element ? (event.target.closest<HTMLElement>('[data-sound-track]')?.dataset.soundTrack ?? null) : null;
  // Files, or a media pool row (504), dragged over the timeline: a marker on the row (or above the top row: a new
  // track) at the pointer's time.
  const onFilesOver = (event: ReactDragEvent) => {
    const { types } = event.dataTransfer;
    if (!types.includes('Files') && !isPoolDrag(types)) return;
    // A pool row may also go on a sound row (its sound); no marker is drawn there.
    if (isPoolDrag(types) && soundRowAt(event)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropMarker(null);
      return;
    }
    const target = rowTargetAt(event.clientY);
    if (!target) {
      setDropMarker(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropMarker({ target, at: toFrame(timeAt(event.clientX)) });
  };
  // Files or a media pool row dropped on a row land there at the drop time; above the top row, on a new overlay track.
  const onFilesDrop = (event: ReactDragEvent) => {
    const pooled = event.dataTransfer.getData(POOL_DRAG);
    const target = rowTargetAt(event.clientY) ?? (pooled ? soundRowAt(event) : null);
    setDropMarker(null);
    if (!target || (!pooled && !event.dataTransfer.files.length)) return;
    event.preventDefault();
    const place = { track: target === 'new' ? NEW_TRACK : target, at: toFrame(timeAt(event.clientX)) };
    const files = [...event.dataTransfer.files].map((file) => ({ name: file.name, blob: file, type: file.type }));
    void (pooled ? addFromPool(pooled, place) : addMedia(files, place)).then((messages) => {
      messages.forEach((message) => toast(message));
    });
  };

  // Snaps a time to the nearest clip edge, layer edge, sound clip edge (208) or the playhead within a few pixels, leaving
  // out the dragged clip, layer or sound clip; with Snap off, Alt held, or nothing near, to the nearest frame.
  const snap: SnapTime = (value, skip = {}, event) => {
    const state = getVideo();
    const snapped =
      state.snapping && !event?.altKey
        ? snapTime(value, snapTargets(pictureClips, layers, state.t, total, skip, state.sounds), SNAP_PX / zoom)
        : value;
    return snapped === value ? toFrame(value) : snapped;
  };
  // Snaps a clip moved to start at `start`: by its start, else by its end.
  const snapSpan = (start: number, length: number, id: string, event: PointerEvent) => {
    const byStart = snap(start, { clip: id }, event);
    return byStart !== toFrame(start) ? byStart : snap(start + length, { clip: id }, event) - length;
  };
  const seekFrom = (event: ReactPointerEvent) => {
    setPlaying(false);
    setPlayhead(timeAt(event.clientX));
    startDrag(event, (_dx, moveEvent) => setPlayhead(timeAt(moveEvent.clientX)));
  };
  // The selection's keyframe lane, under its row.
  const laneRow = (shown: SelectedItem) => (
    <KeyframeLane
      key={shown.row}
      target={shown.target}
      item={shown.item}
      on={laneKind(shown)}
      name={shown.name}
      zoom={zoom}
      expanded={keysExpanded}
      snapAt={(value, event) => snap(value, {}, event)}
      drag={startDrag}
    />
  );

  return (
    <div className={`tl tl-tool-${tool}`} onKeyDown={(event) => onTimelineKey(event, keyed, total)}>
      <TimelineHeads
        tracks={tracks}
        pictureTracks={pictureTracks}
        clips={clips}
        sounds={sounds}
        layers={layers}
        trackView={trackView}
        lane={lane}
        keysExpanded={keysExpanded}
        setKeysExpanded={setKeysExpanded}
      />
      <div className="tl-live vh" aria-live="polite">
        {said}
      </div>
      <div
        className="tl-scroll"
        ref={scroller}
        tabIndex={0}
        role="group"
        aria-label={`Timeline, ${formatTime(total)}. Space plays, S splits, Delete removes, arrow keys move the playhead, V R Y U pick the edit tool, Alt + arrow keys nudge the selected clip, Q and W trim it to the playhead.`}
      >
        <div
          className="tl-canvas"
          ref={canvas}
          style={{ width }}
          onDragOver={onFilesOver}
          onDragLeave={() => setDropMarker(null)}
          onDrop={onFilesDrop}
        >
          <Ruler width={width} zoom={zoom} dropMarker={dropMarker} seekFrom={seekFrom} />
          {pictureTracks.map((track) => (
            <div key={track.id}>
              <PictureRow
                track={track}
                clips={clips.filter((clip) => clip.track === track.id)}
                height={rowHeight(track.id)}
                zoom={zoom}
                tool={tool}
                selected={layerSel || soundSel ? null : selected}
                snap={snap}
                snapSpan={snapSpan}
                seekFrom={seekFrom}
                rowRef={(element) => {
                  if (element) rowElements.current.set(track.id, element);
                  else rowElements.current.delete(track.id);
                }}
                rowTargetAt={rowTargetAt}
                dropMarkerAt={dropMarker?.target === track.id ? dropMarker.at : null}
                setDropMarker={setDropMarker}
                mix={mix}
              />
              {lane?.row === track.id && laneRow(lane)}
            </div>
          ))}
          {layers.length === 0 && (
            <div className="tl-row tl-layer tl-empty" onPointerDown={seekFrom}>
              <span>Text, stickers and drawings appear here, one row each</span>
            </div>
          )}
          {[...layers].reverse().map((layer) => (
            <div key={layer.id}>
              <LayerRow
                layer={layer}
                total={total}
                zoom={zoom}
                selected={layer.id === layerSel}
                snap={snap}
                seekFrom={seekFrom}
              />
              {lane?.row === layer.id && laneRow(lane)}
            </div>
          ))}
          {soundTracks.map((track) => (
            <div key={track.id}>
              <SoundRow
                track={track}
                sounds={sounds.filter((sound) => sound.track === track.id)}
                total={total}
                zoom={zoom}
                height={rowHeight(track.id)}
                tool={tool}
                selected={soundSel}
                mix={mix}
                snap={snap}
                seekFrom={seekFrom}
              />
              {lane?.row === track.id && laneRow(lane)}
            </div>
          ))}
          <div className="tl-playhead" style={{ left: Math.min(time, total) * zoom }}>
            <button
              type="button"
              className="tl-playhead-grip"
              aria-label={`Playhead at ${formatTime(time)}`}
              onPointerDown={(event) => {
                setPlaying(false);
                startDrag(event, (_dx, moveEvent) => setPlayhead(snap(timeAt(moveEvent.clientX), {}, moveEvent)));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
