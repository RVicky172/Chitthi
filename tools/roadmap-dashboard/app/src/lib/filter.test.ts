import { describe, expect, it } from 'vitest';
import { matchItem } from './filter';

const i202 = { id: '202', title: 'Edit operations: ripple, roll, slip, slide', workItem: 'P2.2', status: 'in-progress', note: '' };
const i203 = { id: '203', title: 'Compositing many tracks', workItem: 'P2.3', status: 'not-started', note: 'later', phase: 'phase-2' };

describe('matchItem', () => {
  it('searches number, title, work item and note, ignoring case', () => {
    expect(matchItem(i202, { q: 'SLIP' })).toBe(true);
    expect(matchItem(i202, { q: '202' })).toBe(true);
    expect(matchItem(i202, { q: 'p2.2' })).toBe(true);
    expect(matchItem(i203, { q: 'later' })).toBe(true);
    expect(matchItem(i203, { q: 'slip' })).toBe(false);
    expect(matchItem(i203, {})).toBe(true);
    expect(matchItem(i203, { q: '  ' })).toBe(true);
  });

  it('filters by status id', () => {
    expect(matchItem(i202, { status: 'in-progress' })).toBe(true);
    expect(matchItem(i203, { status: 'in-progress' })).toBe(false);
  });

  it('filters by phase independently and in combination with status and query', () => {
    expect(matchItem({ ...i202, phase: 'phase-2' }, { phase: 'phase-2' })).toBe(true);
    expect(matchItem(i203, { phase: 'phase-3' })).toBe(false);
    expect(matchItem(i203, { phase: 'phase-2', status: 'not-started', q: 'compositing' })).toBe(true);
    expect(matchItem(i203, { phase: 'phase-2', status: 'done' })).toBe(false);
    expect(matchItem(i203, {})).toBe(true);
  });

  it('filters 1,000 items without a slow per-item setup path', () => {
    const items = Array.from({ length: 1000 }, (_, n) => ({ ...i203, id: String(n), phase: n % 4 ? 'phase-2' : 'phase-3' }));
    const start = performance.now();
    const matches = items.filter((item) => matchItem(item, { q: 'compositing', phase: 'phase-2', status: 'not-started' }));

    expect(matches).toHaveLength(750);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
