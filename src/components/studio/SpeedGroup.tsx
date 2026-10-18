import { SPEED_LIMITS, SPEED_PRESETS, soundMuted, type RampPreset } from '../../engine/speed';
import { clipLength } from '../../engine/timeline';
import { resetSpeed, setClipRamp, setClipReverse, setClipSpeed } from '../../state/videoSpeed';
import type { VClip } from '../../state/videoStore';
import { Check, Seg } from '../common';
import { RampEditor } from './RampEditor';
import { sliderToSpeed, speedText, speedToSlider } from './speedUi';
import { tellSpeed } from './timelineActions';
import { NumberField, Range } from './videoFields';

/*
 * The inspector's Speed group for a video clip (207 §8, AC-11): Constant or Ramp; a constant speed as a field and a
 * log-scale slider with presets; Reverse; a ramp's presets and its curve editor; the clip's new length, why its sound
 * is muted, and Reset speed. Each change is one undo step (the slider's drag one step); refusals and notes are said.
 */

/** The ramp presets' names, in the order the inspector shows them (Q6). */
const RAMP_NAMES: [RampPreset, string][] = [
  ['montage', 'Montage'],
  ['hero', 'Hero'],
  ['bullet', 'Bullet'],
  ['jump', 'Jump cut'],
  ['flash-in', 'Flash in'],
  ['flash-out', 'Flash out'],
];

/** A video clip. */
interface SpeedGroupProps {
  clip: VClip;
}

/**
 * A constant speed: the field, the slider and the presets.
 * @param props the clip
 */
function ConstantSpeed({ clip }: Readonly<SpeedGroupProps>) {
  const speed = clip.speed ?? 1;
  return (
    <>
      <div className="kf-row">
        <Range
          id="v-speed"
          label="Speed"
          value={speedToSlider(speed)}
          min={0}
          max={1}
          step={0.005}
          show={speedText(speed)}
          onChange={(position) => tellSpeed(setClipSpeed(clip.id, sliderToSpeed(position)))}
        />
        <NumberField label="Speed" unit="×" min={SPEED_LIMITS.min} max={SPEED_LIMITS.max} step={SPEED_LIMITS.step} value={speed} onChange={(typed) => tellSpeed(setClipSpeed(clip.id, typed))} />
      </div>
      <div className="chips" role="group" aria-label="Speed presets">
        {SPEED_PRESETS.map((preset) => (
          <button key={preset} type="button" className="chip" aria-pressed={speed === preset} onClick={() => tellSpeed(setClipSpeed(clip.id, preset, ''))}>
            {speedText(preset)}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * A ramp: its presets and its curve editor.
 * @param props the clip
 */
function RampSpeed({ clip }: Readonly<SpeedGroupProps>) {
  return (
    <>
      <div className="chips" role="group" aria-label="Ramp presets">
        {RAMP_NAMES.map(([preset, name]) => (
          <button key={preset} type="button" className="chip" onClick={() => tellSpeed(setClipRamp(clip.id, preset))}>
            {name}
          </button>
        ))}
      </div>
      {clip.ramp && <RampEditor clip={clip} points={clip.ramp} />}
    </>
  );
}

/**
 * The Speed group (AC-11).
 * @param props the video clip (not a freeze frame: it has no speed)
 */
export function SpeedGroup({ clip }: Readonly<SpeedGroupProps>) {
  const mode = clip.ramp ? 'ramp' : 'constant';
  const muted = soundMuted(clip);
  const atOne = !clip.ramp && !clip.reverse && (clip.speed ?? 1) === 1;
  return (
    <div className="ig-group v-speed">
      <h3>Speed</h3>
      <Seg<'constant' | 'ramp'>
        label="Speed kind"
        value={mode}
        options={[
          ['constant', 'Constant'],
          ['ramp', 'Ramp'],
        ]}
        onChange={(next) => {
          if (next === mode) return;
          tellSpeed(next === 'ramp' ? setClipRamp(clip.id, 'montage') : setClipSpeed(clip.id, 1, ''));
        }}
      />
      {mode === 'ramp' ? <RampSpeed clip={clip} /> : <ConstantSpeed clip={clip} />}
      <Check checked={!!clip.reverse} onChange={(reverse) => tellSpeed(setClipReverse(clip.id, reverse))}>
        Reverse
      </Check>
      <p className="hint" role="status">
        Plays for {clipLength(clip).toFixed(1)} s{muted ? `. ${muted}` : ''}
      </p>
      <button type="button" className="sbtn" disabled={atOne} onClick={() => tellSpeed(resetSpeed(clip.id))}>
        Reset speed
      </button>
    </div>
  );
}

