import { BlobSource, UrlSource } from 'mediabunny';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blobOf, isMissing, mediaInput, mediaName, missingFilesMessage, missingMedia, type DiskMedia } from '@/engine/mediaFile';

/*
 * 408 T020 (§5): one MediaFile type for every file a project holds — a Blob (the web, a picked file) or disk media
 * (desktop, read through chitthi-media://), or a file that is missing.
 */

const disk: DiskMedia = { id: 'm1a2b', url: 'chitthi-media://m1a2b', size: 4_000_000_000, type: 'video/mp4', name: 'long.mp4' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MediaFile (408 T020)', () => {
  it('a Blob is read through a BlobSource, disk media through a UrlSource on its chitthi-media URL', () => {
    expect(mediaInput(new Blob(['abc'], { type: 'video/mp4' }))).toBeInstanceOf(BlobSource);
    const source = mediaInput(disk);
    expect(source).toBeInstanceOf(UrlSource);
    expect((source as UrlSource & { _url: unknown })._url).toBe(disk.url);
  });

  it('a missing file is never read', () => {
    const gone = missingMedia({ id: 'm9', name: 'gone.mp4', size: 10, type: 'video/mp4' });
    expect(() => mediaInput(gone)).toThrow('“gone.mp4” is missing.');
    return expect(blobOf(gone)).rejects.toThrow('“gone.mp4” is missing.');
  });

  it('isMissing: only a file marked missing', () => {
    expect(isMissing(new Blob(['x']))).toBe(false);
    expect(isMissing(disk)).toBe(false);
    const gone = missingMedia({ id: 'm9', name: 'gone.mp4', size: 10, type: 'video/mp4' });
    expect(isMissing(gone)).toBe(true);
    expect(gone).toEqual({ id: 'm9', name: 'gone.mp4', size: 10, type: 'video/mp4', url: '', missing: true });
  });

  it('blobOf: a Blob as it is; disk media fetched once from its URL', async () => {
    const blob = new Blob(['photo'], { type: 'image/jpeg' });
    const fetched = new Blob(['from disk'], { type: 'image/jpeg' });
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(fetched, { status: 200 })));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(blobOf(blob)).resolves.toBe(blob);
    expect(fetchSpy).not.toHaveBeenCalled();
    const read = await blobOf({ ...disk, type: 'image/jpeg' });
    expect(await read.text()).toBe('from disk');
    expect(read.type).toBe('image/jpeg');
    expect(fetchSpy).toHaveBeenCalledWith(disk.url);
  });

  it('blobOf: a file that moved or changed since it was added (404) is an error, not an empty picture', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))));
    await expect(blobOf(disk)).rejects.toThrow('“long.mp4” couldn’t be read (404).');
  });

  it('mediaName: a picked file’s name, a disk file’s name, or a fallback for a bare Blob', () => {
    expect(mediaName(new File(['x'], 'beach.mp4'), 'A clip')).toBe('beach.mp4');
    expect(mediaName(disk, 'A clip')).toBe('long.mp4');
    expect(mediaName(new Blob(['x']), 'A clip')).toBe('A clip');
  });

  it('a disk file that can’t be read isn’t retried for ever', () => {
    const source = mediaInput(disk) as UrlSource & { _getRetryDelay: (attempts: number, error: unknown, url: string) => number | null };
    expect(source._getRetryDelay(1, new Error('404'), disk.url)).toBeNull();
  });

  it('missingFilesMessage: the missing files once each, in order; null when none is missing (408 D4)', () => {
    const gone = missingMedia({ id: 'm9', name: 'gone.mp4', size: 10, type: 'video/mp4' });
    const voice = missingMedia({ id: 'm8', name: 'voice.wav', size: 10, type: 'audio/wav' });
    expect(missingFilesMessage([new Blob(['x']), disk])).toBeNull();
    expect(missingFilesMessage([gone, disk, voice, gone])).toBe('Find the missing files first: gone.mp4, voice.wav.');
  });
});
