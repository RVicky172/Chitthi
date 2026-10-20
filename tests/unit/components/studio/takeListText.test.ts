import { describe, expect, it } from 'vitest';
import { takeDetail, takePlaceText, whenText } from '@/components/studio/takeListText';
import type { PoolItem } from '@/state/videoStore';
import type { TakeRow } from '@/state/videoTakes';

/*
 * 505 §3 (AC-1): what a row of the Recordings list says about its take.
 */

const item: PoolItem = { url: 'blob:t', kind: 'audio', name: 'Voice 1', file: new Blob(['t']), w: 0, h: 0, srcDur: 41.2, thumb: '', strip: [], recorded: true };

/**
 * A row for a take.
 * @param patch what to change
 * @returns the row
 */
const row = (patch: Partial<TakeRow> = {}): TakeRow => ({ key: 'blob:t', item, uses: [], place: null, ...patch });

describe('a take’s row (505 §3)', () => {
  it('says when, by day, month and 24-hour time', () => {
    expect(whenText(new Date(2026, 9, 20, 14, 2).getTime())).toBe('20 Oct 14:02');
  });

  it('gives the length, when and the microphone', () => {
    const at = new Date(2026, 9, 20, 9, 5).getTime();
    expect(takeDetail({ ...item, recordedAt: at, microphone: 'MacBook Microphone' })).toBe('0:41 · 20 Oct 09:05 · MacBook Microphone');
  });

  it('shows — for details a take from before 505 lacks', () => {
    expect(takeDetail(item)).toBe('0:41 · — · —');
  });

  it('says where it is used, or that it isn’t', () => {
    const place = { sound: 's1', trackId: 'A2', track: 'Voice', start: 12.4 };
    const use = { kind: 'sound' as const, id: 's1', track: 'A2' };
    expect(takePlaceText(row())).toBe('Not used');
    expect(takePlaceText(row({ uses: [use], place }))).toBe('Voice at 0:12');
    expect(takePlaceText(row({ uses: [use, { ...use, id: 's2' }, { ...use, id: 's3' }], place }))).toBe('Voice at 0:12 and 2 more');
  });
});
