import { poolKey, usesOf, type PoolItem, type VState } from '../../state/videoStore';

/*
 * The Media panel's rules (504 §5, AC-2): which files a filter and a search show, how often each is used, and what a
 * row says about its file. Free of React, so they are tested alone.
 */

/** What the panel's filter chips show. */
export type PoolFilter = 'all' | 'video' | 'photo' | 'sound' | 'recordings';

/** The filter chips, in order, with their labels. */
export const POOL_FILTERS: readonly (readonly [PoolFilter, string])[] = [
  ['all', 'All'],
  ['video', 'Video'],
  ['photo', 'Photo'],
  ['sound', 'Sound'],
  ['recordings', 'Recordings'],
];

/**
 * Whether an item shows under a filter (recordings are sound too).
 * @param item the item
 * @param filter the filter
 * @returns true when it shows
 */
function shownBy(item: PoolItem, filter: PoolFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'sound') return item.kind === 'audio';
  if (filter === 'recordings') return item.recorded === true;
  return item.kind === filter;
}

/**
 * The items a filter and a name search show.
 * @param items the pool
 * @param filter the chosen filter
 * @param query the search, as typed
 * @returns the items, in pool order; the same array when nothing narrows it
 */
export function filterPool(items: readonly PoolItem[], filter: PoolFilter, query: string): readonly PoolItem[] {
  const words = query.trim().toLowerCase();
  if (filter === 'all' && !words) return items;
  return items.filter((item) => shownBy(item, filter) && item.name.toLowerCase().includes(words));
}

/**
 * How many clips and sound clips use each file.
 * @param video the editor
 * @returns uses by pool key; a file nothing uses isn't there
 */
export function usageCounts(video: Pick<VState, 'clips' | 'sounds'>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const used of [...video.clips, ...video.sounds]) {
    const key = poolKey(used);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * A file's length as the list shows it, in whole seconds.
 * @param seconds the length
 * @returns m:ss, or h:mm:ss from an hour
 */
export function lengthText(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/** What each kind of item is called on its row. */
const KIND_NAMES: Record<PoolItem['kind'], string> = { video: 'Video', photo: 'Photo', audio: 'Sound' };

/**
 * A row's detail line: the length (video and sound), the kind and how often it is used.
 * @param item the item
 * @param uses the clips and sound clips using it
 * @returns e.g. "0:12 · Video · Used 2×", "Photo · Not used"
 */
export function poolDetail(item: PoolItem, uses: number): string {
  const kind = item.recorded ? 'Recording' : KIND_NAMES[item.kind];
  const parts = [...(item.kind === 'photo' ? [] : [lengthText(item.srcDur)]), kind, uses ? `Used ${uses}×` : 'Not used'];
  return parts.join(' · ');
}

/**
 * Where a file is used, for the question before removing it (504 D4): each clip by its number on its track, each
 * sound clip by its name, with the track's name.
 * @param video the editor
 * @param key the file's pool key
 * @returns e.g. "Clip 2 on Video, Theme on Music"; '' when nothing uses it
 */
export function usesText(video: Pick<VState, 'tracks' | 'clips' | 'sounds'>, key: string): string {
  const trackName = (id: string): string => video.tracks.find((track) => track.id === id)?.name ?? 'a track';
  return usesOf(video, key)
    .map((use) => {
      if (use.kind === 'sound') return `${video.sounds.find((sound) => sound.id === use.id)?.name ?? 'A sound'} on ${trackName(use.track)}`;
      const number = video.clips.filter((clip) => clip.track === use.track).findIndex((clip) => clip.id === use.id) + 1;
      return `Clip ${number} on ${trackName(use.track)}`;
    })
    .join(', ');
}

/** The drag type of a pool row (its data is the item's pool key), told apart from files dragged in. */
export const POOL_DRAG = 'application/x-chitthi-pool';

/**
 * Whether a drag carries a pool row.
 * @param types the drag's `dataTransfer.types`
 * @returns true for a pool row
 */
export const isPoolDrag = (types: readonly string[]): boolean => types.includes(POOL_DRAG);
