import { describe, expect, it } from 'vitest';
import { TAKE_KEEP_DAYS, makeTakeStore, takesToRecover, type TakeHeader } from '@/lib/takeStore';
import { codeUnitOrder } from '../../support/codeUnitOrder';
import { MemoryTakeBackend } from '../../support/memoryTakeBackend';

/* 209 AC-9: a take in progress is kept on the device chunk by chunk, found again after a crash, and swept after 30 days. */

const DAY = 86_400_000;

/**
 * A take's header.
 * @param id its id
 * @param extra other fields
 * @returns the header without `done`
 */
const header = (id: string, extra: Partial<TakeHeader> = {}): Omit<TakeHeader, 'done'> => ({
  id,
  project: 'p1',
  name: 'Voice 3',
  startedAt: 1_000 * DAY,
  track: 'A2',
  start: 12.4,
  mime: 'audio/webm;codecs=opus',
  ...extra,
});

/**
 * A chunk holding one text.
 * @param text its content
 * @returns the chunk
 */
const chunk = (text: string) => new Blob([text], { type: 'audio/webm' });

describe('take store', () => {
  it('keeps each chunk as it comes and joins them in recording order, whatever order the writes land in', async () => {
    const backend = new MemoryTakeBackend();
    backend.chunkDelays = [30, 0, 15, 0];
    const store = makeTakeStore(backend);
    await store.begin(header('t1'));
    await Promise.all(['a', 'b', 'c', 'd'].map((text) => store.append('t1', chunk(text))));
    const joined = await store.join('t1');
    expect(await joined.text()).toBe('abcd');
    expect(joined.type).toBe('audio/webm;codecs=opus');
  });

  it('finds an unfinished take after a “crash” (a new store over the same device storage)', async () => {
    const backend = new MemoryTakeBackend();
    const first = makeTakeStore(backend);
    await first.begin(header('t1'));
    await first.append('t1', chunk('a'));
    await first.append('t1', chunk('b'));
    const after = makeTakeStore(backend);
    expect(await after.list('p1')).toEqual([{ ...header('t1'), done: false }]);
    expect(await (await after.join('t1')).text()).toBe('ab');
  });

  it('marks a finished take, lists only the project’s takes and drops headers it can’t read', async () => {
    const backend = new MemoryTakeBackend();
    const store = makeTakeStore(backend);
    await store.begin(header('t1'));
    await store.begin(header('t2', { project: 'p2' }));
    await store.finish('t1');
    backend.headers.set('junk', { id: 'junk', start: 'soon' });
    expect(await store.list('p1')).toEqual([{ ...header('t1'), done: true }]);
    expect((await store.list()).map((take) => take.id).toSorted(codeUnitOrder)).toEqual(['t1', 't2']);
  });

  it('continues numbering chunks after a restart, so appended chunks stay after the saved ones', async () => {
    const backend = new MemoryTakeBackend();
    await makeTakeStore(backend).begin(header('t1'));
    const first = makeTakeStore(backend);
    await first.append('t1', chunk('a'));
    const second = makeTakeStore(backend);
    await second.append('t1', chunk('b'));
    expect(await (await second.join('t1')).text()).toBe('ab');
  });

  it('removes a take and its chunks', async () => {
    const backend = new MemoryTakeBackend();
    const store = makeTakeStore(backend);
    await store.begin(header('t1'));
    await store.append('t1', chunk('a'));
    await store.remove('t1');
    expect(await store.list()).toEqual([]);
    expect(backend.chunkStore.size).toBe(0);
  });

  it('passes a failed write on (a full disk) without losing the chunks before it', async () => {
    const backend = new MemoryTakeBackend();
    const store = makeTakeStore(backend);
    await store.begin(header('t1'));
    await store.append('t1', chunk('a'));
    backend.failNext = new DOMException('full', 'QuotaExceededError');
    await expect(store.append('t1', chunk('b'))).rejects.toThrow('full');
    expect(await (await store.join('t1')).text()).toBe('a');
  });

  it('deletes takes older than 30 days', async () => {
    expect(TAKE_KEEP_DAYS).toBe(30);
    const backend = new MemoryTakeBackend();
    const store = makeTakeStore(backend);
    const now = 2_000 * DAY;
    await store.begin(header('old', { startedAt: now - 30 * DAY - 1 }));
    await store.begin(header('edge', { startedAt: now - 30 * DAY }));
    await store.begin(header('new', { startedAt: now - DAY }));
    await store.append('old', chunk('x'));
    expect(await store.sweep(now)).toBe(1);
    expect((await store.list()).map((take) => take.id).toSorted(codeUnitOrder)).toEqual(['edge', 'new']);
    expect(backend.chunkStore.has('old')).toBe(false);
  });
});

describe('takes offered when a project opens (AC-9)', () => {
  it('counts each project’s takes, leaving out those the sweep deletes', () => {
    const now = 1_000 * DAY + TAKE_KEEP_DAYS * DAY;
    const headers: TakeHeader[] = [
      { ...header('a'), done: true },
      { ...header('b', { startedAt: now - DAY }), done: false },
      { ...header('c', { project: 'p2', startedAt: now - DAY }), done: true },
      { ...header('old', { project: 'p3', startedAt: now - TAKE_KEEP_DAYS * DAY - 1 }), done: true },
    ];
    const counts = takesToRecover(headers, now);
    expect(counts.get('p1')).toBe(2);
    expect(counts.get('p2')).toBe(1);
    expect(counts.has('p3')).toBe(false);
    expect(takesToRecover([], now).size).toBe(0);
  });
});
