import { describe, expect, it } from 'vitest';
import {
  SOUND_MIN,
  addSound,
  deleteSound,
  duplicateSound,
  moveSound,
  placeTake,
  punchIn,
  rippleSound,
  rollSound,
  setFades,
  setToEnd,
  slideSound,
  slipSound,
  soundLength,
  splitSound,
  trimSound,
  type SoundCtx,
} from '@/engine/soundClips';
import type { AudioClip } from '@/engine/timeline';
import { snapTargets } from '@/engine/timeSnap';
import { MUSIC, addAudioTrack, defaultTracks, patchTrack, type Track } from '@/engine/tracks';

/* 208 AC-2: sound clips — added, moved, trimmed, split, duplicated and deleted, never overlapping on a track. */

const ok = <T>(result: T | { error: string }): T => {
  if (result && typeof result === 'object' && 'error' in result) throw new Error(result.error);
  return result;
};
const err = (result: unknown): string | null =>
  result && typeof result === 'object' && 'error' in result ? (result as { error: string }).error : null;

/**
 * A sound clip on a track.
 * @param id its id
 * @param track its track
 * @param start its start, timeline seconds
 * @param inPoint where it starts in the source
 * @param out where it ends in the source
 * @param extra other fields
 * @returns the clip (a 30-second source)
 */
const sound = (id: string, track: string, start: number, inPoint: number, out: number, extra: Partial<AudioClip> = {}): AudioClip => ({
  id,
  track,
  start,
  in: inPoint,
  out,
  volume: 1,
  toEnd: false,
  srcDur: 30,
  ...extra,
});

/**
 * The edits' context.
 * @param tracks the tracks (for their locks)
 * @param videoEnd the video's length, seconds
 * @returns the context
 */
const ctxOf = (tracks: Track[], videoEnd = 60): SoundCtx => ({
  videoEnd,
  locked: (id) => (tracks.find((track) => track.id === id)?.locked ? `The ${id} track is locked.` : null),
});

/**
 * Tracks with sound tracks added.
 * @param count how many to add after the Music track
 * @returns the tracks
 */
const withAudio = (count: number): Track[] => {
  let tracks = defaultTracks();
  for (let index = 0; index < count; index++) tracks = ok(addAudioTrack(tracks)).tracks;
  return tracks;
};

const byId = (audio: AudioClip[], id: string): AudioClip => {
  const found = audio.find((clip) => clip.id === id);
  if (!found) throw new Error(`no clip ${id}`);
  return found;
};

describe('a sound clip’s length (208 AC-2, Q7)', () => {
  it('is out − in; a toEnd clip runs to the video’s end, capped by its source', () => {
    expect(soundLength(sound('a', MUSIC, 2, 1, 5), 60, [])).toBe(4);
    expect(soundLength({ ...sound('m', MUSIC, 0, 4, 0), out: undefined, toEnd: true }, 20, [])).toBe(20);
    expect(soundLength({ ...sound('m', MUSIC, 0, 4, 0), out: undefined, toEnd: true }, 60, [])).toBe(26);
    expect(soundLength({ ...sound('m', MUSIC, 25, 0, 0), out: undefined, toEnd: true }, 20, [])).toBe(0);
  });
});

describe('adding a sound (208 AC-2)', () => {
  const file = { id: 'n', name: 'Whoosh.wav', srcDur: 3 };

  it('goes at the playhead on the chosen track, the whole file at 100 %', () => {
    const tracks = withAudio(1);
    const added = ok(addSound([], tracks, file, 4, 'A2', ctxOf(tracks)));
    expect(added.track).toBe('A2');
    expect(added.tracks).toBe(tracks);
    expect(added.audio).toEqual([{ id: 'n', track: 'A2', start: 4, in: 0, out: 3, volume: 1, toEnd: false, srcDur: 3, name: 'Whoosh.wav' }]);
  });

  it('goes on the first track with room when the chosen one has none (or is locked)', () => {
    const tracks = withAudio(1);
    const audio = [sound('m', MUSIC, 0, 0, 10)];
    expect(ok(addSound(audio, tracks, file, 4, MUSIC, ctxOf(tracks))).track).toBe('A2');
    const locked = patchTrack(tracks, 'A2', { locked: true });
    expect(ok(addSound([], locked, file, 4, 'A2', ctxOf(locked))).track).toBe(MUSIC);
  });

  it('makes a new track when none has room, and is refused at 8 tracks', () => {
    const tracks = withAudio(1);
    const audio = [sound('m', MUSIC, 0, 0, 10), sound('e', 'A2', 3, 0, 5)];
    const added = ok(addSound(audio, tracks, file, 4, MUSIC, ctxOf(tracks)));
    expect(added.track).toBe('A3');
    expect(added.tracks.map((track) => track.id)).toContain('A3');
    const full = withAudio(7);
    const busy = full.filter((track) => track.kind === 'audio').map((track, index) => sound(`b${index}`, track.id, 0, 0, 10));
    expect(err(addSound(busy, full, file, 4, MUSIC, ctxOf(full)))).toMatch(/no room/i);
  });

  it('a song longer than the video, as the first clip on the Music track, plays to the end (Q7)', () => {
    const tracks = withAudio(0);
    const song = { id: 's', name: 'Song.mp3', srcDur: 200 };
    const added = ok(addSound([], tracks, song, 0, MUSIC, ctxOf(tracks, 30)));
    expect(byId(added.audio, 's')).toMatchObject({ toEnd: true, in: 0 });
    expect(byId(added.audio, 's').out).toBeUndefined();
    const short = ok(addSound([], tracks, file, 0, MUSIC, ctxOf(tracks, 30)));
    expect(byId(short.audio, 'n').toEnd).toBe(false);
  });
});

describe('moving, trimming, splitting, duplicating and deleting (208 AC-2)', () => {
  const tracks = withAudio(1);
  const ctx = ctxOf(tracks);
  const audio = [sound('a', MUSIC, 0, 0, 5), sound('b', MUSIC, 10, 2, 6)];

  it('moves a clip in time or to another sound track; refuses an overlap', () => {
    expect(byId(ok(moveSound(audio, 'b', 6, ctx)).audio, 'b').start).toBe(6);
    expect(byId(ok(moveSound(audio, 'b', 1, ctx, 'A2')).audio, 'b')).toMatchObject({ track: 'A2', start: 1 });
    expect(err(moveSound(audio, 'b', 3, ctx))).toMatch(/overlap|room/i);
    expect(byId(ok(moveSound(audio, 'a', -2, ctx)).audio, 'a').start).toBe(0);
  });

  it('trims either edge within its source; never shorter than SOUND_MIN, never into its neighbour', () => {
    const later = ok(trimSound(audio, 'b', 'start', 1, ctx));
    expect(byId(later.audio, 'b')).toMatchObject({ start: 11, in: 3, out: 6 });
    expect(err(trimSound(audio, 'b', 'start', -3, ctx))).toMatch(/start of the sound file/);
    expect(err(trimSound(audio, 'b', 'end', 25, ctx))).toMatch(/end of the sound file/);
    expect(err(trimSound(audio, 'a', 'end', 6, ctx))).toMatch(/overlap|room/i);
    const shortest = byId(ok(trimSound(audio, 'b', 'end', -10, ctx)).audio, 'b');
    expect(soundLength(shortest, 60, [])).toBeCloseTo(SOUND_MIN, 9);
  });

  it('trimming a start moves its volume keys so they stay on the same sound', () => {
    const keyed = [sound('k', MUSIC, 0, 0, 10, { keys: { volume: [{ t: 4, v: 0.5, ease: 'linear' }] } })];
    expect(byId(ok(trimSound(keyed, 'k', 'start', 1, ctx)).audio, 'k').keys?.volume?.[0]?.t).toBe(3);
  });

  it('trimming a toEnd clip’s end turns toEnd off at the length it had', () => {
    const song = [{ ...sound('m', MUSIC, 0, 4, 0), out: undefined, toEnd: true, srcDur: 200 }];
    const trimmed = byId(ok(trimSound(song, 'm', 'end', -5, ctxOf(tracks, 30))).audio, 'm');
    expect(trimmed).toMatchObject({ toEnd: false, in: 4, out: 29 });
  });

  it('splits at a time into two clips that play the same sound', () => {
    const keyed = [sound('k', MUSIC, 2, 1, 9, { fadeIn: 1, fadeOut: 2, keys: { volume: [{ t: 0, v: 1, ease: 'linear' }, { t: 8, v: 0, ease: 'linear' }] } })];
    const parts = ok(splitSound(keyed, 'k', 6, 'k2', ctx)).audio;
    expect(byId(parts, 'k')).toMatchObject({ start: 2, in: 1, out: 5, fadeIn: 1 });
    expect(byId(parts, 'k').fadeOut).toBeUndefined();
    expect(byId(parts, 'k2')).toMatchObject({ start: 6, in: 5, out: 9, fadeOut: 2 });
    expect(byId(parts, 'k2').fadeIn).toBeUndefined();
    expect(byId(parts, 'k2').keys?.volume?.[0]).toMatchObject({ t: 0, v: 0.5 });
    expect(err(splitSound(keyed, 'k', 2.05, 'k2', ctx))).toBeTruthy();
    expect(err(splitSound(keyed, 'k', 20, 'k2', ctx))).toBeTruthy();
  });

  it('a part shorter than its fade keeps a fade no longer than itself (found by 208 T072)', () => {
    const faded = [sound('f', MUSIC, 0, 0, 8, { fadeIn: 3, fadeOut: 4 })];
    const parts = ok(splitSound(faded, 'f', 1, 'f2', ctx)).audio;
    expect(byId(parts, 'f').fadeIn).toBe(1);
    expect(byId(parts, 'f2').fadeOut).toBe(4);
    const late = ok(splitSound(faded, 'f', 6.5, 'f2', ctx)).audio;
    expect(byId(late, 'f').fadeIn).toBe(3);
    expect(byId(late, 'f2').fadeOut).toBe(1.5);
  });

  it('duplicates right after the clip when there is room', () => {
    const copy = byId(ok(duplicateSound(audio, 'a', 'a2', ctx)).audio, 'a2');
    expect(copy).toMatchObject({ track: MUSIC, start: 5, in: 0, out: 5 });
    expect(err(duplicateSound([sound('a', MUSIC, 0, 0, 5), sound('c', MUSIC, 7, 0, 5)], 'a', 'a2', ctx))).toMatch(/room/i);
  });

  it('deletes a clip', () => {
    expect(ok(deleteSound(audio, 'a', ctx)).audio.map((clip) => clip.id)).toEqual(['b']);
  });

  it('refuses every edit on a locked track, and an unknown clip', () => {
    const locked = patchTrack(tracks, MUSIC, { locked: true });
    const lockedCtx = ctxOf(locked);
    expect(err(moveSound(audio, 'b', 6, lockedCtx))).toMatch(/locked/);
    expect(err(trimSound(audio, 'b', 'end', -1, lockedCtx))).toMatch(/locked/);
    expect(err(splitSound(audio, 'b', 12, 'x', lockedCtx))).toMatch(/locked/);
    expect(err(duplicateSound(audio, 'a', 'x', lockedCtx))).toMatch(/locked/);
    expect(err(deleteSound(audio, 'a', lockedCtx))).toMatch(/locked/);
    expect(err(moveSound(audio, 'b', 1, ctx, 'A2'))).toBeNull();
    expect(err(moveSound(audio, 'zz', 1, ctx))).toBeTruthy();
  });

  it('keeps each track’s clips in start order', () => {
    const moved = ok(moveSound(audio, 'b', 20, ctx)).audio;
    const before = ok(moveSound(moved, 'a', 25, ctx)).audio;
    expect(before.filter((clip) => clip.track === MUSIC).map((clip) => clip.id)).toEqual(['b', 'a']);
  });
});

describe('Slip, Roll, Ripple and Slide within a track (208 AC-2, Q5)', () => {
  const tracks = withAudio(1);
  const ctx = ctxOf(tracks);
  // a 0–4 (file 2–6), b 4–8 (file 10–14), c 8–10 (file 0–2), d on another track
  const audio = [sound('a', MUSIC, 0, 2, 6), sound('b', MUSIC, 4, 10, 14), sound('c', MUSIC, 8, 0, 2), sound('d', 'A2', 0, 0, 5)];

  it('Slip plays another part of the file in the same place, clamped to the file', () => {
    expect(byId(ok(slipSound(audio, 'b', 3, ctx)).audio, 'b')).toMatchObject({ start: 4, in: 13, out: 17 });
    expect(byId(ok(slipSound(audio, 'b', 100, ctx)).audio, 'b')).toMatchObject({ in: 26, out: 30 });
    expect(byId(ok(slipSound(audio, 'a', -5, ctx)).audio, 'a')).toMatchObject({ in: 0, out: 4 });
    const song = [{ ...sound('m', MUSIC, 0, 4, 0), out: undefined, toEnd: true, srcDur: 100 }];
    expect(byId(ok(slipSound(song, 'm', 200, ctxOf(tracks, 30))).audio, 'm').in).toBe(70);
  });

  it('Roll moves the cut between a clip and the next one touching it', () => {
    const rolled = ok(rollSound(audio, 'a', 1, ctx)).audio;
    expect(byId(rolled, 'a')).toMatchObject({ start: 0, in: 2, out: 7 });
    expect(byId(rolled, 'b')).toMatchObject({ start: 5, in: 11, out: 14 });
    expect(err(rollSound(audio, 'c', 1, ctx))).toMatch(/right after/);
    expect(err(rollSound(audio, 'a', -3.95, ctx))).toBeTruthy();
    expect(err(rollSound(audio, 'b', 1.95, ctx))).toMatch(/shorter than/);
    const nearEnd = [sound('e', MUSIC, 0, 26, 30), sound('f', MUSIC, 4, 0, 5)];
    expect(err(rollSound(nearEnd, 'e', 1, ctx))).toMatch(/end of the sound file/);
  });

  it('Ripple trims an edge and moves the later clips on its track by the change; other tracks stay', () => {
    const shorter = ok(rippleSound(audio, 'a', 'end', -1, ctx)).audio;
    expect(byId(shorter, 'a')).toMatchObject({ start: 0, out: 5 });
    expect(byId(shorter, 'b').start).toBe(3);
    expect(byId(shorter, 'c').start).toBe(7);
    expect(byId(shorter, 'd').start).toBe(0);
    const startTrim = ok(rippleSound(audio, 'b', 'start', 1, ctx)).audio;
    expect(byId(startTrim, 'b')).toMatchObject({ start: 4, in: 11, out: 14 });
    expect(byId(startTrim, 'c').start).toBe(7);
    expect(byId(ok(rippleSound(audio, 'a', 'end', 2, ctx)).audio, 'c').start).toBe(10);
  });

  it('Slide moves a clip between its neighbours, which give and take the time', () => {
    const slid = ok(slideSound(audio, 'b', 1, ctx)).audio;
    expect(byId(slid, 'a')).toMatchObject({ start: 0, out: 7 });
    expect(byId(slid, 'b')).toMatchObject({ start: 5, in: 10, out: 14 });
    expect(byId(slid, 'c')).toMatchObject({ start: 9, in: 1, out: 2 });
    expect(err(slideSound(audio, 'a', 1, ctx))).toMatch(/before and after/);
    expect(err(slideSound(audio, 'b', 2, ctx))).toBeTruthy();
  });

  it('refuses on a locked track', () => {
    const locked = ctxOf(patchTrack(tracks, MUSIC, { locked: true }));
    expect(err(slipSound(audio, 'b', 1, locked))).toMatch(/locked/);
    expect(err(rollSound(audio, 'a', 1, locked))).toMatch(/locked/);
    expect(err(rippleSound(audio, 'a', 'end', -1, locked))).toMatch(/locked/);
    expect(err(slideSound(audio, 'b', 1, locked))).toMatch(/locked/);
  });
});

describe('fades (208 AC-2)', () => {
  const tracks = withAudio(0);
  const ctx = ctxOf(tracks);
  const audio = [sound('a', MUSIC, 0, 0, 8)];

  it('sets a fade in and out of 0–10 s each; 0 removes the field', () => {
    const faded = byId(ok(setFades(audio, 'a', { fadeIn: 1.5, fadeOut: 2 }, ctx)).audio, 'a');
    expect(faded).toMatchObject({ fadeIn: 1.5, fadeOut: 2 });
    const off = byId(ok(setFades([faded], 'a', { fadeIn: 0 }, ctx)).audio, 'a');
    expect(off.fadeIn).toBeUndefined();
    expect(off.fadeOut).toBe(2);
    expect(byId(ok(setFades(audio, 'a', { fadeIn: -3 }, ctx)).audio, 'a').fadeIn).toBeUndefined();
  });

  it('refuses fades longer than 10 s or together longer than the clip', () => {
    const long = [sound('l', MUSIC, 0, 0, 30)];
    expect(err(setFades(long, 'l', { fadeIn: 11 }, ctx))).toMatch(/10 s/);
    expect(err(setFades(audio, 'a', { fadeIn: 5, fadeOut: 4 }, ctx))).toMatch(/longer than the sound/);
    expect(err(setFades(audio, 'a', { fadeIn: 1 }, ctxOf(patchTrack(tracks, MUSIC, { locked: true }))))).toMatch(/locked/);
  });

  it('a trim that would leave the fades longer than the clip shortens them', () => {
    const faded = [sound('a', MUSIC, 0, 0, 8, { fadeIn: 3, fadeOut: 3 })];
    const trimmed = byId(ok(trimSound(faded, 'a', 'end', -4, ctx)).audio, 'a');
    expect((trimmed.fadeIn ?? 0) + (trimmed.fadeOut ?? 0)).toBeLessThanOrEqual(4 + 1e-9);
  });
});

describe('Snap to sound clips (208 AC-2)', () => {
  it('sound clip edges are snap targets, without the one being dragged', () => {
    const audio = [sound('a', MUSIC, 2, 0, 3), sound('b', 'A2', 7.5, 0, 1)];
    const targets = snapTargets([], [], 0, 20, { sound: 'b' }, audio);
    expect(targets).toEqual(expect.arrayContaining([2, 5]));
    expect(targets).not.toContain(7.5);
    expect(targets).not.toContain(8.5);
  });
});

describe('Play to the end of the video (208 Q7, T104)', () => {
  const tracks = withAudio(1);
  const ctx = ctxOf(tracks, 30);
  it('off: the clip keeps the length it had, as a fixed out point', () => {
    const song = [{ ...sound('m', MUSIC, 2, 4, 0), out: undefined, toEnd: true, srcDur: 200 }];
    expect(byId(ok(setToEnd(song, 'm', false, ctx)).audio, 'm')).toMatchObject({ toEnd: false, in: 4, out: 32 });
  });
  it('on: the clip plays to the end of the video, its out point dropped', () => {
    const clip = byId(ok(setToEnd([sound('a', MUSIC, 2, 0, 5)], 'a', true, ctx)).audio, 'a');
    expect(clip.toEnd).toBe(true);
    expect(clip.out).toBeUndefined();
    expect(soundLength(clip, 30, [clip])).toBe(28);
  });
  it('on, with another sound after it on its track, plays up to that sound (T072, option A); refused on a locked track', () => {
    const two = [sound('a', MUSIC, 2, 0, 5), sound('b', MUSIC, 10, 0, 3)];
    const audio = ok(setToEnd(two, 'a', true, ctx)).audio;
    expect(soundLength(byId(audio, 'a'), 30, audio)).toBe(8);
    const locked = patchTrack(tracks, MUSIC, { locked: true });
    expect(err(setToEnd(two, 'b', true, ctxOf(locked, 30)))).toBe('The A1 track is locked.');
  });
  it('changes nothing when already so', () => {
    const audio = [sound('a', MUSIC, 2, 0, 5)];
    expect(ok(setToEnd(audio, 'a', false, ctx)).audio).toBe(audio);
  });
});

describe('a Play to the end clip followed by another sound (208 T072, option A)', () => {
  const tracks = withAudio(1);
  const ctx = ctxOf(tracks, 30);
  const song = { ...sound('m', MUSIC, 0, 0, 0), out: undefined, toEnd: true, srcDur: 200 };
  it('plays to the end of the video or to the next sound on its track, whichever is first', () => {
    const audio = [song, sound('fx', MUSIC, 12, 0, 2), sound('other', 'A2', 5, 0, 2)];
    expect(soundLength(song, 30, audio)).toBe(12);
    expect(soundLength(song, 10, audio)).toBe(10);
    expect(soundLength(song, 30, [song])).toBe(30);
  });
  it('grows again when the next sound moves away, and a sound can go after it without overlapping', () => {
    const audio = [song, sound('fx', MUSIC, 12, 0, 2)];
    const moved = ok(moveSound(audio, 'fx', 25, ctx)).audio;
    expect(soundLength(byId(moved, 'm'), 30, moved)).toBe(25);
    expect(err(moveSound(moved, 'fx', 3, ctx))).toBeNull();
  });
  it('moved to or past the end of the video, it turns Play to the end off and keeps its length', () => {
    const audio = [{ ...song, start: 20 }];
    const moved = byId(ok(moveSound(audio, 'm', 31, ctx)).audio, 'm');
    expect(moved).toMatchObject({ toEnd: false, start: 31, in: 0, out: 10 });
  });
});

describe('punch-in: a take replaces the sound it overlaps on its track (209 AC-2)', () => {
  const tracks = withAudio(2);
  const ctx = ctxOf(tracks);
  const named = (id: string, start: number, inPoint: number, out: number, extra: Partial<AudioClip> = {}) =>
    sound(id, 'A2', start, inPoint, out, { name: `${id}.mp3`, ...extra });
  const take = (start: number, length: number): AudioClip =>
    sound('take', 'A2', start, 0, length, { name: 'Voice 2', srcDur: length });
  const onTrack = (audio: AudioClip[], track = 'A2') => audio.filter((clip) => clip.track === track);
  /**
   * Whether any two clips on A2 overlap.
   * @param audio the sound clips, in start order
   * @param videoEnd the video's length
   * @returns true when one starts before the one before it ends
   */
  const overlapping = (audio: AudioClip[], videoEnd = 60): boolean => {
    let reach = -Infinity;
    for (const clip of onTrack(audio)) {
      if (clip.start < reach - 1e-9) return true;
      reach = clip.start + soundLength(clip, videoEnd, audio);
    }
    return false;
  };

  it('deletes a clip inside the take', () => {
    const result = ok(punchIn([named('a', 5, 0, 3)], 'A2', 4, 10, ctx, 'split'));
    expect(result.audio).toEqual([]);
    expect(result.replaced).toEqual([{ name: 'a.mp3', seconds: 3 }]);
  });

  it('trims a clip over the take’s start at the start', () => {
    const result = ok(punchIn([named('a', 2, 1, 5, { fadeOut: 3 })], 'A2', 4, 10, ctx, 'split'));
    expect(byId(result.audio, 'a')).toMatchObject({ start: 2, in: 1, out: 3 });
    expect(byId(result.audio, 'a').fadeOut).toBeLessThanOrEqual(2);
    expect(result.replaced).toEqual([{ name: 'a.mp3', seconds: 2 }]);
  });

  it('trims a clip over the take’s end, its keys staying on the same sound', () => {
    const keys = { volume: [{ t: 0, v: 1, ease: 'linear' as const }, { t: 4, v: 0.5, ease: 'linear' as const }] };
    const result = ok(punchIn([named('a', 8, 1, 7, { keys })], 'A2', 4, 10, ctx, 'split'));
    expect(byId(result.audio, 'a')).toMatchObject({ start: 10, in: 3, out: 7 });
    expect(byId(result.audio, 'a').keys?.volume?.map((key) => key.t)).toEqual([-2, 2]);
    expect(result.replaced).toEqual([{ name: 'a.mp3', seconds: 2 }]);
  });

  it('splits a clip that covers the whole take around it', () => {
    const keys = { volume: [{ t: 0, v: 1, ease: 'linear' as const }, { t: 20, v: 0, ease: 'linear' as const }] };
    const result = ok(punchIn([named('a', 0, 0, 20, { fadeIn: 1, fadeOut: 2, keys })], 'A2', 5, 8, ctx, 'split'));
    const left = byId(result.audio, 'a');
    const right = byId(result.audio, 'split');
    expect(left).toMatchObject({ start: 0, in: 0, out: 5, fadeIn: 1 });
    expect(left.fadeOut).toBeUndefined();
    expect(right).toMatchObject({ start: 8, in: 8, out: 20, fadeOut: 2, name: 'a.mp3' });
    expect(right.fadeIn).toBeUndefined();
    // The volume line is unchanged on both sides: 0.75 at the left part's end, 0.6 at the right part's start.
    expect(left.keys?.volume?.at(-1)).toMatchObject({ t: 5, v: 0.75 });
    expect(right.keys?.volume?.[0]).toMatchObject({ t: 0, v: 0.6 });
    expect(result.replaced).toEqual([{ name: 'a.mp3', seconds: 3 }]);
  });

  it('handles several clips at once and never leaves overlaps', () => {
    const audio = [named('a', 0, 0, 3), named('b', 3, 0, 3), named('c', 6, 0, 3)];
    const result = ok(placeTake(audio, take(2, 5), ctx, 'split'));
    expect(onTrack(result.audio).map((clip) => [clip.id, clip.start, soundLength(clip, 60, result.audio)])).toEqual([
      ['a', 0, 2],
      ['take', 2, 5],
      ['c', 7, 2],
    ]);
    expect(overlapping(result.audio)).toBe(false);
    expect(result.replaced).toEqual([
      { name: 'a.mp3', seconds: 1 },
      { name: 'b.mp3', seconds: 3 },
      { name: 'c.mp3', seconds: 1 },
    ]);
  });

  it('sums the seconds replaced of clips with the same name', () => {
    const audio = [named('a', 0, 0, 3, { name: 'Voice 1' }), named('b', 3, 3, 6, { name: 'Voice 1' })];
    expect(ok(punchIn(audio, 'A2', 2, 4, ctx, 'split')).replaced).toEqual([{ name: 'Voice 1', seconds: 2 }]);
  });

  it('gives a Play to the end clip a fixed length before cutting it, the part after the take still playing to the end', () => {
    const song = { ...named('m', 0, 0, 0), out: undefined, toEnd: true };
    const result = ok(placeTake([song], take(5, 3), ctxOf(tracks, 20), 'split'));
    expect(byId(result.audio, 'm')).toMatchObject({ start: 0, in: 0, out: 5, toEnd: false });
    expect(byId(result.audio, 'split')).toMatchObject({ start: 8, in: 8, toEnd: true });
    expect(soundLength(byId(result.audio, 'split'), 20, result.audio)).toBe(12);
    expect(overlapping(result.audio, 20)).toBe(false);
  });

  it('drops a remnant shorter than the shortest sound', () => {
    const result = ok(punchIn([named('a', 0, 0, 4.05)], 'A2', 0, 4, ctx, 'split'));
    expect(result.audio).toEqual([]);
    expect(result.replaced[0]?.seconds).toBeCloseTo(4.05, 9);
  });

  it('leaves other tracks and clips outside the take untouched', () => {
    const elsewhere = sound('x', 'A3', 4, 0, 6);
    const before = named('a', 0, 0, 4);
    const after = named('b', 10, 0, 2);
    const result = ok(placeTake([before, elsewhere, after], take(4, 6), ctx, 'split'));
    expect(byId(result.audio, 'x')).toBe(elsewhere);
    expect(byId(result.audio, 'a')).toBe(before);
    expect(byId(result.audio, 'b')).toBe(after);
    expect(result.replaced).toEqual([]);
  });

  it('puts the take on its own track, in start order', () => {
    const result = ok(placeTake([named('a', 0, 0, 2), named('b', 20, 0, 2)], take(6, 4), ctx, 'split'));
    expect(byId(result.audio, 'take')).toMatchObject({ track: 'A2', start: 6, in: 0, out: 4 });
    expect(result.audio.map((clip) => clip.id)).toEqual(['a', 'take', 'b']);
  });

  it('refuses a locked track and changes nothing', () => {
    const locked = patchTrack(tracks, 'A2', { locked: true });
    expect(err(placeTake([named('a', 0, 0, 10)], take(2, 3), ctxOf(locked), 'split'))).toMatch(/locked/);
    expect(err(punchIn([named('a', 0, 0, 10)], 'A2', 2, 5, ctxOf(locked), 'split'))).toMatch(/locked/);
  });
});
