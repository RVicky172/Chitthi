import { useEffect, useState } from 'react';
import { recordKeyAction } from './recordKeys';
import { RECORD_OFFSET_MAX } from '../../engine/voiceTake';
import { offsetFor } from '../../lib/microphone';
import { saveFile } from '../../lib/download';
import { logError } from '../../lib/errors';
import { useVideo } from '../../state/videoStore';
import {
  cancelCountIn,
  checkRecovery,
  closeControls,
  discardTake,
  openControls,
  record,
  recoverTake,
  setVoicePrefs,
  stop,
  takeFile,
  useRecorder,
  type RecorderState,
} from '../../state/voiceRecorder';
import { Check, Seg } from '../common';
import { closeRecordVoice } from './recordVoiceOpen';
import { meterFill, meterText, offsetText, recoveryLabel, targetText } from './recordVoiceText';
import { tell } from './timelineActions';
import { Range } from './videoFields';

/*
 * The Record voice controls (209 §8, AC-1, AC-4, AC-9): loaded with `import()` when they are first opened, so the
 * recorder and the meter stay out of every other chunk. The microphone is open while they are mounted (AC-7).
 */

/** A count-in choice (Q4), as the segmented control names it. */
type CountIn = '0' | '3' | '5';

/** The count-in choices. */
const COUNT_INS: [CountIn, string][] = [
  ['0', 'Off'],
  ['3', '3 s'],
  ['5', '5 s'],
];
/** Each choice's seconds. */
const COUNT_IN_SECONDS: Record<CountIn, 0 | 3 | 5> = { '0': 0, '3': 3, '5': 5 };
/** Each length's choice. */
const COUNT_IN_CHOICE: Record<0 | 3 | 5, CountIn> = { 0: '0', 3: '3', 5: '5' };

/**
 * The level meter (AC-4): a bar over −60…0 dBFS with its value as text, and Too loud.
 * @param props the reading
 * @param props.level the peak, dBFS
 * @param props.loud whether Too loud shows
 */
function Meter({ level, loud }: Readonly<{ level: number; loud: boolean }>) {
  return (
    <div className="rv-meter-row">
      <div className="rv-meter" role="meter" aria-label="Microphone level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, Math.min(0, Number.isFinite(level) ? Math.round(level) : -60))} aria-valuetext={meterText(level)}>
        <span className={loud ? 'rv-meter-bar loud' : 'rv-meter-bar'} style={{ width: `${meterFill(level) * 100}%` }} />
      </div>
      <span className="rv-meter-text">{meterText(level)}</span>
      {loud && <span className="rv-loud">Too loud</span>}
    </div>
  );
}

/**
 * Record / Stop for the phase, with the count-in and the time recorded.
 * @param props the recorder
 * @param props.recorder the recorder's state
 */
function RecordButton({ recorder }: Readonly<{ recorder: RecorderState }>) {
  const { phase } = recorder;
  if (phase === 'countIn')
    return (
      <button type="button" className="sbtn" onClick={() => void stop()}>
        Cancel ({recorder.countdown})
      </button>
    );
  if (phase === 'recording')
    return (
      <button type="button" className="sbtn rv-stop" onClick={() => void stop()}>
        Stop ({recorder.elapsed.toFixed(1)} s)
      </button>
    );
  return (
    <button type="button" className="sbtn rv-record" disabled={phase !== 'ready'} onClick={record}>
      {phase === 'finishing' ? 'Saving the take…' : 'Record'}
    </button>
  );
}

/**
 * The microphone and recording choices (AC-3, AC-4, AC-5, Q4, Q6).
 * @param props the recorder
 * @param props.recorder the recorder's state
 */
function Choices({ recorder }: Readonly<{ recorder: RecorderState }>) {
  const { prefs, device } = recorder;
  const busy = recorder.phase !== 'ready';
  const offset = offsetFor(prefs, device);
  return (
    <fieldset className="lp-fs" disabled={busy}>
      <div className="ig-slider">
        <label htmlFor="rv-mic">Microphone</label>
        <select id="rv-mic" value={device ?? ''} onChange={(event) => void setVoicePrefs({ device: event.target.value })}>
          {recorder.microphones.map((mic) => (
            <option key={mic.id} value={mic.id}>
              {mic.label}
            </option>
          ))}
        </select>
      </div>
      <Check checked={prefs.cleanUp} onChange={(cleanUp) => void setVoicePrefs({ cleanUp })}>
        Voice clean-up (echo, noise, level)
      </Check>
      <Check checked={prefs.hear} onChange={(hear) => void setVoicePrefs({ hear })}>
        Hear the video while recording (use headphones)
      </Check>
      <Seg<CountIn> label="Count-in" value={COUNT_IN_CHOICE[prefs.countIn]} options={COUNT_INS} onChange={(next) => void setVoicePrefs({ countIn: COUNT_IN_SECONDS[next] })} />
      {device !== null && (
        <Range
          id="rv-offset"
          label="Recording offset"
          value={offset}
          min={-RECORD_OFFSET_MAX}
          max={RECORD_OFFSET_MAX}
          step={0.005}
          show={offsetText(offset)}
          onChange={(value) => void setVoicePrefs({ offsets: { ...prefs.offsets, [device]: value } })}
        />
      )}
    </fieldset>
  );
}

/**
 * The Record voice controls: open the microphone while mounted, close it when unmounted (AC-7).
 * @param props the track
 * @param props.track the track whose record button opened them, or null
 */
export function RecordVoice({ track }: Readonly<{ track: string | null }>) {
  const recorder = useRecorder((state) => state);
  const tracks = useVideo((state) => state.tracks);
  const selected = useVideo((state) => state.sounds.find((sound) => sound.id === state.soundSel)?.track ?? null);
  useEffect(() => closeControls, []);
  useEffect(() => {
    void openControls(track ?? undefined);
  }, [track]);
  const counting = recorder.phase === 'countIn';
  // Esc cancels the count-in (AC-10).
  useEffect(() => {
    if (!counting) return;
    const onKey = (event: KeyboardEvent) => {
      if (recordKeyAction(event, true) !== 'cancel') return;
      event.preventDefault();
      cancelCountIn();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [counting]);
  const open = recorder.phase !== 'closed';
  return (
    <div className="rv">
      {counting && (
        <p className="rv-count">
          Recording in {recorder.countdown}
        </p>
      )}
      {open && <Meter level={recorder.level} loud={recorder.loud} />}
      {open && <Choices recorder={recorder} />}
      {open && <p className="hint">{targetText(tracks, recorder.track, selected)}</p>}
      {recorder.message && (
        <p className="hint bad" role="alert">
          {recorder.message}
        </p>
      )}
      <div className="rv-actions">
        {open ? (
          <RecordButton recorder={recorder} />
        ) : (
          <button type="button" className="sbtn" onClick={() => void openControls(track ?? undefined)}>
            Try again
          </button>
        )}
        <button type="button" className="sbtn" onClick={closeRecordVoice}>
          Close
        </button>
      </div>
      <p className="hint">Shift + R records and stops; Esc cancels the count-in. The microphone turns off when you close these controls.</p>
    </div>
  );
}

/**
 * Saves a recovered take as a file.
 * @param id the take
 */
function saveTake(id: string): void {
  takeFile(id)
    .then((file) => saveFile(file.name, file))
    .catch((error: unknown) => {
      logError('handled', error);
      tell('That recording couldn’t be saved.');
    });
}

/** Takes a crash left on this device for the open project (AC-9): add to the timeline, save as a file, or discard. */
export function RecoverVoice() {
  const recovery = useRecorder((state) => state.recovery);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void checkRecovery();
  }, []);
  if (recovery.length === 0 && !message) return null;
  return (
    <div className="rv-recover" role="region" aria-label="Recover voice recordings">
      {recovery.map((entry) => (
        <div key={entry.id} className="rv-recover-item">
          <p>Recover voice recording ({recoveryLabel(entry)})</p>
          <div className="rv-actions">
            {entry.length !== null && (
              <button type="button" className="sbtn" onClick={() => void recoverTake(entry.id).then(setMessage)}>
                Add to the timeline
              </button>
            )}
            <button type="button" className="sbtn" onClick={() => saveTake(entry.id)}>
              Save as file
            </button>
            <button type="button" className="sbtn" onClick={() => void discardTake(entry.id)}>
              Discard
            </button>
          </div>
        </div>
      ))}
      {message && (
        <p className="hint bad" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
