import { describe, expect, it } from 'vitest';
import { matchItem } from './filter';

const i202 = { id: '202', title: 'Edit operations: ripple, roll, slip, slide', workItem: 'P2.2', status: 'in-progress', note: '' };
const i203 = { id: '203', title: 'Compositing many tracks', workItem: 'P2.3', status: 'not-started', note: 'later' };

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
});
