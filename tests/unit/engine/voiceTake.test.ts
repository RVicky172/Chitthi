import { describe, expect, it } from 'vitest';
import { addAudioTrack, defaultTracks, setAudioTrack, soundRole, type Track } from '@/engine/tracks';
import {
  RECORD_OFFSET_MAX,
  TOO_LOUD_EVERY_MS,
  announceCountIn,
  announceResult,
  announceStart,
  canRecord,
  recordTarget,
  takeName,
  takeStart,
  tooLoudDue,
  type TakeTiming,
} from '@/engine/voiceTake';

/* 209 AC-1 (where a take goes, its name, when recording is refused) and AC-3 (where a take starts on the timeline). */

const ok = <T>(result: T | { error: string }): T => {
  if (result && typeof result === 'object' && 'error' in result) throw new Error(result.error);
  return result;
};
const err = (result: unknown): string | null =>
  result && typeof result === 'object' && 'error' in result ? (result as { error: string }).error : null;

/**
 * The default tracks plus audio tracks with the given roles (A2, A3 …).
 * @param roles each added track's role
 * @returns the tracks
 */
function withAudio(...roles: ('music' | 'voice' | 'effects')[]): Track[] {
  let tracks = defaultTracks();
  for (const role of roles) {
    const added = ok(addAudioTrack(tracks));
    tracks = ok(setAudioTrack(added.tracks, added.id, { role })).tracks;
  }
  return tracks;
}

describe('recordTarget', () => {
  it('uses the chosen Voice track first', () => {
    const tracks = withAudio('voice', 'voice');
    const target = ok(recordTarget(tracks, 'A3', 'A2'));
    expect(target.track).toBe('A3');
    expect(target.tracks).toBe(tracks);
  });

  it('then the selected Voice track, then the first Voice track', () => {
    const tracks = withAudio('effects', 'voice', 'voice');
    expect(ok(recordTarget(tracks, null, 'A4')).track).toBe('A4');
    expect(ok(recordTarget(tracks, null, null)).track).toBe('A3');
    expect(ok(recordTarget(tracks, null, 'A2')).track).toBe('A3');
  });

  it('ignores a chosen track that isn’t a Voice track or isn’t in the project', () => {
    const tracks = withAudio('effects', 'voice');
    expect(ok(recordTarget(tracks, 'A2', null)).track).toBe('A3');
    expect(ok(recordTarget(tracks, 'V1', null)).track).toBe('A3');
    expect(ok(recordTarget(tracks, 'A9', null)).track).toBe('A3');
  });

  it('adds a Voice track named Voice when there is none', () => {
    const tracks = withAudio('effects');
    const target = ok(recordTarget(tracks, null, null));
    const added = target.tracks.find((track) => track.id === target.track);
    expect(target.tracks).toHaveLength(tracks.length + 1);
    expect(added).toMatchObject({ kind: 'audio', name: 'Voice' });
    expect(added && soundRole(added)).toBe('voice');
    expect(tracks).toHaveLength(3);
  });

  it('refuses with the reason when there are already 8 audio tracks and no Voice track', () => {
    const tracks = withAudio('effects', 'effects', 'effects', 'effects', 'effects', 'effects', 'music');
    expect(tracks.filter((track) => track.kind === 'audio')).toHaveLength(8);
    expect(err(recordTarget(tracks, null, null))).toMatch(/up to 8 sound tracks/);
  });
});

describe('takeName', () => {
  it('is Voice 1 for the first take', () => {
    expect(takeName([])).toBe('Voice 1');
    expect(takeName([{ name: 'song.mp3' }, {}])).toBe('Voice 1');
  });

  it('is one more than the highest Voice N in the project', () => {
    expect(takeName([{ name: 'Voice 1' }, { name: 'Voice 4' }, { name: 'Voice 2' }])).toBe('Voice 5');
    expect(takeName([{ name: 'Voice 3.wav' }, { name: 'My Voice 9' }, { name: 'Voice 2' }])).toBe('Voice 3');
  });
});

describe('canRecord', () => {
  const tracks = withAudio('voice');

  it('allows recording onto an unlocked track with the playhead before the end', () => {
    expect(canRecord({ tracks, length: 30, playhead: 0 }, 'A2')).toBeNull();
    expect(canRecord({ tracks, length: 30, playhead: 29.5 }, 'A2')).toBeNull();
  });

  it('refuses an empty video', () => {
    expect(canRecord({ tracks, length: 0, playhead: 0 }, 'A2')).toMatch(/video/i);
  });

  it('refuses with the playhead at the end', () => {
    expect(canRecord({ tracks, length: 30, playhead: 30 }, 'A2')).toMatch(/end/i);
  });

  it('refuses a locked track', () => {
    const locked = tracks.map((track) => (track.id === 'A2' ? { ...track, locked: true } : track));
    expect(canRecord({ tracks: locked, length: 30, playhead: 0 }, 'A2')).toMatch(/locked/);
  });
});

describe('takeStart', () => {
  const base: TakeTiming = { playStart: 12, playWall: 5_000, captureWall: 5_000, inputLatency: 0, offset: 0 };

  it('is the playhead when capture began', () => {
    expect(takeStart(base)).toBeCloseTo(12, 9);
    expect(takeStart({ ...base, captureWall: 5_250 })).toBeCloseTo(12.25, 9);
  });

  it('puts a word spoken on a frame back on that frame, given the reported input latency (within 5 ms)', () => {
    for (const inputLatency of [0, 0.01, 0.043, 0.12]) {
      for (const playStart of [0.5, 7.25]) {
        const playWall = 1_000;
        const captureWall = 1_180;
        const timing: TakeTiming = { playStart, playWall, captureWall, inputLatency, offset: 0 };
        const playheadAt = (wall: number) => playStart + (wall - playWall) / 1000;
        // A word spoken while the playhead is at `spokenAt` reaches the recorder `inputLatency` later.
        const spokenWall = 2_437;
        const spokenAt = playheadAt(spokenWall);
        const inTake = (spokenWall + inputLatency * 1000 - captureWall) / 1000;
        expect(Math.abs(takeStart(timing) + inTake - spokenAt)).toBeLessThan(0.005);
      }
    }
  });

  it('adds the Recording offset, kept within ±250 ms', () => {
    expect(takeStart({ ...base, offset: 0.1 })).toBeCloseTo(12.1, 9);
    expect(takeStart({ ...base, offset: -0.25 })).toBeCloseTo(11.75, 9);
    expect(takeStart({ ...base, offset: 2 })).toBeCloseTo(12 + RECORD_OFFSET_MAX, 9);
    expect(takeStart({ ...base, offset: -2 })).toBeCloseTo(12 - RECORD_OFFSET_MAX, 9);
    expect(RECORD_OFFSET_MAX).toBe(0.25);
  });

  it('never starts before 0', () => {
    expect(takeStart({ ...base, playStart: 0, inputLatency: 0.05, offset: -0.25 })).toBe(0);
  });
});

describe('what screen readers hear (AC-10)', () => {
  it('counts in: Recording in 3, 2, 1', () => {
    expect([3, 2, 1].map((seconds) => announceCountIn(seconds, seconds === 3))).toEqual(['Recording in 3', '2', '1']);
    expect(announceCountIn(5, true)).toBe('Recording in 5');
  });

  it('says where it records', () => {
    expect(announceStart('Voice')).toBe('Recording on Voice');
  });

  it('says what was added and what it replaced', () => {
    expect(
      announceResult({ name: 'Voice 2', start: 12.4, length: 8.6, replaced: [{ name: 'Voice 1', seconds: 2.1 }] }),
    ).toBe('Voice 2 added at 0:12.4, 8.6 s; replaced 2.1 s of Voice 1');
    expect(announceResult({ name: 'Voice 1', start: 0, length: 3, replaced: [] })).toBe(
      'Voice 1 added at 0:00.0, 3.0 s',
    );
    expect(
      announceResult({
        name: 'Voice 3',
        start: 61,
        length: 4,
        replaced: [
          { name: 'Voice 1', seconds: 1 },
          { name: 'song.mp3', seconds: 0.5 },
        ],
      }),
    ).toBe('Voice 3 added at 1:01.0, 4.0 s; replaced 1.0 s of Voice 1 and 0.5 s of song.mp3');
  });

  it('warns Too loud at most once every 5 s', () => {
    expect(TOO_LOUD_EVERY_MS).toBe(5_000);
    expect(tooLoudDue(null, 1_000)).toBe(true);
    expect(tooLoudDue(1_000, 5_999)).toBe(false);
    expect(tooLoudDue(1_000, 6_000)).toBe(true);
  });
});
