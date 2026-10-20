import { describe, expect, it } from 'vitest';
import { POOL_DRAG, filterPool, isPoolDrag, lengthText, poolDetail, usageCounts, usesText } from '@/components/studio/poolList';
import { MAIN_VIDEO, MUSIC } from '@/engine/tracks';
import type { PoolItem, VClip, VSound, VState } from '@/state/videoStore';
import { defined } from '../../../support/defined';

/*
 * 504 AC-2: the Media panel's rules: filtering by kind, searching by name, how often each file is used, and what a
 * row says about its file.
 */

/**
 * A pool item.
 * @param url its URL
 * @param kind what it is
 * @param name its name
 * @param extra more fields
 * @returns the item
 */
const item = (url: string, kind: PoolItem['kind'], name: string, extra: Partial<PoolItem> = {}): PoolItem => ({
  url,
  kind,
  name,
  file: new Blob(),
  w: 0,
  h: 0,
  srcDur: 0,
  thumb: '',
  strip: [],
  ...extra,
});

const items = [
  item('blob:v', 'video', 'Beach Day.mp4', { srcDur: 12 }),
  item('blob:p', 'photo', 'sunset.jpg'),
  item('blob:s', 'audio', 'Theme song.mp3', { srcDur: 125.6 }),
  item('blob:r', 'audio', 'Voice 1', { srcDur: 4, recorded: true }),
];
const urls = (list: readonly PoolItem[]) => list.map((entry) => entry.url);

describe('filterPool', () => {
  it.each([
    ['all', ['blob:v', 'blob:p', 'blob:s', 'blob:r']],
    ['video', ['blob:v']],
    ['photo', ['blob:p']],
    ['sound', ['blob:s', 'blob:r']],
    ['recordings', ['blob:r']],
  ] as const)('%s', (filter, expected) => {
    expect(urls(filterPool(items, filter, ''))).toEqual(expected);
  });

  it('searches names, ignoring case and the spaces around the search', () => {
    expect(urls(filterPool(items, 'all', '  BEACH '))).toEqual(['blob:v']);
    expect(urls(filterPool(items, 'sound', 'o'))).toEqual(['blob:s', 'blob:r']);
    expect(urls(filterPool(items, 'photo', 'beach'))).toEqual([]);
  });

  it('gives the same list back when nothing narrows it', () => {
    expect(filterPool(items, 'all', '  ')).toBe(items);
  });
});

describe('usageCounts', () => {
  it('counts the clips and sound clips using each file, by its pool key', () => {
    const video = {
      clips: [{ url: 'blob:v', file: new Blob(), track: MAIN_VIDEO }, { url: 'blob:v', file: new Blob(), track: 'O1' }] as VClip[],
      sounds: [{ url: 'blob:s', file: new Blob(), track: MUSIC }] as VSound[],
    } as VState;
    const counts = usageCounts(video);
    expect(counts.get('blob:v')).toBe(2);
    expect(counts.get('blob:s')).toBe(1);
    expect(counts.get('blob:p')).toBeUndefined();
  });
});

describe('lengthText', () => {
  it.each([
    [0, '0:00'],
    [12, '0:12'],
    [125.6, '2:06'],
    [3725, '1:02:05'],
  ])('%s s → %s', (seconds, text) => {
    expect(lengthText(seconds)).toBe(text);
  });
});

describe('poolDetail', () => {
  it.each([
    [0, 0, '0:12 · Video · Not used'],
    [1, 2, 'Photo · Used 2×'],
    [2, 1, '2:06 · Sound · Used 1×'],
    [3, 0, '0:04 · Recording · Not used'],
  ])('item %i used %i times', (index, uses, text) => {
    expect(poolDetail(defined(items[index], `item ${index}`), uses)).toBe(text);
  });
});

describe('usesText (AC-4: what a removal takes with it)', () => {
  it('names each clip by its number on its track, and each sound clip by its name, with the track', () => {
    const video = {
      tracks: [
        { id: MAIN_VIDEO, kind: 'main', name: 'Video' },
        { id: 'O1', kind: 'overlay', name: 'Overlay 1' },
        { id: MUSIC, kind: 'audio', name: 'Music' },
      ],
      clips: [
        { id: 'a', url: 'blob:x', file: new Blob(), track: MAIN_VIDEO },
        { id: 'b', url: 'blob:v', file: new Blob(), track: MAIN_VIDEO },
        { id: 'o', url: 'blob:v', file: new Blob(), track: 'O1' },
      ],
      sounds: [{ id: 's', url: 'blob:v', file: new Blob(), track: MUSIC, name: 'Theme' }],
    } as unknown as VState;
    expect(usesText(video, 'blob:v')).toBe('Clip 2 on Video, Clip 1 on Overlay 1, Theme on Music');
    expect(usesText(video, 'blob:none')).toBe('');
  });
});

describe('the drag of a pool row', () => {
  it('is told apart from files and other drags', () => {
    expect(isPoolDrag([POOL_DRAG])).toBe(true);
    expect(isPoolDrag(['Files'])).toBe(false);
    expect(isPoolDrag(['text/plain', POOL_DRAG])).toBe(true);
    expect(POOL_DRAG).toMatch(/^application\/x-chitthi-/);
  });
});
