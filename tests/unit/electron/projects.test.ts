import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Loads in plain Node: `require('electron')` there is only the binary's path; ipcMain is used only to register.
import { createFlusher, createProjects } from '../../../electron/projects.cjs';

/*
 * 408 T050 (AC-1, AC-6, Constitution IX): the desktop app's project files in `library/projects/`: one file per project
 * (its entry on the first line, then the document), written to .tmp and renamed, so an interrupted write leaves the
 * last complete one; ids checked; a damaged file listed as can't be opened, never thrown.
 */

let folder: string;
beforeEach(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'chitthi-projects-'));
});
afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true });
});

const doc = (name: string) => JSON.stringify({ version: 1, name, clips: [], note: 'déjà vu ✓' });
const entry = (id: string, more: Record<string, unknown> = {}) =>
  JSON.stringify({ id, studio: 'video', name: id, kind: 'reel', length: 3, photos: 0, changed: 10, bytes: 0, thumb: '', readable: true, ...more });
const bytes = (text: string) => Buffer.byteLength(text);

describe('electron/projects.cjs (408 T050)', () => {
  it('writes, lists and reads back a project; bytes count the document and the cache', async () => {
    const projects = createProjects(folder);
    await projects.write('p1', doc('Hills'), entry('p1', { name: 'Hills', changed: 5 }));
    await projects.write('p2', doc('Sea'), entry('p2', { changed: 9 }));
    await projects.writeCache('p1', '{"thumbs":{}}');
    expect(await projects.read('p1')).toBe(doc('Hills'));
    expect(await projects.readCache('p1')).toBe('{"thumbs":{}}');
    const listed = await projects.list();
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'p1', name: 'Hills', changed: 5, bytes: bytes(doc('Hills')) + bytes('{"thumbs":{}}'), readable: true }),
        expect.objectContaining({ id: 'p2', bytes: bytes(doc('Sea')), readable: true }),
      ]),
    );
    expect(await projects.usage()).toEqual({ used: bytes(doc('Hills')) + bytes('{"thumbs":{}}') + bytes(doc('Sea')) });
  });

  it('an unknown project reads as null; an empty folder (or none yet) lists nothing', async () => {
    const projects = createProjects(path.join(folder, 'not-made-yet'));
    expect(await projects.list()).toEqual([]);
    expect(await projects.read('p1')).toBeNull();
    expect(await projects.readCache('p1')).toBeNull();
    expect(await projects.remove('p1')).toBe(0);
  });

  it('a write interrupted before its rename leaves the last complete project, and no .tmp behind (AC-1)', async () => {
    const failing = { ...fs, rename: () => Promise.reject(new Error('EIO: power cut')) };
    await createProjects(folder).write('p1', doc('Saved'), entry('p1', { name: 'Saved' }));
    await expect(createProjects(folder, failing).write('p1', doc('Half'), entry('p1', { name: 'Half' }))).rejects.toThrow('EIO');
    const projects = createProjects(folder);
    expect(await projects.read('p1')).toBe(doc('Saved'));
    expect((await projects.list()).map((item) => item.name)).toEqual(['Saved']);
    expect((await fs.readdir(folder)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('a .tmp left by a crash isn’t listed', async () => {
    const projects = createProjects(folder);
    await projects.write('p1', doc('Saved'), entry('p1'));
    await fs.writeFile(path.join(folder, 'p1.project.4242.tmp'), 'half a file');
    expect((await projects.list()).map((item) => item.id)).toEqual(['p1']);
  });

  it('a cut-short or damaged file is listed as can’t be opened, by its id; the others list (AC-6)', async () => {
    const projects = createProjects(folder);
    await projects.write('cut', doc('Cut'), entry('cut'));
    await projects.write('junk', doc('Junk'), entry('junk'));
    await projects.write('good', doc('Good'), entry('good'));
    const cut = path.join(folder, 'cut.project');
    const whole = await fs.readFile(cut);
    await fs.writeFile(cut, whole.subarray(0, whole.length - 10));
    await fs.writeFile(path.join(folder, 'junk.project'), 'not a header\n{}');
    const listed = await projects.list();
    expect(listed.map((item) => [item.id, item.readable]).sort((first, second) => String(first[0]).localeCompare(String(second[0])))).toEqual([
      ['cut', false],
      ['good', true],
      ['junk', false],
    ]);
  });

  it('remove deletes the project and its cache and gives the bytes freed (AC-7)', async () => {
    const projects = createProjects(folder);
    await projects.write('p1', doc('Hills'), entry('p1'));
    await projects.writeCache('p1', '{"a":1}');
    expect(await projects.remove('p1')).toBe(bytes(doc('Hills')) + bytes('{"a":1}'));
    expect(await fs.readdir(folder)).toEqual([]);
  });

  it('refuses ids that aren’t ids, and text that isn’t text, before touching the disk (Constitution IX)', async () => {
    const projects = createProjects(folder);
    for (const id of ['', '../evil', 'a/b', 'a\\b', 'x'.repeat(101), 'con.', 'CON', 'nul', 'Com1', 'lpt9', 7, null])
      await expect(projects.write(id as string, doc('X'), entry('x'))).rejects.toThrow('Invalid id');
    await expect(projects.read('../../secrets')).rejects.toThrow('Invalid id');
    await expect(projects.remove('..')).rejects.toThrow('Invalid id');
    await expect(projects.write('p1', { not: 'text' } as unknown as string, entry('p1'))).rejects.toThrow('Invalid project');
    await expect(projects.write('p1', doc('X'), 'not json')).rejects.toThrow('Invalid project');
    await expect(projects.writeCache('p1', 5 as unknown as string)).rejects.toThrow('Invalid project');
    expect(await fs.readdir(folder)).toEqual([]);
  });

  it('the entry is written as the page gave it, on one line, whatever it holds', async () => {
    const projects = createProjects(folder);
    await projects.write('p1', doc('X'), entry('p1', { name: 'Line one\nline two' }));
    expect((await projects.list())[0]?.name).toBe('Line one\nline two');
  });
});

describe('createFlusher: the page saves before the window closes (408 T052)', () => {
  it('asks the page with a new request id each time and resolves when it answers', async () => {
    const asked: number[] = [];
    const flusher = createFlusher((id) => asked.push(id));
    let done = false;
    const flushing = flusher.ask(2000).then((answered) => (done = answered));
    expect(asked).toHaveLength(1);
    await Promise.resolve();
    expect(done).toBe(false);
    flusher.answered(asked[0] ?? -1);
    await flushing;
    expect(done).toBe(true);
    void flusher.ask(2000);
    expect(asked).toHaveLength(2);
    expect(asked[1]).not.toBe(asked[0]);
  });

  it('gives up after the time limit (the window closes anyway); stray and late answers are ignored', async () => {
    vi.useFakeTimers();
    try {
      const asked: number[] = [];
      const flusher = createFlusher((id) => asked.push(id));
      let result: boolean | null = null;
      void flusher.ask(2000).then((answered) => (result = answered));
      flusher.answered(12345);
      flusher.answered('x');
      await vi.advanceTimersByTimeAsync(1999);
      expect(result).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(result).toBe(false);
      flusher.answered(asked[0] ?? -1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a page that can’t be reached counts as answered at once', async () => {
    const flusher = createFlusher(() => {
      throw new Error('Object has been destroyed');
    });
    expect(await flusher.ask(2000)).toBe(false);
  });
});
