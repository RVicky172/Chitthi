import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { missingMedia } from '@/engine/mediaFile';
import { MAIN_VIDEO, defaultTracks } from '@/engine/tracks';
import type { DecodePool } from '@/engine/decodePool';
import { fallbackNote, pausedFrame, poolSource, type PreviewClip, type PreviewSource } from '@/components/studio/previewFrame';

/*
 * 408 T022 (D4): a clip whose file is missing is never decoded: the preview's sources give it no picture (no waiting
 * on a <video> with nothing to load), and the stage draws its placeholder instead.
 */

const gone = missingMedia({ id: 'm9', name: 'gone.mp4', size: 10, type: 'video/mp4' });

/**
 * A video clip on the main track.
 * @param id its id
 * @param start its start, seconds
 * @param file its file
 * @returns the clip
 */
const videoClip = (id: string, start: number, file: PreviewClip['file']): PreviewClip => ({
  id,
  kind: 'video',
  track: MAIN_VIDEO,
  start,
  dur: 0,
  in: 0,
  out: 2,
  edit: { ...DEFAULT_EDIT },
  motion: 'none',
  fade: false,
  url: '',
  file,
});

describe('missing files in the preview (408 T022)', () => {
  it('the paused frame doesn’t ask for a missing clip’s picture; the others still come', async () => {
    const asked: string[] = [];
    const source: PreviewSource = {
      frame: (clip) => {
        asked.push(clip.id);
        return Promise.resolve({ image: {} as CanvasImageSource, w: 4, h: 4 });
      },
      dispose: () => undefined,
    };
    const project = { tracks: defaultTracks(), clips: [videoClip('a', 0, gone), videoClip('b', 2, new Blob(['x']))], audio: [], layers: [], fadeOut: false };
    const first = await pausedFrame(project, 1, 30, source);
    expect(first.items.map(({ clip, pic }) => [clip.id, pic])).toEqual([['a', null]]);
    const second = await pausedFrame(project, 3, 30, source);
    expect(second.items[0]?.pic).not.toBeNull();
    expect(asked).toEqual(['b']);
  });

  it('the pool source gives no picture for a missing file, without decoding it or calling it undecodable', async () => {
    const decode = vi.fn();
    const fallbackFrame = vi.fn();
    const pool = { fallback: vi.fn(() => null), frame: decode } as unknown as DecodePool;
    const fallback: PreviewSource = { frame: fallbackFrame, dispose: () => undefined };
    const clip = videoClip('a', 0, gone);
    await expect(poolSource(pool, fallback).frame(clip, 0.5)).resolves.toBeNull();
    expect(decode).not.toHaveBeenCalled();
    expect(fallbackFrame).not.toHaveBeenCalled();
    expect(fallbackNote(gone)).toBeNull();
  });
});
