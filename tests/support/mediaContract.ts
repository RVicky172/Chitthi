import { beforeEach, describe, expect, it } from 'vitest';
import { blobOf, type MediaFile, type OpenedMedia } from '@/engine/mediaFile';
import { mediaKey } from '@/engine/mediaKey';
import type { MediaStore } from '@/lib/mediaStore';

/*
 * 408 T040 (AC-4, AC-5, AC-7): what every media store does — kept once by id, progress, no room said, open or missing,
 * sweep frees what no project uses. Two kinds: `copies` (the browser: every file copied into the device's storage)
 * and `references` (desktop: the user's files referenced where they are, never deleted; only app-made files kept).
 */

/** A media store under test, and what the contract can see and do around it. */
export interface MediaUnderTest {
  store: MediaStore;
  kind: 'copies' | 'references';
  /** Bytes the store's own files take now. */
  ownBytes(): number;
  /** References: whether a user's file is still where it was, unchanged. */
  userFileIntact(file: Blob): boolean;
  /** References: the kept user file behind an id moves away (or changes). */
  lose(id: string): void;
  /** References: what the next Find file… picks (null: cancelled). */
  pickNext(file: Blob | null): void;
}

/**
 * A file with distinct bytes.
 * @param name its name
 * @param size its size in bytes
 * @param seed what fills it
 * @param type its MIME type
 * @returns the file
 */
export function testFile(name: string, size: number, seed: number, type = 'video/mp4'): File {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index++) bytes[index] = (index * 31 + seed * 17) % 251;
  return new File([bytes], name, { type });
}

/**
 * The file an opened media entry gives, failing the test when it is missing.
 * @param opened what `open` gave
 * @returns the file (a Blob, or disk media on desktop)
 */
function fileOf(opened: OpenedMedia): MediaFile {
  if ('missing' in opened) throw new Error('expected a file, got missing');
  return opened.file;
}

/**
 * An opened file's bytes, read as the app reads them (disk media through its chitthi-media URL).
 * @param opened what `open` gave
 * @returns the bytes as a Blob
 */
const readBack = (opened: OpenedMedia): Promise<Blob> => blobOf(fileOf(opened));

/**
 * The contract every media store keeps.
 * @param name the implementation's name
 * @param make a fresh, empty store with this many bytes of room
 */
export function mediaContract(name: string, make: (room: number) => MediaUnderTest): void {
  describe(`media store: ${name} (408 T040)`, () => {
    let under: MediaUnderTest;
    let store: MediaStore;
    const clip = testFile('beach.mp4', 300_000, 1);
    const song = testFile('song.mp3', 120_000, 2, 'audio/mpeg');
    const recording = testFile('voice-01.webm', 80_000, 3, 'audio/webm');
    beforeEach(() => {
      under = make(1_000_000);
      store = under.store;
    });
    const copied = (file: Blob) => (under.kind === 'copies' ? file.size : 0);

    it('keeps a file once under its media id, whichever project adds it (AC-4)', async () => {
      const first = await store.keep(clip, false);
      const again = await store.keep(new File([clip], 'beach.mp4', { type: clip.type }), false);
      expect(first).toBe(await mediaKey(clip));
      expect(again).toBe(first);
      expect(under.ownBytes()).toBe(copied(clip));
      const opened = await store.open(first as string, 'beach.mp4', clip.type);
      const bytes = await readBack(opened);
      expect(bytes.size).toBe(clip.size);
      expect(bytes.type).toBe(clip.type);
      expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(new Uint8Array(await clip.arrayBuffer()));
      // A reopened file added again (to another project) is the same media: kept once.
      expect(await store.keep(fileOf(opened), false)).toBe(first);
      expect(under.ownBytes()).toBe(copied(clip));
    });

    it('a file the app made is always kept in the store’s own files', async () => {
      const id = await store.keep(recording, true);
      expect(typeof id).toBe('string');
      expect(under.ownBytes()).toBe(recording.size);
      expect((await readBack(await store.open(id as string, 'voice-01.webm'))).size).toBe(recording.size);
    });

    it('reports its progress, up to the whole file', async () => {
      const shares: number[] = [];
      await store.keep(clip, false, (share) => shares.push(share));
      expect(shares.at(-1)).toBe(1);
      expect(shares).toEqual([...shares].sort((first, second) => first - second));
    });

    it('a file that doesn’t fit is refused with its size and the space left; nothing is kept', async () => {
      under = make(100_000);
      const kept = await under.store.keep(clip, false);
      if (under.kind === 'copies') {
        expect(kept).toEqual({ error: 'There isn’t room for “beach.mp4”: it needs 300 KB, and 100 KB is left on this device.' });
        expect(under.ownBytes()).toBe(0);
      } else expect(kept).toBe(await mediaKey(clip));
      // A file the app made is copied everywhere, so it needs the room.
      const big = testFile('music.wav', 150_000, 4, 'audio/wav');
      expect(await under.store.keep(big, true)).toMatchObject({ error: expect.stringContaining('“music.wav”') as unknown });
    });

    it('an id it doesn’t hold opens as missing, with the name it was given', async () => {
      expect(await store.open('mnothere', 'gone.mp4')).toEqual({ missing: true, name: 'gone.mp4' });
    });

    it('sweep lets go of what no project uses and says the bytes freed (AC-7)', async () => {
      const clipId = (await store.keep(clip, false)) as string;
      const songId = (await store.keep(song, false)) as string;
      const voiceId = (await store.keep(recording, true)) as string;
      expect(await store.sweep(new Set([clipId]))).toBe(copied(song) + recording.size);
      expect(under.ownBytes()).toBe(copied(clip));
      expect(await store.open(songId, 'song.mp3')).toEqual({ missing: true, name: 'song.mp3' });
      expect(await store.open(voiceId, 'voice-01.webm')).toEqual({ missing: true, name: 'voice-01.webm' });
      expect((await readBack(await store.open(clipId, 'beach.mp4'))).size).toBe(clip.size);
      expect(await store.sweep(new Set([clipId]))).toBe(0);
    });

    it('never deletes, moves or changes a user’s own file (AC-7)', async () => {
      const songId = (await store.keep(song, false)) as string;
      await store.sweep(new Set());
      expect(under.userFileIntact(song)).toBe(true);
      expect(await store.open(songId, 'song.mp3')).toMatchObject({ missing: true });
    });

    it('Find file…: only the desktop app can; a found file reconnects its id (AC-5)', async () => {
      const id = (await store.keep(clip, false)) as string;
      if (under.kind === 'copies') {
        expect(await store.relink(id)).toBeNull();
        return;
      }
      under.lose(id);
      expect(await store.open(id, 'beach.mp4')).toEqual({ missing: true, name: 'beach.mp4' });
      under.pickNext(null);
      expect(await store.relink(id)).toBeNull();
      under.pickNext(new File([clip], 'beach.mp4', { type: clip.type }));
      expect((await readBack(defined(await store.relink(id)))).size).toBe(clip.size);
      expect((await readBack(await store.open(id, 'beach.mp4'))).size).toBe(clip.size);
    });
  });
}

/**
 * A value that must be there.
 * @param value the value
 * @returns it
 */
function defined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}
