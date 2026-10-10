import { describe, expect, it } from 'vitest';
import type { FeatureSummary, Roadmap } from '../types';
import { currentPhase, isDone, phaseProgress, totals, waitingOn } from './roadmap';

const status = (icon: string, label: string, featureStatus: string[]) => ({ icon, label, featureStatus });
function roadmap(over: Partial<Roadmap> = {}): Roadmap {
  return {
    schema: 1,
    title: 'R',
    updated: '2026-01-01',
    statuses: {
      order: ['not-started', 'in-progress', 'done'],
      byId: {
        'not-started': status('⬜', 'Not started', []),
        'in-progress': status('🚧', 'In progress', ['in-progress']),
        done: status('✔️', 'Done', ['implemented']),
      } as Roadmap['statuses']['byId'],
    },
    phases: {
      order: ['base', 'p2', 'p3'],
      byId: {
        base: { title: 'Base', items: ['001', '002'] },
        p2: { title: 'Phase 2', items: ['201', '202', '203'] },
        p3: { title: 'Phase 3', items: ['301'] },
      },
    },
    items: {
      byId: {
        '001': { title: 'a', status: 'done', folder: null, needs: [] },
        '002': { title: 'b', status: 'done', folder: null, needs: [] },
        '201': { title: 'c', status: 'done', folder: null, needs: [] },
        '202': { title: 'd', status: 'in-progress', folder: 'features/202-d', needs: ['201'] },
        '203': { title: 'e', status: 'not-started', folder: null, needs: ['201', '202'] },
        '301': { title: 'f', status: 'not-started', folder: null, needs: [] },
      },
    },
    backlog: { order: [], byId: {} },
    ...over,
  };
}

describe('roadmap', () => {
  it('isDone follows the status that fits "implemented"', () => {
    const r = roadmap();
    expect(isDone(r, '201')).toBe(true);
    expect(isDone(r, '202')).toBe(false);
    expect(isDone(r, '999')).toBe(false);
  });

  it('currentPhase: the named one, else the first in progress, else the first not finished, else the last', () => {
    expect(currentPhase(roadmap({ currentPhase: 'p3' }))).toBe('p3');
    expect(currentPhase(roadmap({ currentPhase: 'nope' }))).toBe('p2');
    expect(currentPhase(roadmap())).toBe('p2');
    const r = roadmap();
    r.items.byId['202'].status = 'not-started';
    expect(currentPhase(r)).toBe('p2'); // first not finished
    for (const id of Object.keys(r.items.byId)) r.items.byId[id].status = 'done';
    expect(currentPhase(r)).toBe('p3');
  });

  it('phaseProgress counts items per status', () => {
    expect(phaseProgress(roadmap(), 'p2')).toEqual({ done: 1, total: 3, byStatus: { done: 1, 'in-progress': 1, 'not-started': 1 } });
  });

  it('waitingOn lists the needs that are not done', () => {
    expect(waitingOn(roadmap(), '203')).toEqual(['202']);
    expect(waitingOn(roadmap(), '202')).toEqual([]);
  });

  it('totals over the roadmap and the features', () => {
    const features: Record<string, FeatureSummary> = {
      '202': {
        id: '202',
        folder: '202-d',
        progress: {
          criteria: { done: 1, total: 4 },
          tasks: { done: 3, total: 10, byStatus: { todo: 5, 'in-progress': 1, blocked: 1, done: 3 } },
          openQuestions: 2,
          next: null,
          sections: [],
          running: [],
          blocked: [],
          finished: [],
          statuses: {},
        },
      },
    };
    expect(totals(roadmap(), features)).toEqual({
      items: 6,
      done: 3,
      inProgress: 1,
      features: 1,
      tasks: { done: 3, total: 10, blocked: 1 },
      openQuestions: 2,
    });
  });
});
