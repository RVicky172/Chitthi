import { toast } from '../../lib/toast';
import { addFromPool, removeFromPool } from '../../state/videoPool';
import { getVideo, poolKey, usesOf, type PoolItem } from '../../state/videoStore';
import { usesText } from './poolList';

/*
 * Adding a pool file to the timeline and taking it out of the project, as the media pool (504) and the Recordings list
 * (505) do it: what was left out is said, and removing a used file asks first.
 */

/**
 * Puts a pool file at the playhead (504 D1), saying what was left out, if anything.
 * @param key the item's pool key
 */
export function addToTimeline(key: string): void {
  void addFromPool(key).then((messages) => messages.forEach((message) => toast(message)));
}

/**
 * Takes a file out of the project, asking first when clips use it (504 D4).
 * @param item the item
 */
export function removeAsking(item: PoolItem): void {
  const key = poolKey(item);
  const video = getVideo();
  const uses = usesText(video, key);
  const goes = usesOf(video, key).length === 1 ? 'which goes too' : 'which all go too';
  if (uses && !confirm(`Remove “${item.name}” from the project? It is used by ${uses}, ${goes}. You can undo this.`)) return;
  removeFromPool(key);
}
