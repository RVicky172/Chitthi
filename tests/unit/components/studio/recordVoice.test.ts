import { describe, expect, it } from 'vitest';
import { addAudioTrack, defaultTracks, setAudioTrack, type Track } from '@/engine/tracks';
import { meterFill, meterText, offsetText, recoveryLabel, targetText } from '@/components/studio/recordVoiceText';

/* 209 AC-1, AC-4, AC-9: what the Record voice controls show. */

/**
 * The default tracks and a Voice track named "Narration".
 * @returns the tracks
 */
function withVoice(): Track[] {
  const added = addAudioTrack(defaultTracks());
  if ('error' in added) throw new Error(added.error);
  const voiced = setAudioTrack(added.tracks.map((track) => (track.id === added.id ? { ...track, name: 'Narration' } : track)), added.id, { role: 'voice' });
  if ('error' in voiced) throw new Error(voiced.error);
  return voiced.tracks;
}

describe('the meter (AC-4)', () => {
  it('fills over −60…0 dBFS, empty for silence', () => {
    expect(meterFill(0)).toBe(1);
    expect(meterFill(-30)).toBe(0.5);
    expect(meterFill(-60)).toBe(0);
    expect(meterFill(-90)).toBe(0);
    expect(meterFill(-Infinity)).toBe(0);
    expect(meterFill(3)).toBe(1);
  });

  it('reads out the level with a real minus sign', () => {
    expect(meterText(-12.4)).toBe('−12 dBFS');
    expect(meterText(-0.2)).toBe('0 dBFS');
    expect(meterText(-Infinity)).toBe('Silent');
    expect(meterText(-75)).toBe('Silent');
  });
});

describe('the Recording offset (AC-3)', () => {
  it('shows milliseconds with a sign', () => {
    expect(offsetText(0)).toBe('0 ms');
    expect(offsetText(0.04)).toBe('+40 ms');
    expect(offsetText(-0.12)).toBe('−120 ms');
  });
});

describe('the recovery offer (AC-9)', () => {
  const at = new Date(2026, 9, 19, 14, 2).getTime();

  it('names the take, its length and when it was recorded', () => {
    expect(recoveryLabel({ id: 't', name: 'Voice 3', length: 41.2, startedAt: at, done: true })).toBe('Voice 3, 41 s, recorded 19 Oct 14:02');
    expect(recoveryLabel({ id: 't', name: 'Voice 3', length: 125, startedAt: at, done: true })).toBe('Voice 3, 2:05, recorded 19 Oct 14:02');
  });

  it('says when it stopped early or can’t be read', () => {
    expect(recoveryLabel({ id: 't', name: 'Voice 3', length: 41.2, startedAt: at, done: false })).toBe('Voice 3, 41 s, recorded 19 Oct 14:02, stopped early');
    expect(recoveryLabel({ id: 't', name: 'Voice 3', length: null, startedAt: at, done: false })).toBe('Voice 3, recorded 19 Oct 14:02, can’t be read');
  });
});

describe('where the take goes (AC-1)', () => {
  it('names the Voice track it records onto, or the new one', () => {
    expect(targetText(withVoice(), null, null)).toBe('Records onto Narration.');
    expect(targetText(defaultTracks(), null, null)).toBe('Records onto a new Voice track.');
  });

  it('says why not at the sound track limit', () => {
    let tracks = defaultTracks();
    for (let index = 0; index < 7; index++) {
      const added = addAudioTrack(tracks);
      if ('error' in added) throw new Error(added.error);
      tracks = added.tracks;
    }
    expect(targetText(tracks, null, null)).toMatch(/up to 8 sound tracks/);
  });
});
