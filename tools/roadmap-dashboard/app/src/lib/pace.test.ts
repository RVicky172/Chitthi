import { describe, expect, it } from 'vitest';
import type { FeatureSummary, Progress } from '../types';
import { featureAge, finishedOn, perDay } from './pace';

const done = (id: string, doneOn: string) => ({ id, text: `Task ${id}.`, doneOn });
function feature(id: string, finished: Progress['finished'], over: Partial<FeatureSummary> = {}): FeatureSummary {
  return {
    id,
    folder: `${id}-x`,
    status: 'in-progress',
    dates: { created: '2026-09-20', started: '2026-09-25', approved: '2026-09-21', done: null },
    progress: {
      criteria: { done: 0, total: 1 },
      tasks: { done: finished.length, total: 9, byStatus: { todo: 9 - finished.length, 'in-progress': 0, blocked: 0, done: finished.length } },
      openQuestions: 0,
      next: null,
      sections: [],
      running: [],
      blocked: [],
      finished,
      statuses: {},
    },
    ...over,
  };
}

describe('perDay (AC-13)', () => {
  const features = {
    '201': feature('201', [done('T001', '2026-10-10'), done('T002', '2026-10-10'), done('T003', '2026-10-01')]),
    '202': feature('202', [done('T001', '2026-10-09'), done('T002', '2026-09-26')]),
    '203': { id: '203', folder: '203-x' } as FeatureSummary,
  };

  it('counts finished tasks per local day over the last N days, oldest first, zero for quiet days', () => {
    const days = perDay(features, '2026-10-10', 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ day: '2026-09-27', count: 0 });
    expect(days.at(-1)).toEqual({ day: '2026-10-10', count: 2 });
    expect(days.find((d) => d.day === '2026-10-09')?.count).toBe(1);
    expect(days.find((d) => d.day === '2026-10-01')?.count).toBe(1);
    expect(days.reduce((a, d) => a + d.count, 0)).toBe(4); // 2026-09-26 is outside the 14 days
  });

  it('crosses month and year ends', () => {
    const f = { x: feature('x', [done('T1', '2025-12-31'), done('T2', '2026-01-01')]) };
    expect(perDay(f, '2026-01-02', 3)).toEqual([
      { day: '2025-12-31', count: 1 },
      { day: '2026-01-01', count: 1 },
      { day: '2026-01-02', count: 0 },
    ]);
  });

  it("finishedOn lists a day's tasks with their feature", () => {
    expect(finishedOn(features, '2026-10-10')).toEqual([
      { feature: '201', id: 'T001', text: 'Task T001.' },
      { feature: '201', id: 'T002', text: 'Task T002.' },
    ]);
    expect(finishedOn(features, '2026-10-08')).toEqual([]);
  });
});

describe('featureAge (AC-14)', () => {
  it('in progress: started, days since, not quiet with a task finished in the last 7 days', () => {
    expect(featureAge(feature('201', [done('T1', '2026-10-05')]), '2026-10-10')).toEqual({ started: '2026-09-25', days: 15, took: null, quiet: false });
  });

  it('quiet after 7 days without a finished task', () => {
    expect(featureAge(feature('201', [done('T1', '2026-10-03')]), '2026-10-10').quiet).toBe(true);
    expect(featureAge(feature('201', [done('T1', '2026-10-04')]), '2026-10-10').quiet).toBe(false);
  });

  it('a feature started in the last 7 days with nothing finished yet is not quiet; started longer ago it is', () => {
    const fresh = feature('x', [], { dates: { created: '2026-10-01', started: '2026-10-08' } });
    expect(featureAge(fresh, '2026-10-10').quiet).toBe(false);
    const stale = feature('x', [], { dates: { created: '2026-09-01', started: '2026-09-02' } });
    expect(featureAge(stale, '2026-10-10').quiet).toBe(true);
  });

  it('done: the days it took, never quiet', () => {
    const f = feature('201', [done('T1', '2026-09-01')], { status: 'implemented', dates: { created: '2026-09-20', started: '2026-09-25', done: '2026-10-07' } });
    expect(featureAge(f, '2026-10-10')).toEqual({ started: '2026-09-25', days: 15, took: 12, quiet: false });
  });

  it('no dates: nothing to say', () => {
    expect(featureAge({ id: 'x', folder: 'x' }, '2026-10-10')).toEqual({ started: null, days: null, took: null, quiet: false });
  });
});
