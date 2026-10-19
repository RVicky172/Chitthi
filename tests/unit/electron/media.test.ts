import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// Loads in plain Node: `require('electron')` there is only the binary's path; ipcMain and protocol are used only to register.
import { createMedia } from '../../../electron/media.cjs';

/*
 * 408 T051 (AC-5, AC-7, Constitution IX): the desktop app's media index. The user's files are referenced where they
 * are (a path only the preload gave, size and modification time recorded); app-made files go in `library/media/`;
 * only the main process writes `library/media-index.json`; chitthi-media://<id> answers indexed ids with 200 / 206 and
 * 404 for anything unknown, moved or changed; sweep deletes only app-made files; Find file… reconnects the folder.
 */

let root: string;
let library: string;
let user: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'chitthi-media-'));
  library = path.join(root, 'library');
  user = path.join(root, 'Videos');
  await fs.mkdir(user, { recursive: true });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/**
 * Bytes 0, 1, 2 … 255, 0, 1 …
 * @param length how many
 * @returns the bytes
 */
const counting = (length: number) => Buffer.from(Array.from({ length }, (_, at) => at % 256));

/**
 * A file in the user's folder.
 * @param name its name
 * @param length its size
 * @returns its path
 */
async function userFile(name: string, length = 1000): Promise<string> {
  const file = path.join(user, name);
  await fs.writeFile(file, counting(length));
  return file;
}

/**
 * A request for chitthi-media://<id>.
 * @param id the media id
 * @param range the Range header, if any
 * @param method the HTTP method
 * @returns the request
 */
const get = (id: string, range?: string, method = 'GET') => new Request(`chitthi-media://${id}`, { method, headers: range ? { Range: range } : {} });

const indexFile = () => path.join(library, 'media-index.json');
const readIndex = async () => JSON.parse(await fs.readFile(indexFile(), 'utf8')) as { media: Record<string, { path: string; size: number; mtime: number; owned?: boolean }> };

describe('electron/media.cjs (408 T051)', () => {
  it('register references a picked file where it is and records its size and modification time', async () => {
    const file = await userFile('hills.mp4', 1234);
    const media = createMedia(library);
    expect(await media.register('m1', file)).toBe(true);
    const entry = (await readIndex()).media.m1;
    expect(entry).toMatchObject({ path: file, size: 1234, mtime: (await fs.stat(file)).mtimeMs });
    expect(entry.owned).toBeUndefined();
    expect(await fs.readdir(user)).toEqual(['hills.mp4']);
    expect(await media.status(['m1', 'nope'])).toEqual({ m1: { state: 'ok', size: 1234 }, nope: { state: 'missing', size: 0 } });
  });

  it('register with no path (a file the app made) is false and records nothing', async () => {
    const media = createMedia(library);
    expect(await media.register('m1', '')).toBe(false);
    expect(await media.status(['m1'])).toEqual({ m1: { state: 'missing', size: 0 } });
  });

  it('register refuses bad ids, relative paths, folders and files that aren’t there', async () => {
    const file = await userFile('a.mp4');
    const media = createMedia(library);
    await expect(media.register('../x', file)).rejects.toThrow('Invalid id');
    await expect(media.register('CON', file)).rejects.toThrow('Invalid id');
    await expect(media.register('m1', 'a.mp4')).rejects.toThrow('Invalid file');
    await expect(media.register('m1', 42 as unknown as string)).rejects.toThrow('Invalid file');
    await expect(media.register('m1', user)).rejects.toThrow('Invalid file');
    await expect(media.register('m1', path.join(user, 'gone.mp4'))).rejects.toThrow('Invalid file');
    expect(await media.status(['m1'])).toEqual({ m1: { state: 'missing', size: 0 } });
  });

  it('status says changed when the file’s size or time differs, missing when it moved', async () => {
    const grown = await userFile('grown.mp4', 100);
    const touched = await userFile('touched.mp4', 100);
    const moved = await userFile('moved.mp4', 100);
    const media = createMedia(library);
    await media.register('grown', grown);
    await media.register('touched', touched);
    await media.register('moved', moved);
    await fs.appendFile(grown, 'more');
    await fs.utimes(touched, new Date(2020, 0, 1), new Date(2020, 0, 1));
    await fs.rename(moved, path.join(root, 'moved.mp4'));
    expect(await media.status(['grown', 'touched', 'moved'])).toEqual({
      grown: { state: 'changed', size: 104 },
      touched: { state: 'changed', size: 100 },
      moved: { state: 'missing', size: 0 },
    });
  });

  it('the index outlives the process: a new instance reads what the last one wrote, and a damaged index starts empty', async () => {
    const file = await userFile('a.mp4');
    await createMedia(library).register('m1', file);
    expect(await createMedia(library).status(['m1'])).toEqual({ m1: { state: 'ok', size: 1000 } });
    await fs.writeFile(indexFile(), '{ not json');
    expect(await createMedia(library).status(['m1'])).toEqual({ m1: { state: 'missing', size: 0 } });
  });

  it('writes the index whole (to .tmp, renamed), so many registers at once all land and no .tmp is left', async () => {
    const media = createMedia(library);
    const files = await Promise.all(Array.from({ length: 12 }, (_, at) => userFile(`clip${at}.mp4`, 10 + at)));
    await Promise.all(files.map((file, at) => media.register(`m${at}`, file)));
    expect(Object.keys((await readIndex()).media)).toHaveLength(12);
    expect((await fs.readdir(library)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('an app-made file is written in pieces to media/<id>.part, then kept as media/<id> (owned)', async () => {
    const media = createMedia(library);
    const bytes = counting(10_000);
    const buffer = Uint8Array.from(bytes).buffer;
    await media.writeOwned('rec1', 0, buffer.slice(0, 4096));
    await media.writeOwned('rec1', 4096, buffer.slice(4096, 10_000));
    expect(await fs.readdir(path.join(library, 'media'))).toEqual(['rec1.part']);
    expect(await media.status(['rec1'])).toEqual({ rec1: { state: 'missing', size: 0 } });
    await media.finishOwned('rec1', true);
    const kept = path.join(library, 'media', 'rec1');
    expect(Buffer.compare(await fs.readFile(kept), bytes)).toBe(0);
    expect((await readIndex()).media.rec1).toMatchObject({ path: kept, size: 10_000, owned: true });
    expect(await media.status(['rec1'])).toEqual({ rec1: { state: 'ok', size: 10_000 } });
  });

  it('a cancelled app-made file leaves nothing; bad pieces are refused', async () => {
    const media = createMedia(library);
    await media.writeOwned('rec1', 0, new ArrayBuffer(100));
    await media.finishOwned('rec1', false);
    expect(await fs.readdir(path.join(library, 'media'))).toEqual([]);
    expect(await media.status(['rec1'])).toEqual({ rec1: { state: 'missing', size: 0 } });
    await expect(media.writeOwned('rec1', -1, new ArrayBuffer(1))).rejects.toThrow('Invalid');
    await expect(media.writeOwned('rec1', 0.5, new ArrayBuffer(1))).rejects.toThrow('Invalid');
    await expect(media.writeOwned('rec1', 0, 'text' as unknown as ArrayBuffer)).rejects.toThrow('Invalid');
    await expect(media.writeOwned('a/b', 0, new ArrayBuffer(1))).rejects.toThrow('Invalid id');
    await expect(media.finishOwned('never-written', true)).rejects.toThrow();
  });

  it('serves an indexed file whole (200) and in ranges (206), for the app’s page only (CORS)', async () => {
    const file = await userFile('a.mp4', 1000);
    const media = createMedia(library, { origin: 'app://chitthi' });
    await media.register('m1', file);

    const whole = await media.serve(get('m1'));
    expect(whole.status).toBe(200);
    expect(whole.headers.get('Content-Length')).toBe('1000');
    expect(whole.headers.get('Accept-Ranges')).toBe('bytes');
    expect(whole.headers.get('Content-Type')).toBe('video/mp4');
    expect(whole.headers.get('Access-Control-Allow-Origin')).toBe('app://chitthi');
    expect(Buffer.compare(Buffer.from(await whole.arrayBuffer()), counting(1000))).toBe(0);

    const middle = await media.serve(get('m1', 'bytes=100-199'));
    expect(middle.status).toBe(206);
    expect(middle.headers.get('Content-Range')).toBe('bytes 100-199/1000');
    expect(middle.headers.get('Content-Length')).toBe('100');
    expect(Buffer.compare(Buffer.from(await middle.arrayBuffer()), counting(1000).subarray(100, 200))).toBe(0);

    const open = await media.serve(get('m1', 'bytes=900-'));
    expect(open.status).toBe(206);
    expect(open.headers.get('Content-Range')).toBe('bytes 900-999/1000');
    expect((await open.arrayBuffer()).byteLength).toBe(100);

    const past = await media.serve(get('m1', 'bytes=950-5000'));
    expect(past.headers.get('Content-Range')).toBe('bytes 950-999/1000');

    const last = await media.serve(get('m1', 'bytes=-10'));
    expect(last.headers.get('Content-Range')).toBe('bytes 990-999/1000');

    expect((await media.serve(get('m1', 'bytes=1000-'))).status).toBe(416);
    const head = await media.serve(get('m1', undefined, 'HEAD'));
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe('1000');
    expect((await media.serve(get('m1', undefined, 'POST'))).status).toBe(405);
  });

  it('answers 404 for unknown ids, bad ids, moved files and changed files', async () => {
    const changed = await userFile('changed.mp4');
    const moved = await userFile('moved.mp4');
    const media = createMedia(library);
    await media.register('changed', changed);
    await media.register('moved', moved);
    await fs.appendFile(changed, 'x');
    await fs.rm(moved);
    for (const id of ['unknown', 'changed', 'moved']) expect((await media.serve(get(id))).status).toBe(404);
    expect((await media.serve(new Request('chitthi-media://bad%20id'))).status).toBe(404);
    expect((await media.serve(new Request('chitthi-media://m1/../../etc/passwd'))).status).toBe(404);
  });

  it('sweep forgets ids no project uses, deletes only app-made files, never the user’s, and reports bytes freed (AC-7)', async () => {
    const picked = await userFile('picked.mp4', 500);
    const shared = await userFile('shared.mp4', 300);
    const media = createMedia(library);
    await media.register('picked', picked);
    await media.register('shared', shared);
    await media.writeOwned('rec1', 0, new ArrayBuffer(700));
    await media.finishOwned('rec1', true);
    await media.writeOwned('rec2', 0, new ArrayBuffer(200));
    await media.finishOwned('rec2', true);

    expect(await media.sweep(['shared', 'rec2'])).toBe(700);
    expect(await fs.readdir(user)).toEqual(['picked.mp4', 'shared.mp4']);
    expect(await fs.readdir(path.join(library, 'media'))).toEqual(['rec2']);
    expect(Object.keys((await readIndex()).media).sort((first, second) => first.localeCompare(second))).toEqual(['rec2', 'shared']);
    expect(await media.status(['picked', 'rec1', 'rec2'])).toEqual({
      picked: { state: 'missing', size: 0 },
      rec1: { state: 'missing', size: 0 },
      rec2: { state: 'ok', size: 200 },
    });
    await expect(media.sweep('all' as unknown as string[])).rejects.toThrow('Invalid');
  });

  it('sweep never deletes an "owned" entry that points outside media/ (a hand-edited index)', async () => {
    const picked = await userFile('picked.mp4', 500);
    await fs.mkdir(library, { recursive: true });
    const stats = await fs.stat(picked);
    await fs.writeFile(indexFile(), JSON.stringify({ version: 1, media: { evil: { path: picked, size: 500, mtime: stats.mtimeMs, owned: true } } }));
    expect(await createMedia(library).sweep([])).toBe(0);
    expect(await fs.readdir(user)).toEqual(['picked.mp4']);
  });

  it('Find file… reconnects the id, and the other missing files whose names are in the chosen folder', async () => {
    const first = await userFile('one.mp4', 100);
    const second = await userFile('two.mp4', 200);
    const third = await userFile('three.mp4', 300);
    const stays = await userFile('stays.mp4', 50);
    let asked = '';
    const chooseFile = (name: string) => {
      asked = name;
      return Promise.resolve(path.join(root, 'Moved', 'one.mp4'));
    };
    const media = createMedia(library, { chooseFile });
    await media.register('one', first);
    await media.register('two', second);
    await media.register('three', third);
    await media.register('stays', stays);
    // The folder moved: one and two came along; three didn't.
    await fs.mkdir(path.join(root, 'Moved'));
    await fs.rename(first, path.join(root, 'Moved', 'one.mp4'));
    await fs.rename(second, path.join(root, 'Moved', 'two.mp4'));
    await fs.rm(third);

    expect(await media.findFile('one')).toEqual({ found: ['one', 'two'] });
    expect(asked).toBe('one.mp4');
    expect(await media.status(['one', 'two', 'three', 'stays'])).toEqual({
      one: { state: 'ok', size: 100 },
      two: { state: 'ok', size: 200 },
      three: { state: 'missing', size: 0 },
      stays: { state: 'ok', size: 50 },
    });
    expect((await readIndex()).media.one.path).toBe(path.join(root, 'Moved', 'one.mp4'));
    expect((await readIndex()).media.stays.path).toBe(stays);
    expect((await media.serve(get('two', 'bytes=0-9'))).status).toBe(206);
  });

  it('Find file… cancelled is null and changes nothing; an unknown id or a folder chosen is refused', async () => {
    const file = await userFile('one.mp4');
    let choice: string | null = null;
    const media = createMedia(library, { chooseFile: () => Promise.resolve(choice) });
    await media.register('one', file);
    await fs.rm(file);
    expect(await media.findFile('one')).toBeNull();
    expect(await media.status(['one'])).toEqual({ one: { state: 'missing', size: 0 } });
    await expect(media.findFile('unknown')).rejects.toThrow('Unknown media');
    choice = user;
    await expect(media.findFile('one')).rejects.toThrow('Invalid file');
  });

  it('freeSpace is the bytes free on the library’s disk', async () => {
    const free = await createMedia(library).freeSpace();
    expect(free).toBeGreaterThan(0);
    expect(Number.isFinite(free)).toBe(true);
  });
});
