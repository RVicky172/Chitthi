import type { PoolItem } from '../../state/videoStore';
import type { TakeRow } from '../../state/videoTakes';
import { lengthText } from './poolList';

/*
 * What the Audio panel's Recordings list says about a take (505 §3, AC-1). Free of React, so it is tested alone.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A moment as the list shows it, in local time.
 * @param ms ms since 1970
 * @returns e.g. "20 Oct 14:02"
 */
export function whenText(ms: number): string {
  const when = new Date(ms);
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  return `${when.getDate()} ${MONTHS[when.getMonth()] ?? ''} ${time}`;
}

/**
 * A take's detail line: its length, when it was recorded and with which microphone ("—" for what a take from before
 * 505 doesn't know).
 * @param item the take's pool item
 * @returns e.g. "0:41 · 20 Oct 14:02 · MacBook Microphone"
 */
export const takeDetail = (item: PoolItem): string =>
  [lengthText(item.srcDur), item.recordedAt === undefined ? '—' : whenText(item.recordedAt), item.microphone ?? '—'].join(' · ');

/**
 * Where a take is used.
 * @param row the take
 * @returns e.g. "Voice at 0:12", "Voice at 0:12 and 1 more", "Not used"
 */
export function takePlaceText({ uses, place }: Pick<TakeRow, 'uses' | 'place'>): string {
  if (!place) return 'Not used';
  const more = uses.length - 1;
  const where = `${place.track} at ${lengthText(Math.floor(place.start))}`;
  return more > 0 ? `${where} and ${more} more` : where;
}
