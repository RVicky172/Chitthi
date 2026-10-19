import { describe, expect, it } from 'vitest';
import {
  DUCK_DEFAULTS,
  MAIN_VIDEO,
  MUSIC,
  TRACK_LIMITS,
  addAudioTrack,
  addTrack,
  countsAsVoice,
  defaultTracks,
  deleteTrack,
  moveTrack,
  patchTrack,
  renameTrack,
  setAudioTrack,
  soundRole,
  trackVolume,
  type Track,
} from '@/engine/tracks';

/* 208 AC-1: audio tracks — add, rename, reorder, mute, solo, lock, delete, role, volume, ducking. */

const ok = <T>(result: T | { error: string }): T => {
  if (result && typeof result === 'object' && 'error' in result) throw new Error(result.error);
  return result;
};
const err = (result: unknown): string | null =>
  result && typeof result === 'object' && 'error' in result ? (result as { error: string }).error : null;
const ids = (tracks: Track[]) => tracks.map((track) => track.id);
const audioOf = (tracks: Track[]) => tracks.filter((track) => track.kind === 'audio');
const byId = (tracks: Track[], id: string): Track => {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) throw new Error(`no track ${id}`);
  return track;
};
/**
 * Tracks with audio tracks added.
 * @param count how many audio tracks to add
 * @param start the tracks to add them to
 * @returns the tracks
 */
const withAudio = (count: number, start: Track[] = defaultTracks()): Track[] => {
  let tracks = start;
  for (let index = 0; index < count; index++) tracks = ok(addAudioTrack(tracks)).tracks;
  return tracks;
};

describe('adding audio tracks (208 AC-1)', () => {
  it('adds “Audio 2”, “Audio 3” … after the last audio track, Effects by default', () => {
    const added = ok(addAudioTrack(defaultTracks()));
    expect(added.id).toBe('A2');
    expect(ids(added.tracks)).toEqual([MAIN_VIDEO, MUSIC, 'A2']);
    expect(byId(added.tracks, 'A2')).toEqual({
      id: 'A2',
      kind: 'audio',
      name: 'Audio 2',
      hidden: false,
      muted: false,
      locked: false,
      role: 'effects',
    });
    const third = ok(addAudioTrack(added.tracks));
    expect(third.id).toBe('A3');
    expect(byId(third.tracks, 'A3').name).toBe('Audio 3');
  });

  it('stays after the last audio track when overlay tracks are added later', () => {
    const tracks = ok(addTrack(withAudio(1), false)).tracks;
    expect(ids(ok(addAudioTrack(tracks)).tracks)).toEqual([MAIN_VIDEO, 'O1', MUSIC, 'A2', 'A3']);
  });

  it('takes the lowest free number after one is deleted', () => {
    const tracks = withAudio(3);
    const without = ok(deleteTrack(tracks, [], 'A3')).tracks;
    expect(ok(addAudioTrack(without)).id).toBe('A3');
  });

  it('holds 8 audio tracks on the web and the desktop alike (D2); a ninth is refused with the reason', () => {
    expect(TRACK_LIMITS(false).audio).toBe(8);
    expect(TRACK_LIMITS(true).audio).toBe(8);
    const full = withAudio(7);
    expect(audioOf(full)).toHaveLength(8);
    expect(err(addAudioTrack(full))).toMatch(/up to 8 sound tracks/);
  });

  it('leaves the picture track limits as they were (4 web, 8 desktop)', () => {
    expect(TRACK_LIMITS(false).visual).toBe(4);
    expect(TRACK_LIMITS(true).visual).toBe(8);
  });
});

describe('roles, volume and ducking (208 AC-1, Q3, Q8–Q11)', () => {
  it('the first audio track is Music, added ones Effects', () => {
    const tracks = withAudio(1);
    expect(soundRole(byId(tracks, MUSIC))).toBe('music');
    expect(soundRole(byId(tracks, 'A2'))).toBe('effects');
  });

  it('defaults: volume 100 %, counts as voice, no ducking', () => {
    const music = byId(defaultTracks(), MUSIC);
    expect(trackVolume(music)).toBe(1);
    expect(countsAsVoice(music)).toBe(true);
    expect(music.duck).toBeUndefined();
    expect(DUCK_DEFAULTS).toEqual({ amount: 12, threshold: -40 });
  });

  it('sets role, volume (clamped 0–2), Counts as voice and ducking (clamped) on an audio track', () => {
    const tracks = withAudio(1);
    const voice = ok(setAudioTrack(tracks, 'A2', { role: 'voice' })).tracks;
    expect(soundRole(byId(voice, 'A2'))).toBe('voice');
    expect(trackVolume(byId(ok(setAudioTrack(tracks, MUSIC, { volume: 3 })).tracks, MUSIC))).toBe(2);
    expect(trackVolume(byId(ok(setAudioTrack(tracks, MUSIC, { volume: -1 })).tracks, MUSIC))).toBe(0);
    const left = ok(setAudioTrack(tracks, 'A2', { voice: false })).tracks;
    expect(countsAsVoice(byId(left, 'A2'))).toBe(false);
    const ducked = ok(setAudioTrack(tracks, MUSIC, { duck: { amount: 50, threshold: -90 } })).tracks;
    expect(byId(ducked, MUSIC).duck).toEqual({ amount: 30, threshold: -60 });
    const low = ok(setAudioTrack(tracks, MUSIC, { duck: { amount: 1, threshold: 0 } })).tracks;
    expect(byId(low, MUSIC).duck).toEqual({ amount: 3, threshold: -20 });
    const off = ok(setAudioTrack(ducked, MUSIC, { duck: null })).tracks;
    expect(byId(off, MUSIC).duck).toBeUndefined();
  });

  it('only Music and Effects tracks duck; making a ducked track Voice turns its ducking off', () => {
    const voice = ok(setAudioTrack(withAudio(1), 'A2', { role: 'voice' })).tracks;
    expect(err(setAudioTrack(voice, 'A2', { duck: DUCK_DEFAULTS }))).toMatch(/Voice/);
    const ducked = ok(setAudioTrack(withAudio(1), 'A2', { duck: DUCK_DEFAULTS })).tracks;
    expect(byId(ok(setAudioTrack(ducked, 'A2', { role: 'voice' })).tracks, 'A2').duck).toBeUndefined();
  });

  it('refuses picture tracks and unknown tracks; no change gives the same array', () => {
    const tracks = withAudio(1);
    expect(err(setAudioTrack(tracks, MAIN_VIDEO, { volume: 0.5 }))).toBeTruthy();
    expect(err(setAudioTrack(tracks, 'X9', { volume: 0.5 }))).toBeTruthy();
    expect(ok(setAudioTrack(tracks, MUSIC, { volume: 1 })).tracks).toBe(tracks);
    expect(ok(setAudioTrack(tracks, 'A2', { role: 'effects' })).tracks).toBe(tracks);
  });
});

describe('switches on audio tracks (208 AC-1, Q2)', () => {
  it('Mute, Solo and Lock on audio tracks; Solo only on audio tracks', () => {
    const tracks = withAudio(1);
    expect(byId(patchTrack(tracks, 'A2', { muted: true }), 'A2').muted).toBe(true);
    expect(byId(patchTrack(tracks, 'A2', { solo: true }), 'A2').solo).toBe(true);
    expect(byId(patchTrack(tracks, 'A2', { locked: true }), 'A2').locked).toBe(true);
    expect(patchTrack(tracks, MAIN_VIDEO, { solo: true })).toBe(tracks);
    const overlay = ok(addTrack(tracks, false));
    expect(patchTrack(overlay.tracks, overlay.id, { solo: true })).toBe(overlay.tracks);
  });

  it('turning Solo off removes the field, so tracks without it stay as saved', () => {
    const tracks = withAudio(1);
    const soloed = patchTrack(tracks, 'A2', { solo: true });
    expect(byId(patchTrack(soloed, 'A2', { solo: false }), 'A2')).toEqual(byId(tracks, 'A2'));
  });

  it('renames an audio track', () => {
    expect(byId(ok(renameTrack(withAudio(1), 'A2', 'Whooshes')).tracks, 'A2').name).toBe('Whooshes');
  });
});

describe('reordering and deleting audio tracks (208 AC-1)', () => {
  it('moves an audio track among the audio tracks only (+1 down, −1 up)', () => {
    const tracks = ok(addTrack(withAudio(2), false)).tracks;
    expect(ids(tracks)).toEqual([MAIN_VIDEO, 'O1', MUSIC, 'A2', 'A3']);
    expect(ids(ok(moveTrack(tracks, MUSIC, 1)).tracks)).toEqual([MAIN_VIDEO, 'O1', 'A2', MUSIC, 'A3']);
    expect(ids(ok(moveTrack(tracks, 'A3', -1)).tracks)).toEqual([MAIN_VIDEO, 'O1', MUSIC, 'A3', 'A2']);
    expect(err(moveTrack(tracks, MUSIC, -1))).toMatch(/first sound track/);
    expect(err(moveTrack(tracks, 'A3', 1))).toMatch(/last sound track/);
  });

  it('deletes an audio track with its sound clips; the last one is refused, as is a locked one', () => {
    const tracks = withAudio(1);
    const audio = [
      { id: 's1', track: MUSIC },
      { id: 's2', track: 'A2' },
    ];
    const deleted = ok(deleteTrack(tracks, [], 'A2', audio));
    expect(ids(deleted.tracks)).toEqual([MAIN_VIDEO, MUSIC]);
    expect(deleted.audio).toEqual([{ id: 's1', track: MUSIC }]);
    expect(err(deleteTrack(deleted.tracks, [], MUSIC))).toMatch(/at least one sound track/);
    const locked = patchTrack(tracks, 'A2', { locked: true });
    expect(err(deleteTrack(locked, [], 'A2'))).toMatch(/locked/);
  });

  it('the Music track can go when another audio track is left', () => {
    const deleted = ok(deleteTrack(withAudio(1), [], MUSIC));
    expect(ids(deleted.tracks)).toEqual([MAIN_VIDEO, 'A2']);
  });
});
