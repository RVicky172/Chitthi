import { useId } from 'react';
import { formatTime } from '../../engine/timeline';
import type { Track } from '../../engine/tracks';
import { duplicateClipWhy, moveClipToTrack, removeClip } from '../../state/videoClips';
import { setMagnetic, setPlayhead, setPlaying, setSnapping, setTool, setZoom, useVideo, videoLength, type VClip } from '../../state/videoStore';
import { CopyIcon, EditToolIcon, MagneticIcon, PauseIcon, PlayIcon, ScissorsIcon, SkipBackIcon, SkipForwardIcon, SnapIcon, TrashIcon, ZoomInIcon, ZoomOutIcon } from '../icons';
import { MoreMenu } from '../MoreMenu';
import { EDIT_TOOLS, refuseLocked, splitAtPlayhead, tell } from './timelineActions';
import { pictureTracksTopFirst } from './timelineRows';

/* The bar above the timeline: play controls, editing buttons, the edit tools, Magnetic and Snap, and zoom. */

/**
 * Stops playing and moves the playhead.
 * @param time where to
 */
function goTo(time: number): void {
  setPlaying(false);
  setPlayhead(time);
}

/**
 * Runs an edit on the selected clip, unless it is on a locked track.
 * @param selected the selected clip, or null
 * @param edit the edit
 */
function editSelected(selected: string | null, edit: (id: string) => void): void {
  if (selected && !refuseLocked(selected)) edit(selected);
}

/**
 * Zooms so the whole video fits the timeline's width.
 * @param total the video's length
 */
function zoomToFit(total: number): void {
  const scroller = document.querySelector<HTMLElement>('.tl-scroll');
  if (scroller && total) setZoom((scroller.clientWidth - 40) / total);
}

/** The "Move to track" menu. */
interface MoveToTrackMenuProps {
  selectedId: string | null;
  tracks: Track[];
  clips: VClip[];
}

/**
 * "Move to track": moves the selected clip to another picture track at the same time (or the nearest free spot
 * there), so a clip changes track without a mouse (203 §10). Lists the other picture tracks, top first.
 * @param props the selected clip, the tracks and the clips
 */
function MoveToTrackMenu({ selectedId, tracks, clips }: Readonly<MoveToTrackMenuProps>) {
  const selectedClip = clips.find((clip) => clip.id === selectedId);
  const otherTracks = pictureTracksTopFirst(tracks).filter((track) => track.id !== selectedClip?.track);
  const items = otherTracks.map((track) => ({
    key: track.id,
    label: track.name,
    disabled: !selectedClip,
    onSelect: () => editSelected(selectedClip?.id ?? null, (id) => tell(moveClipToTrack(id, track.id))),
  }));
  if (!items.length) items.push({ key: 'none', label: 'Add an overlay track first', disabled: true, onSelect: () => undefined });
  return <MoreMenu items={items} label="Move the clip to another track" text="Move to" className="tl-move-menu" align="left" />;
}

/** The edit tools as a radio group. */
function ToolPicker() {
  const tool = useVideo((state) => state.tool);
  const group = useId();
  return (
    <div className="tl-tools" role="radiogroup" aria-label="Edit tool">
      {EDIT_TOOLS.map(([id, name, key, what]) => (
        <label key={id} className="tl-tool" title={`${name} (${key}): ${what}`}>
          <input type="radio" className="vh" name={group} checked={tool === id} onChange={() => setTool(id)} aria-label={name} title={`${name} (${key}): ${what}`} />
          <EditToolIcon tool={id} />
        </label>
      ))}
    </div>
  );
}

/** Magnetic and Snap. */
function EditSwitches() {
  const magnetic = useVideo((state) => state.magnetic);
  const snapping = useVideo((state) => state.snapping);
  return (
    <>
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
    </>
  );
}

/** Play controls, editing buttons, the edit tools, Magnetic and Snap, and zoom, above the timeline. */
export function Transport() {
  const playing = useVideo((state) => state.playing);
  const time = useVideo((state) => state.t);
  const clips = useVideo((state) => state.clips);
  const selected = useVideo((state) => state.selected);
  const zoom = useVideo((state) => state.zoom);
  const tracks = useVideo((state) => state.tracks);
  const total = useVideo(videoLength);
  return (
    <div className="tl-transport" role="toolbar" aria-label="Playback and editing">
      <button type="button" className="pbtn" aria-label="Go to the start" onClick={() => goTo(0)}>
        <SkipBackIcon />
      </button>
      <button type="button" className="tl-play" aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} disabled={!clips.length} onClick={() => setPlaying(!playing)}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" className="pbtn" aria-label="Go to the end" onClick={() => goTo(total)}>
        <SkipForwardIcon />
      </button>
      <span className="tl-time">
        <b>{formatTime(time)}</b> / {formatTime(total)}
      </span>
      <span className="tl-sep" />
      <button type="button" className="sbtn" disabled={!clips.length} onClick={splitAtPlayhead} title="Split at the playhead (S)" aria-label="Split">
        <ScissorsIcon />
        <span className="mst-l">Split</span>
      </button>
      <button type="button" className="sbtn" disabled={!selected} onClick={() => editSelected(selected, (id) => tell(duplicateClipWhy(id)))} title="Duplicate the clip" aria-label="Duplicate">
        <CopyIcon />
        <span className="mst-l">Duplicate</span>
      </button>
      <MoveToTrackMenu selectedId={selected} tracks={tracks} clips={clips} />
      <button type="button" className="sbtn" disabled={!selected} onClick={() => editSelected(selected, removeClip)} title="Remove the clip (Delete)" aria-label="Delete">
        <TrashIcon />
        <span className="mst-l">Delete</span>
      </button>
      <span className="tl-sep" />
      <ToolPicker />
      <EditSwitches />
      <span className="tl-grow" />
      <button type="button" className="pbtn" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.25)}>
        <ZoomOutIcon />
      </button>
      <input className="tl-zoom" type="range" min={4} max={400} step={1} value={zoom} aria-label="Timeline zoom" onChange={(event) => setZoom(Number(event.target.value))} />
      <button type="button" className="pbtn" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.25)}>
        <ZoomInIcon />
      </button>
      <button type="button" className="sbtn" onClick={() => zoomToFit(total)}>
        Fit
      </button>
    </div>
  );
}
