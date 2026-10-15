import { useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { Keyframes } from '../../engine/keyframes';
import type { Layer } from '../../engine/layers';
import { formatTime } from '../../engine/timeline';
import { snapTargets, snapTime } from '../../engine/timeSnap';
import { MUSIC, type Track } from '../../engine/tracks';
import { toast } from '../../lib/toast';
import { addMedia, NEW_TRACK } from '../../state/videoMedia';
import { getVideo, setPlayhead, setPlaying, setZoom, useVideo, videoLength, type TrackHeight, type VClip } from '../../state/videoStore';
import { KeyframeLane, KeyframeLaneHeads, animatedProps } from './KeyframeLane';
import { PictureRow, type DropMarker } from './PictureRow';
import { onTimelineKey, selectedItem, type SelectedItem } from './timelineActions';
import { LayerRow, MusicRow, type SnapTime } from './TimelineBars';
import { RULER_PX, rulerLabel, SNAP_PX, startDrag, tickStep, toFrame, TRACK_PX } from './timelineDrag';
import { describeClipChange, describeKeyChange, describeTransitionChange, pictureTracksTopFirst, rowUnderPointer, type RowBounds } from './timelineRows';
import { AddTrackButton, TrackHead } from './TrackHead';

/*
 * The video editor's timeline: a time ruler, one row per picture track (overlay tracks above the main video track, 203
 * §10) with their clips and filmstrips, one row per layer, and the music with its waveform. Add track (the + by the
 * ruler) adds an overlay track; files dropped on a row land there at the drop time, on the ruler in a new track; a
 * clip dragged onto another picture row moves to that track ("Move to" in the toolbar does it by keyboard). Everything
 * is direct: what a drag on a clip does depends on the edit tool (202, PictureRow.tsx): Select
 * reorders it (Magnetic on) or puts it at a time (off) and trims at its edges (ripple with Magnetic on or Shift), Roll
 * moves the cut at an edge, Slip changes what a video plays, Slide moves a clip between its neighbours. Drag a layer's
 * bar to move it in time or its ends to change when it shows, drag the music to slide the song (TimelineBars.tsx),
 * drag the playhead or click anywhere to seek. Moves snap to clip edges, layer edges and the playhead (Snap off, or Alt
 * held: to the frame, as is everything that doesn't snap). Ctrl + wheel zooms; the playhead is followed while playing.
 * Keyboard (with the timeline focused, timelineActions.ts): Space play / pause, S split, Delete remove (Magnetic
 * off: leaves a gap; Shift + Delete ripples; on a focused gap: closes it), Alt + ← → nudge the selected clip a frame
 * with the tool (Shift: a second), Q / W ripple-trim its start / end to the playhead,
 * ← → a frame (Shift: a second), Home / End, + / − zoom; V / R / Y / U pick the edit tool (Select, Roll, Slip, Slide).
 * An animated clip or layer, when selected, has a keyframe lane under its row (205 §9, KeyframeLane.tsx): K adds
 * keyframes at the playhead for its animated values (or removes the ones there), Alt + [ / ] jump to its previous / next.
 */

/**
 * Announces each change to a picture track (the clip, its track and new times, and what it did to transitions) and to
 * the selection's keyframes, politely, once a drag settles.
 * @param clips the clips
 * @param keyed the selection
 * @returns the latest announcement
 */
function useAnnouncements(clips: VClip[], keyed: SelectedItem | null): string {
  const [said, setSaid] = useState('');
  const clipsBefore = useRef(clips);
  useEffect(() => {
    const previous = clipsBefore.current;
    clipsBefore.current = clips;
    if (previous === clips) return;
    const state = getVideo();
    // A clip's change and what it did to transitions (206: one dropped by an edit, or one added, changed, removed).
    const message = [describeClipChange(previous, clips, state.tracks, state.selected), describeTransitionChange(previous, clips, state.tracks)].filter(Boolean).join('. ');
    if (!message) return;
    const timer = setTimeout(() => setSaid(message), 250);
    return () => clearTimeout(timer);
  }, [clips]);
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
function useScroller(time: number, zoom: number, playing: boolean): { scroller: RefObject<HTMLDivElement | null>; viewWidth: number } {
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
    if (x < element.scrollLeft + 40 || x > element.scrollLeft + element.clientWidth - 60) element.scrollLeft = Math.max(0, x - element.clientWidth * 0.25);
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
  layers: Layer[];
  trackView: Partial<Record<string, TrackHeight>>;
  lane: SelectedItem | null;
  keysExpanded: boolean;
  setKeysExpanded: (expanded: boolean) => void;
}

/**
 * The left column: the add-track button, each picture track's header (with the keyframe lane's heads under the
 * selection's row), the layers' label and the music track's header.
 * @param props the tracks, clips, layers, heights and the keyframe lane
 */
function TimelineHeads({ tracks, pictureTracks, clips, layers, trackView, lane, keysExpanded, setKeysExpanded }: Readonly<TimelineHeadsProps>) {
  const musicTrack = tracks.find((track) => track.id === MUSIC);
  const layerRows = layers.length ? [...layers].reverse() : [null];
  return (
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
      {layerRows.map((layer, index) => (
        <div key={layer?.id ?? 'none'}>
          <div className="tl-h tl-h-layer" aria-hidden="true">
            {index === 0 ? 'Layers' : ''}
          </div>
          {layer && lane?.row === layer.id && <KeyframeLaneHeads item={lane.item} on="layer" expanded={keysExpanded} onExpand={setKeysExpanded} />}
        </div>
      ))}
      {musicTrack && <TrackHead track={musicTrack} height={trackView[MUSIC] ?? 'medium'} />}
    </div>
  );
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
  const musicTrack = tracks.find((track) => track.id === MUSIC);
  const { scroller, viewWidth } = useScroller(time, zoom, playing);
  const canvas = useRef<HTMLDivElement>(null);
  const width = Math.max(viewWidth - 2, total * zoom + 160);

  // The selected clip or layer, for its keyframe lane, K and Alt + [ / ] (205 §9); the lane shows when it is animated.
  const [keysExpanded, setKeysExpanded] = useState(false);
  const keyed = selectedItem({ pictureTracks, pictureClips, layers, selected, layerSel, total });
  const lane = keyed && animatedProps(keyed.item).length ? keyed : null;
  const said = useAnnouncements(clips, keyed);

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
  // Files dragged over the timeline: a marker on the row (or above the top row: a new track) at the pointer's time.
  const onFilesOver = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    const target = rowTargetAt(event.clientY);
    if (!target) {
      setDropMarker(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropMarker({ target, at: toFrame(timeAt(event.clientX)) });
  };
  // Files dropped on a row land there at the drop time; above the top row, on a new overlay track.
  const onFilesDrop = (event: ReactDragEvent) => {
    const target = rowTargetAt(event.clientY);
    setDropMarker(null);
    if (!target || !event.dataTransfer.files.length) return;
    event.preventDefault();
    const files = [...event.dataTransfer.files].map((file) => ({ name: file.name, blob: file, type: file.type }));
    void addMedia(files, { track: target === 'new' ? NEW_TRACK : target, at: toFrame(timeAt(event.clientX)) }).then((messages) => {
      messages.forEach((message) => toast(message));
    });
  };

  // Snaps a time to the nearest clip edge, layer edge or the playhead within a few pixels, leaving out the dragged clip
  // or layer; with Snap off, Alt held, or nothing near, to the nearest frame.
  const snap: SnapTime = (value, skip = {}, event) => {
    const state = getVideo();
    const snapped = state.snapping && !event?.altKey ? snapTime(value, snapTargets(pictureClips, layers, state.t, total, skip), SNAP_PX / zoom) : value;
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
      on={'clip' in shown.target ? 'clip' : 'layer'}
      name={shown.name}
      zoom={zoom}
      expanded={keysExpanded}
      snapAt={(value, event) => snap(value, {}, event)}
      drag={startDrag}
    />
  );

  return (
    <div className={`tl tl-tool-${tool}`} onKeyDown={(event) => onTimelineKey(event, keyed, total)}>
      <TimelineHeads tracks={tracks} pictureTracks={pictureTracks} clips={clips} layers={layers} trackView={trackView} lane={lane} keysExpanded={keysExpanded} setKeysExpanded={setKeysExpanded} />
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
        <div className="tl-canvas" ref={canvas} style={{ width }} onDragOver={onFilesOver} onDragLeave={() => setDropMarker(null)} onDrop={onFilesDrop}>
          <Ruler width={width} zoom={zoom} dropMarker={dropMarker} seekFrom={seekFrom} />
          {pictureTracks.map((track) => (
            <div key={track.id}>
              <PictureRow
                track={track}
                clips={clips.filter((clip) => clip.track === track.id)}
                height={rowHeight(track.id)}
                zoom={zoom}
                tool={tool}
                selected={layerSel ? null : selected}
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
              <LayerRow layer={layer} total={total} zoom={zoom} selected={layer.id === layerSel} snap={snap} seekFrom={seekFrom} />
              {lane?.row === layer.id && laneRow(lane)}
            </div>
          ))}
          {musicTrack && <MusicRow track={musicTrack} total={total} zoom={zoom} height={rowHeight(MUSIC)} seekFrom={seekFrom} />}
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
