import { beforeEach, describe, expect, it } from 'vitest';
import type { PhotoProjectDoc } from '@/engine/photoProjectDoc';
import { mergeProject } from '@/engine/projectGate';
import type { ProjectCache, ProjectEntry, ProjectLibrary } from '@/lib/projects';

/*
 * 408 T030 (AC-1, AC-3, AC-6, AC-7): what every project library does, run on each implementation — in memory
 * (tests/unit/lib/projects.test.ts), the browser's (projectsWeb.test.ts, T032) and the desktop's (T033).
 */

/** A library under test and the faults the contract can cause in it. */
export interface LibraryUnderTest {
  library: ProjectLibrary;
  /** From now on, a write fails after its document is stored and before its entry is (as a crash would). */
  breakWrites(): void;
  /** Spoils a stored document, as a damaged disk or a browser bug would. */
  spoil(id: string): void;
}

/**
 * A photo project's document.
 * @param name its name
 * @returns the document
 */
export const photoDoc = (name: string): PhotoProjectDoc => ({
  version: 1,
  name,
  format: 'portrait',
  limit: 4,
  fileType: 'jpeg',
  quality: 92,
  caption: '',
  selected: null,
  items: [],
  media: [],
});
/**
 * A video project's document.
 * @param name its name
 * @returns the document
 */
export const videoDoc = (name: string) => ({ ...mergeProject({ version: 1 }, true).doc, name });

/**
 * A list entry.
 * @param id the project's id
 * @param more the fields that differ
 * @returns the entry
 */
export const entry = (id: string, more: Partial<ProjectEntry> = {}): ProjectEntry => ({
  id,
  studio: 'video',
  name: id,
  kind: 'reel',
  length: 12,
  photos: 0,
  changed: 1000,
  bytes: 0,
  thumb: '',
  readable: true,
  ...more,
});

const cache: ProjectCache = { thumbs: { v1: 'data:image/jpeg;base64,AAA' }, strips: { v1: ['a', 'b'] }, previews: {}, scans: { a1: { dur: 0.03, peaks: 'AQID', rms: 'AAAAAA==' } } };

/**
 * The bytes a document takes as stored: its JSON.
 * @param value the document
 * @returns its UTF-8 length
 */
const sizeOf = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * The contract every project library keeps.
 * @param name the implementation's name
 * @param make a fresh, empty library and its faults
 */
export function libraryContract(name: string, make: () => LibraryUnderTest): void {
  describe(`project library: ${name} (408 T030)`, () => {
    let under: LibraryUnderTest;
    let library: ProjectLibrary;
    beforeEach(() => {
      under = make();
      library = under.library;
    });

    it('starts empty', async () => {
      expect(await library.list()).toEqual([]);
      expect(await library.usage()).toMatchObject({ used: 0 });
    });

    it('lists newest first, with what each entry shows', async () => {
      await library.write('old', videoDoc('Old'), entry('old', { name: 'Old', changed: 1000 }));
      await library.write('photos', photoDoc('Post'), entry('photos', { studio: 'photo', kind: 'photo', name: 'Post', length: 0, photos: 3, changed: 3000, thumb: 'data:t' }));
      await library.write('mid', videoDoc('Mid'), entry('mid', { name: 'Mid', kind: 'vlog', length: 600, changed: 2000 }));
      const listed = await library.list();
      expect(listed.map((item) => item.id)).toEqual(['photos', 'mid', 'old']);
      expect(listed[0]).toEqual({ ...entry('photos', { studio: 'photo', kind: 'photo', name: 'Post', length: 0, photos: 3, changed: 3000, thumb: 'data:t' }), bytes: sizeOf(photoDoc('Post')) });
      expect(listed[1]).toMatchObject({ kind: 'vlog', length: 600, readable: true });
    });

    it('reads back what was written, unvalidated (the gates check it)', async () => {
      const doc = videoDoc('Hills');
      await library.write('p1', doc, entry('p1'));
      expect(await library.read('p1')).toEqual(JSON.parse(JSON.stringify(doc)));
    });

    it('a second write replaces the first, document and entry', async () => {
      await library.write('p1', videoDoc('First'), entry('p1', { name: 'First', changed: 1 }));
      await library.write('p1', videoDoc('Second'), entry('p1', { name: 'Second', changed: 2 }));
      expect(await library.read('p1')).toMatchObject({ name: 'Second' });
      expect((await library.list()).map((item) => [item.id, item.name])).toEqual([['p1', 'Second']]);
    });

    it('a write that fails half way leaves the last complete save (AC-1)', async () => {
      await library.write('p1', videoDoc('Saved'), entry('p1', { name: 'Saved' }));
      under.breakWrites();
      await expect(library.write('p1', videoDoc('Half'), entry('p1', { name: 'Half' }))).rejects.toThrow();
      expect(await library.read('p1')).toMatchObject({ name: 'Saved' });
      expect((await library.list()).map((item) => item.name)).toEqual(['Saved']);
      // A new project that fails half way isn't listed at all.
      await expect(library.write('p2', videoDoc('New'), entry('p2'))).rejects.toThrow();
      expect((await library.list()).map((item) => item.id)).toEqual(['p1']);
    });

    it('keeps a cache beside the project, counted in its bytes', async () => {
      expect(await library.readCache('p1')).toBeNull();
      await library.write('p1', videoDoc('Hills'), entry('p1'));
      await library.writeCache('p1', cache);
      expect(await library.readCache('p1')).toEqual(cache);
      expect((await library.list())[0]?.bytes).toBe(sizeOf(videoDoc('Hills')) + sizeOf(cache));
    });

    it('a damaged document stays listed as can’t be opened; the others load (AC-6)', async () => {
      await library.write('bad', videoDoc('Bad'), entry('bad', { changed: 2 }));
      await library.write('good', videoDoc('Good'), entry('good', { changed: 1 }));
      under.spoil('bad');
      const listed = await library.list();
      expect(listed.map((item) => [item.id, item.readable])).toEqual([
        ['bad', false],
        ['good', true],
      ]);
      await expect(library.read('bad')).rejects.toThrow();
      expect(await library.read('good')).toMatchObject({ name: 'Good' });
    });

    it('remove deletes the project and its cache and says the bytes freed (AC-7)', async () => {
      await library.write('p1', videoDoc('Hills'), entry('p1'));
      await library.writeCache('p1', cache);
      await library.write('p2', photoDoc('Post'), entry('p2', { studio: 'photo', kind: 'photo' }));
      expect(await library.remove('p1')).toBe(sizeOf(videoDoc('Hills')) + sizeOf(cache));
      expect((await library.list()).map((item) => item.id)).toEqual(['p2']);
      expect(await library.readCache('p1')).toBeNull();
      await expect(library.read('p1')).rejects.toThrow();
      expect(await library.remove('p1')).toBe(0);
      expect(await library.remove('nobody')).toBe(0);
    });

    it('usage counts every project’s bytes', async () => {
      await library.write('p1', videoDoc('Hills'), entry('p1'));
      await library.write('p2', photoDoc('Post'), entry('p2'));
      expect((await library.usage()).used).toBe(sizeOf(videoDoc('Hills')) + sizeOf(photoDoc('Post')));
    });

    it('refuses ids that aren’t ids', async () => {
      for (const id of ['', '../x', 'a/b', 'x'.repeat(101), 'a b', 'CON', 'nul'])
        await expect(library.write(id, videoDoc('X'), entry(id))).rejects.toThrow('Not a project id');
      await expect(library.read('../x')).rejects.toThrow('Not a project id');
    });
  });
}

