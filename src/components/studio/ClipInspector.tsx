import { adjacentKey, keyState, transformAt, volumeAt } from '../../engine/keyframes';
import { FREEZE_LIMITS, edgeSpeed } from '../../engine/speed';
import { clipLength, formatTime, PRESETS, type ClipTransform } from '../../engine/timeline';
import { lockedReason } from '../../engine/tracks';
import { MOTIONS } from '../../engine/video';
import { toast } from '../../lib/toast';
import { applyPreset, setClipTransformAt, setClipVolume } from '../../state/videoBox';
import { adjustClip, editClip, updateClipWhy } from '../../state/videoClips';
import { limits, limitText, setPlayhead, useVideo, videoLength, type VClip } from '../../state/videoStore';
import { clipPlace } from '../../state/videoTracks';
import { Check, Seg } from '../common';
import { FoldSection } from '../panel';
import { FindFileButton } from './ProjectStatus';
import { LookPicker } from '../ig/LookPicker';
import { KeyframeNav } from './KeyframeButton';
import { useFallbackNote } from './previewFrame';
import { tell } from './timelineActions';
import { clipLabel } from './timelineRows';
import { SpeedGroup } from './SpeedGroup';
import { KeyButton, NumberField, Range } from './videoFields';

/* The video editor's inspector for a clip (timing, sound, box, framing, colour) and, with nothing selected, the project. */

/** One of the inspector's position-and-size fields: a label, a number in the field's units, and its range. */
interface PositionField {
  field: keyof ClipTransform;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** The stored value times this is the number shown. */
  scale: number;
}

/** The inspector's position-and-size fields. */
const POSITION_FIELDS: PositionField[] = [
  { field: 'x', label: 'X', unit: '%', min: -50, max: 150, scale: 100 },
  { field: 'y', label: 'Y', unit: '%', min: -50, max: 150, scale: 100 },
  { field: 'w', label: 'Size', unit: '%', min: 5, max: 400, scale: 100 },
  { field: 'rot', label: 'Rotation', unit: '°', min: -180, max: 180, scale: 1 },
  { field: 'opacity', label: 'Opacity', unit: '%', min: 0, max: 100, scale: 100 },
  { field: 'radius', label: 'Corners', unit: '%', min: 0, max: 50, scale: 100 },
];

/** A clip and the playhead. */
interface ClipAtProps {
  clip: VClip;
  /** The playhead. */
  time: number;
}

/**
 * A clip's box in the frame (203 §11, AC-5): Full frame and the four corner presets, and number fields for its centre
 * (X, Y), size, rotation, opacity and corner radius. Typing in a field is one undo step per field until another field
 * changes; the stage shows the same box, with handles, for dragging.
 * @param props the clip and the playhead
 */
function PositionGroup({ clip, time }: Readonly<ClipAtProps>) {
  const local = time - clip.start;
  // The box as shown at the playhead (205): animated values from their keyframes, written back through the router.
  const transform = transformAt(clip, local);
  const previous = adjacentKey(clip, local, -1);
  const next = adjacentKey(clip, local, 1);
  return (
    <FoldSection
      id="clip.position"
      title="Position and size"
      actions={clip.keys && <KeyframeNav what="clip" previous={previous === null ? null : clip.start + previous} next={next === null ? null : clip.start + next} onSeek={setPlayhead} />}
    >
      <div className="chips" role="group" aria-label="Place the clip">
        {PRESETS.map(([preset, label]) => (
          <button key={preset} type="button" className="chip" onClick={() => tell(applyPreset(clip.id, preset))}>
            {label}
          </button>
        ))}
      </div>
      <div className="v-position">
        {POSITION_FIELDS.map(({ field, label, unit, min, max, scale }) => (
          <div key={field} className="kf-field">
            <NumberField
              label={label}
              unit={unit}
              min={min}
              max={max}
              value={Math.round(transform[field] * scale * 10) / 10}
              onChange={(value) => tell(setClipTransformAt(clip.id, { [field]: value / scale }, `tf-field:${clip.id}:${field}`))}
            />
            <KeyButton target={{ clip: clip.id }} props={[field]} label={label} state={keyState(clip.keys?.[field], local)} time={time} />
          </div>
        ))}
      </div>
    </FoldSection>
  );
}

/**
 * Changes a clip, showing why when it can't be (the length or videos-at-once limit, a locked track).
 * @param id the clip
 * @param patch the fields to change
 * @param key the undo grouping key
 */
function updateClip(id: string, patch: Partial<VClip>, key?: string): void {
  const refusal = updateClipWhy(id, patch, key);
  if (refusal) toast(refusal);
}

/** A clip's timing and sound. */
interface TimingGroupProps extends ClipAtProps {
  /** Seconds the video can still grow by. */
  room: number;
}

/**
 * A photo's time on screen and movement, or a video's in and out points and its sound.
 * @param props the clip, the playhead and the room left
 */
function TimingGroup({ clip, time, room }: Readonly<TimingGroupProps>) {
  const local = time - clip.start;
  const volume = volumeAt(clip, local);
  // A freeze frame (207) lasts like a photo, 0.1–60 s, and has no sound.
  if (clip.freeze !== undefined)
    return (
      <Range
        id="v-dur"
        label="On screen for"
        value={clip.dur}
        min={FREEZE_LIMITS.min}
        max={Math.max(FREEZE_LIMITS.min, Math.min(FREEZE_LIMITS.max, clip.dur + room))}
        show={`${clip.dur.toFixed(1)} s`}
        onChange={(dur) => updateClip(clip.id, { dur })}
      />
    );
  if (clip.kind === 'photo')
    return (
      <>
        <Range
          id="v-dur"
          label="On screen for"
          value={clip.dur}
          min={0.5}
          max={Math.max(0.5, Math.min(30, room))}
          show={`${clip.dur.toFixed(1)} s`}
          onChange={(dur) => updateClip(clip.id, { dur })}
        />
        <span className="lp-label">Movement</span>
        <div className="chips" role="radiogroup" aria-label="Movement">
          {MOTIONS.map(([motion, label]) => (
            <button key={motion} type="button" role="radio" className="chip" aria-checked={clip.motion === motion} onClick={() => updateClip(clip.id, { motion }, '')}>
              {label}
            </button>
          ))}
        </div>
      </>
    );
  return (
    <>
      <Range
        id="v-in"
        label="Starts at"
        value={clip.in}
        min={0}
        max={Math.max(0, clip.out - 0.3)}
        step={1 / 30}
        show={formatTime(clip.in)}
        onChange={(start) => updateClip(clip.id, { in: Math.min(start, clip.out - 0.3) }, `trim-in:${clip.id}`)}
      />
      <Range
        id="v-out"
        label="Ends at"
        value={clip.out}
        min={clip.in + 0.3}
        max={Math.min(clip.srcDur, clip.out + room * edgeSpeed(clip, 'end'))}
        step={1 / 30}
        show={formatTime(clip.out)}
        onChange={(end) => updateClip(clip.id, { out: Math.max(end, clip.in + 0.3) }, `trim-out:${clip.id}`)}
      />
      <div className="kf-row">
        <Range
          id="v-vol"
          label="Clip sound"
          value={volume}
          min={0}
          max={1}
          step={0.05}
          show={volume ? `${Math.round(volume * 100)}%` : 'muted'}
          onChange={(level) => tell(setClipVolume(clip.id, level))}
        />
        <KeyButton target={{ clip: clip.id }} props={['volume']} label="Clip sound" state={keyState(clip.keys?.volume, local)} time={time} />
      </div>
    </>
  );
}

/**
 * What a clip is, for the inspector's heading.
 * @param clip the clip
 * @returns "video", "photo" or "freeze frame"
 */
function kindName(clip: VClip): string {
  if (clip.kind === 'photo') return 'photo';
  return clip.freeze === undefined ? 'video' : 'freeze frame';
}

/** A clip. */
interface ClipProps {
  clip: VClip;
}

/**
 * How the picture fills the frame, and its colour.
 * @param props the clip
 */
function PictureGroups({ clip }: Readonly<ClipProps>) {
  const { edit } = clip;
  const { adjust } = edit;
  return (
    <>
      <FoldSection id="clip.frame" title="Frame">
        <Seg<'fill' | 'fit'>
          label="How the picture fills the frame"
          value={edit.fit}
          options={[
            ['fill', 'Fill the frame'],
            ['fit', 'Whole picture'],
          ]}
          onChange={(fit) => editClip(clip.id, { fit, px: 0, py: 0 })}
        />
        {edit.fit === 'fit' && (
          <Check checked={edit.bg === 'blur'} onChange={(isBlurred) => editClip(clip.id, { bg: isBlurred ? 'blur' : '#000000' })}>
            Blurred background
          </Check>
        )}
        <Range id="v-zoom" label="Zoom" value={edit.zoom} min={1} max={3} step={0.01} show={edit.zoom.toFixed(2)} onChange={(zoom) => editClip(clip.id, { zoom })} />
        <Range id="v-px" label="Left–right" value={edit.px} min={-1} max={1} step={0.01} show={edit.px.toFixed(2)} onChange={(px) => editClip(clip.id, { px })} />
        <Range id="v-py" label="Up–down" value={edit.py} min={-1} max={1} step={0.01} show={edit.py.toFixed(2)} onChange={(py) => editClip(clip.id, { py })} />
      </FoldSection>
      <FoldSection id="clip.colour" title="Colour" note={adjust.brightness || adjust.contrast || adjust.saturation || adjust.warmth ? 'Changed' : undefined}>
        <LookPicker idPrefix="v" adjust={adjust} onChange={(patch) => adjustClip(clip.id, patch)} />
        <Range id="v-br" label="Brightness" value={adjust.brightness} min={-100} max={100} step={1} show={String(adjust.brightness)} onChange={(brightness) => adjustClip(clip.id, { brightness })} />
        <Range id="v-ct" label="Contrast" value={adjust.contrast} min={-100} max={100} step={1} show={String(adjust.contrast)} onChange={(contrast) => adjustClip(clip.id, { contrast })} />
        <Range id="v-sa" label="Saturation" value={adjust.saturation} min={-100} max={100} step={1} show={String(adjust.saturation)} onChange={(saturation) => adjustClip(clip.id, { saturation })} />
        <Range id="v-wa" label="Warmth" value={adjust.warmth} min={-100} max={100} step={1} show={String(adjust.warmth)} onChange={(warmth) => adjustClip(clip.id, { warmth })} />
      </FoldSection>
    </>
  );
}

/**
 * The inspector for a clip: its name and place, timing and sound, fade, box, framing and colour; disabled on a locked
 * track.
 * @param props the clip
 */
export function ClipInspector({ clip }: Readonly<ClipProps>) {
  // "Clip 2", or "Overlay 1, clip 2": counted on the clip's own track (203). The selector returns the label, a string:
  // a store selector must return the same value for the same state, or React re-renders forever (an object from
  // clipPlace is new on every read).
  const placeLabel = useVideo((state) => {
    const place = clipPlace(clip.id, state);
    return place ? clipLabel(place.track, place.n) : 'Clip';
  });
  const room = limits().seconds - (useVideo(videoLength) - clipLength(clip));
  const locked = useVideo((state) => lockedReason(state.tracks, clip.track));
  const cantExport = useFallbackNote(clip.file);
  const time = useVideo((state) => state.t);
  return (
    <div className="lp">
      {locked && <p className="hint lp-locked">{locked}</p>}
      <fieldset className="lp-fs" disabled={!!locked}>
        {/* 503 D4: what the clip is, and any warning, stay above the sections. */}
        <div className="lp-head">
          <p className="text-label">
            {placeLabel} · {kindName(clip)}
          </p>
          <p className="hint ig-name" title={clip.name}>
            {clip.name} · {clip.w}×{clip.h}
            {clip.kind === 'video' ? ` · ${formatTime(clip.srcDur)}` : ''}
          </p>
          {!(clip.file instanceof Blob) && clip.file.missing && (
            <p className="hint bad" role="status">
              This file is missing: it may have moved or changed. <FindFileButton file={clip.file} />
            </p>
          )}
          {cantExport && (
            <p className="hint bad" role="status">
              {cantExport}
            </p>
          )}
        </div>
        <FoldSection id="clip.timing" title="Timing">
          <TimingGroup clip={clip} time={time} room={room} />
          <Check checked={clip.fade} onChange={(fade) => updateClip(clip.id, { fade }, '')}>
            Fade in from black
          </Check>
        </FoldSection>
        {clip.kind === 'video' && clip.freeze === undefined && <SpeedGroup clip={clip} />}
        <PositionGroup clip={clip} time={time} />
        <PictureGroups clip={clip} />
      </fieldset>
    </div>
  );
}

/** With nothing selected: the project's clip count and length against its limit. */
export function ProjectInspector() {
  const clips = useVideo((state) => state.clips);
  const kind = useVideo((state) => state.kind);
  const total = useVideo(videoLength);
  const limit = limits(kind);
  return (
    <div className="lp">
      <div className="ig-group">
        <h3>Project</h3>
        <p className="hint">
          {clips.length} clip{clips.length === 1 ? '' : 's'} · {formatTime(total)} of up to {limitText(limit.seconds)}.
        </p>
        <p className="hint">Choose a clip on the timeline to edit it, or a layer to change it.</p>
      </div>
    </div>
  );
}
