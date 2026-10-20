import { Suspense, lazy, useState } from 'react';
import { LOUDNESS_PRESETS, LOUDNESS_RANGE, loudnessReadout } from '../../engine/loudnessTargets';
import { DUCK_DEFAULTS, DUCK_RANGES, countsAsVoice, lockedReason, soundRole, trackVolume, type SoundRole, type Track } from '../../engine/tracks';
import { addSoundFiles, setLoudness } from '../../state/videoSound';
import { useVideo } from '../../state/videoStore';
import { lowerMusicUnderVoice, setCountsAsVoice, setDucking, setLowerMusicUnderVoice, setTrackRole, setTrackVolume } from '../../state/videoTracks';
import { Check, Seg } from '../common';
import { MusicIcon } from '../icons';
import { FoldSection } from '../panel';
import { closeRecordVoice, openRecordVoice, useRecordVoiceOpen } from './recordVoiceOpen';
import { tell } from './timelineActions';
import { Range } from './videoFields';

/*
 * The video editor's Audio panel (208 §9, AC-13): add sound files, each sound track's role, volume and ducking, Lower
 * music under voice, and the export's loudness target with the measured loudness. Sound clips themselves are edited
 * on the timeline and in their inspector.
 */

// The recorder and its meter load only with the Record voice group (209 AC-12).
const RecordVoice = lazy(() => import('./RecordVoice').then((module) => ({ default: module.RecordVoice })));
const RecoverVoice = lazy(() => import('./RecordVoice').then((module) => ({ default: module.RecoverVoice })));

const ROLES: [SoundRole, string][] = [
  ['music', 'Music'],
  ['voice', 'Voice'],
  ['effects', 'Effects'],
];

/** The Loudness choice: Off, a preset, or a value of one's own. */
type LoudnessChoice = 'off' | 'youtube' | 'quiet' | 'custom';

/**
 * A percentage as shown.
 * @param share 0–2
 * @returns e.g. "150 %"
 */
const percent = (share: number): string => `${Math.round(share * 100)} %`;

/**
 * A level as shown, with a real minus sign.
 * @param value dB, dBFS or LUFS
 * @returns e.g. "−14"
 */
const level = (value: number): string => String(value).replace('-', '−');

/** Adds sound files at the playhead (several at once, Q4), with what was left out. */
function AddSound() {
  const [message, setMessage] = useState('');
  return (
    <div className="ig-group">
      <p className="hint">Use music you have the right to post: Instagram and YouTube may mute or claim recognised songs.</p>
      <label className="sbtn mst-file">
        <MusicIcon />
        Add sound
        <input
          type="file"
          multiple
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm,.weba"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length) void addSoundFiles(files).then((messages) => setMessage(messages.join(' ')));
          }}
        />
      </label>
      {message && (
        <p className="hint bad" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * One sound track's settings: role, volume, and ducking (Music, Effects) or Counts as voice (Voice).
 * @param props the track
 * @param props.track the sound track
 */
export function SoundTrackSettings({ track }: Readonly<{ track: Track }>) {
  const role = soundRole(track);
  const locked = lockedReason([track], track.id);
  const duck = track.duck;
  return (
    <fieldset className="lp-fs ap-track" disabled={!!locked}>
      <legend>{track.name}</legend>
      {locked && <p className="hint lp-locked">{locked}</p>}
      <Seg<SoundRole> label={`${track.name}: role`} value={role} options={ROLES} onChange={(next) => tell(setTrackRole(track.id, next))} />
      <Range id={`ap-vol-${track.id}`} label="Track volume" value={trackVolume(track)} min={0} max={2} step={0.05} show={percent(trackVolume(track))} onChange={(volume) => tell(setTrackVolume(track.id, volume))} />
      {role === 'voice' ? (
        <Check checked={countsAsVoice(track)} onChange={(on) => tell(setCountsAsVoice(track.id, on))}>
          Counts as voice (music is lowered while it speaks)
        </Check>
      ) : (
        <>
          <Check checked={!!duck} onChange={(on) => tell(setDucking(track.id, on ? { ...DUCK_DEFAULTS } : null))}>
            Lower under voice
          </Check>
          {duck && (
            <>
              <Range id={`ap-duck-${track.id}`} label="Lowered by" value={duck.amount} min={DUCK_RANGES.amount[0]} max={DUCK_RANGES.amount[1]} step={1} show={`${duck.amount} dB`} onChange={(amount) => tell(setDucking(track.id, { ...duck, amount }))} />
              <Range id={`ap-thr-${track.id}`} label="Voice louder than" value={duck.threshold} min={DUCK_RANGES.threshold[0]} max={DUCK_RANGES.threshold[1]} step={1} show={`${level(duck.threshold)} dBFS`} onChange={(threshold) => tell(setDucking(track.id, { ...duck, threshold }))} />
            </>
          )}
        </>
      )}
    </fieldset>
  );
}

/**
 * The Sound tracks section's summary: how many tracks of each role.
 * @param tracks the sound tracks
 * @returns e.g. "Music · 2 tracks", "Music, Voice · 2 tracks"; empty with none
 */
function tracksNote(tracks: readonly Track[]): string {
  if (!tracks.length) return '';
  const roles = ROLES.filter(([role]) => tracks.some((track) => soundRole(track) === role)).map(([, name]) => name);
  return `${roles.join(', ')} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}`;
}

/** The sound tracks' settings, and Lower music under voice for every Music track (Q9). */
function SoundTracks() {
  const tracks = useVideo((state) => state.tracks);
  const lowered = useVideo(lowerMusicUnderVoice);
  const sound = tracks.filter((track) => track.kind === 'audio');
  return (
    <FoldSection id="audio.tracks" title="Sound tracks" note={tracksNote(sound)}>
      <Check checked={lowered} onChange={setLowerMusicUnderVoice}>
        Lower music under voice
      </Check>
      <p className="hint">Music tracks go down while a Voice track or a clip’s own sound speaks, and back up after.</p>
      {sound.map((track) => (
        <SoundTrackSettings key={track.id} track={track} />
      ))}
    </FoldSection>
  );
}

/**
 * The Loudness choice a target shows as.
 * @param loudness the target, or Off
 * @param custom the user chose Custom
 * @returns the choice
 */
function choiceOf(loudness: 'off' | number, custom: boolean): LoudnessChoice {
  if (loudness === 'off') return 'off';
  if (custom) return 'custom';
  if (loudness === LOUDNESS_PRESETS.youtube) return 'youtube';
  if (loudness === LOUDNESS_PRESETS.quiet) return 'quiet';
  return 'custom';
}

/** The export's loudness target (AC-8) and the mix's measured loudness (AC-9). */
function Loudness() {
  const loudness = useVideo((state) => state.loudness);
  const measure = useVideo((state) => state.measure);
  const measuring = useVideo((state) => state.measuring);
  const [custom, setCustom] = useState(false);
  const choice = choiceOf(loudness, custom);
  const readout = loudnessReadout(measure, loudness, measuring);
  const choose = (next: LoudnessChoice) => {
    setCustom(next === 'custom');
    if (next === 'off') setLoudness('off');
    else if (next === 'custom') setLoudness(loudness === 'off' ? LOUDNESS_PRESETS.youtube : loudness);
    else setLoudness(LOUDNESS_PRESETS[next]);
  };
  return (
    <FoldSection id="audio.loudness" title="Loudness" note={loudness === 'off' ? 'Off' : `${level(loudness)} LUFS`}>
      <Seg<LoudnessChoice>
        label="Loudness"
        value={choice}
        options={[
          ['off', 'Off'],
          ['youtube', 'YouTube / Instagram'],
          ['quiet', 'Quiet'],
          ['custom', 'Custom'],
        ]}
        onChange={choose}
      />
      {choice === 'custom' && loudness !== 'off' && (
        <Range id="ap-lufs" label="Target" value={loudness} min={LOUDNESS_RANGE[0]} max={LOUDNESS_RANGE[1]} step={0.5} show={`${level(loudness)} LUFS`} onChange={setLoudness} />
      )}
      <p className="hint" aria-live="polite">
        {readout.text}
      </p>
      {readout.warning && (
        <p className="hint bad" role="alert">
          {readout.warning}
        </p>
      )}
      <p className="hint">The export turns the whole mix up or down to the target and keeps peaks under −1 dBTP. YouTube and Instagram turn louder videos down to −14 LUFS.</p>
    </FoldSection>
  );
}

/**
 * Record voice (209 §8): the controls open the microphone only when asked for (AC-7); takes to recover (AC-9). The
 * section opens itself when the recorder is asked for (Shift + R, a Voice track's record button, Recover…; 503 AC-2).
 */
function RecordVoiceGroup() {
  const { open, track } = useRecordVoiceOpen();
  return (
    <FoldSection id="audio.record" title="Record voice" openWhen={open} onClosed={closeRecordVoice}>
      {open ? (
        <Suspense fallback={<p className="hint">Opening the microphone…</p>}>
          <RecordVoice track={track} />
        </Suspense>
      ) : (
        <>
          <p className="hint">Talk over the video while it plays. The microphone is on only while the recording controls are open, and what you record stays on this device.</p>
          <button type="button" className="sbtn" onClick={() => openRecordVoice()}>
            Record voice…
          </button>
        </>
      )}
      <Suspense fallback={null}>
        <RecoverVoice />
      </Suspense>
    </FoldSection>
  );
}

/** The Audio panel. */
export function AudioPanel() {
  return (
    <>
      <AddSound />
      <RecordVoiceGroup />
      <SoundTracks />
      <Loudness />
    </>
  );
}
