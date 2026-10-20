import { adjacentKey, keyState } from '../../engine/keyframes';
import { FADE_MAX, SOUND_MIN, soundLength } from '../../engine/soundClips';
import { formatTime } from '../../engine/timeline';
import { lockedReason } from '../../engine/tracks';
import { removeSound, setSoundFades, setSoundIn, setSoundToEnd, setSoundVolumeAt, soundVolumeAt } from '../../state/videoSound';
import { setPlayhead, useVideo, videoLength, type VSound } from '../../state/videoStore';
import { Check } from '../common';
import { FoldSection } from '../panel';
import { KeyframeNav } from './KeyframeButton';
import { KindChip } from './KindChip';
import { soundKind } from './soundKinds';
import { tell } from './timelineActions';
import { KeyButton, Range } from './videoFields';

/*
 * The inspector for a selected sound clip (208 §9, AC-13): its volume (0–200 %, with 205's keyframe button), fades,
 * Play to the end of the video, and its source (where in the file it starts, Remove); disabled on a locked track.
 */

/** A sound clip. */
interface SoundProps {
  sound: VSound;
}

/**
 * A sound clip's volume, its keyframes and its fades.
 * @param props the sound clip
 */
function VolumeGroup({ sound }: Readonly<SoundProps>) {
  const time = useVideo((state) => state.t);
  const total = useVideo(videoLength);
  const sounds = useVideo((state) => state.sounds);
  const local = time - sound.start;
  const volume = soundVolumeAt(sound, local);
  const length = soundLength(sound, total, sounds);
  const fadeIn = sound.fadeIn ?? 0;
  const fadeOut = sound.fadeOut ?? 0;
  const previous = adjacentKey(sound, local, -1);
  const next = adjacentKey(sound, local, 1);
  return (
    <FoldSection
      id="sound.volume"
      title="Volume and fades"
      actions={sound.keys?.volume && <KeyframeNav what="sound" previous={previous === null ? null : sound.start + previous} next={next === null ? null : sound.start + next} onSeek={setPlayhead} />}
    >
      <div className="kf-row">
        <Range id="s-vol" label="Volume" value={volume} min={0} max={2} step={0.05} show={volume ? `${Math.round(volume * 100)}%` : 'silent'} onChange={(level) => tell(setSoundVolumeAt(sound.id, level))} />
        <KeyButton target={{ sound: sound.id }} props={['volume']} label="Volume" state={keyState(sound.keys?.volume, local)} time={time} />
      </div>
      <Range
        id="s-fade-in"
        label="Fade in"
        value={fadeIn}
        min={0}
        max={Math.max(0, Math.min(FADE_MAX, length - fadeOut))}
        step={0.05}
        show={`${fadeIn.toFixed(2)} s`}
        onChange={(seconds) => tell(setSoundFades(sound.id, { fadeIn: seconds }))}
      />
      <Range
        id="s-fade-out"
        label="Fade out"
        value={fadeOut}
        min={0}
        max={Math.max(0, Math.min(FADE_MAX, length - fadeIn))}
        step={0.05}
        show={`${fadeOut.toFixed(2)} s`}
        onChange={(seconds) => tell(setSoundFades(sound.id, { fadeOut: seconds }))}
      />
      <Check checked={sound.toEnd} onChange={(on) => tell(setSoundToEnd(sound.id, on))}>
        Play to the end of the video
      </Check>
    </FoldSection>
  );
}

/**
 * The inspector for a sound clip (see the file's comment).
 * @param props the sound clip
 */
export function SoundInspector({ sound }: Readonly<SoundProps>) {
  const track = useVideo((state) => state.tracks.find((entry) => entry.id === sound.track));
  const locked = useVideo((state) => lockedReason(state.tracks, sound.track));
  const total = useVideo(videoLength);
  const sounds = useVideo((state) => state.sounds);
  const length = soundLength(sound, total, sounds);
  const name = sound.name ?? 'Sound';
  return (
    <div className="lp">
      {locked && <p className="hint lp-locked">{locked}</p>}
      <fieldset className="lp-fs" disabled={!!locked}>
        {/* What the sound is and where it plays stay above the sections (503, as the clip's, D4). */}
        <div className="lp-head">
          <p className="text-label">
            {track?.name ?? 'Sound'} · {track ? <KindChip kind={soundKind(track)} /> : 'sound'}
          </p>
          <p className="hint ig-name" title={name}>
            {name} · {formatTime(sound.srcDur)}
          </p>
          <p className="hint">
            On the timeline from {formatTime(sound.start)} to {formatTime(sound.start + length)} ({length.toFixed(1)} s).
          </p>
        </div>
        <VolumeGroup sound={sound} />
        <FoldSection id="sound.source" title="Source">
          <Range
            id="s-in"
            label="Plays its file from"
            value={sound.in}
            min={0}
            max={Math.max(0, sound.srcDur - SOUND_MIN)}
            step={1 / 30}
            show={formatTime(sound.in)}
            onChange={(start) => tell(setSoundIn(sound.id, start))}
          />
          <button type="button" className="btn" onClick={() => tell(removeSound(sound.id))}>
            Remove sound
          </button>
        </FoldSection>
      </fieldset>
    </div>
  );
}
