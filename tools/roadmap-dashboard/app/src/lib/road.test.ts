import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FeatureSummary, Progress, Roadmap } from '../types';
import { buildRoad, heroModel, roadblocks } from './road';

const status = (icon: string, label: string, featureStatus: string[]) => ({ icon, label, featureStatus });

/** The repo's status vocabulary; phases Base (001, 002), Phase 2 (201–203, release 3.0.0), Phase 3 (301), Other (401). */
function roadmap(over: Partial<Roadmap> = {}): Roadmap {
  return {
    schema: 1,
    title: 'R',
    updated: '2026-01-01',
    statuses: {
      order: ['not-started', 'spec-drafted', 'spec-approved', 'in-progress', 'done'],
      byId: {
        'not-started': status('⬜', 'Not started', []),
        'spec-drafted': status('📝', 'Spec drafted', ['draft']),
        'spec-approved': status('✅', 'Spec approved', ['approved']),
        'in-progress': status('🚧', 'In progress', ['in-progress']),
        done: status('✔️', 'Done', ['implemented']),
      } as Roadmap['statuses']['byId'],
    },
    phases: {
      order: ['base', 'p2', 'p3', 'other'],
      byId: {
        base: { title: 'Base', goal: 'g', exit: 'e', items: ['001', '002'] },
        p2: { title: 'Phase 2', release: '3.0.0', items: ['201', '202', '203'] },
        p3: { title: 'Phase 3', items: ['301'] },
        other: { title: 'Other', items: ['401'] },
      },
    },
    items: {
      byId: {
        '001': { title: 'a', status: 'done', folder: 'features/001-a', needs: [] },
        '002': { title: 'b', status: 'done', folder: null, needs: [] },
        '201': { title: 'c', status: 'done', folder: 'features/201-c', needs: [] },
        '202': { title: 'd', status: 'in-progress', folder: 'features/202-d', needs: ['201'] },
        '203': { title: 'e', status: 'spec-approved', folder: 'features/203-e', needs: ['202'] },
        '301': { title: 'f', status: 'not-started', folder: null, needs: [] },
        '401': { title: 'g', status: 'spec-drafted', folder: 'features/401-g', needs: [] },
      },
    },
    backlog: { order: [], byId: {} },
    ...over,
  };
}

function progress(over: Partial<Progress> = {}): Progress {
  return {
    criteria: { done: 0, total: 3 },
    tasks: { done: 2, total: 5, byStatus: { todo: 2, 'in-progress': 1, blocked: 0, done: 2 } },
    openQuestions: 0,
    next: { id: 'T003', text: 'Three.', status: 'in-progress' },
    sections: [
      { title: 'Tests', done: 2, total: 2 },
      { title: 'Core', done: 0, total: 3 },
    ],
    running: [{ id: 'T003', text: 'Three.', section: 'Core', startedOn: '2026-01-02' }],
    blocked: [],
    finished: [
      { id: 'T001', text: 'One.', doneOn: '2026-01-01' },
      { id: 'T002', text: 'Two.', doneOn: '2026-01-02' },
    ],
    statuses: { T001: 'done', T002: 'done', T003: 'in-progress', T004: 'todo', T005: 'todo' },
    upNext: { id: 'T004', text: 'Four.' },
    ...over,
  };
}

const feature = (id: string, over: Partial<FeatureSummary> = {}): FeatureSummary => ({
  id,
  folder: `${id}-x`,
  title: `Feature ${id}`,
  status: 'in-progress',
  progress: progress(),
  ...over,
});

function features(): Record<string, FeatureSummary> {
  return {
    '001': feature('001', { status: 'implemented', progress: progress({ running: [], next: null }) }),
    '201': feature('201', { status: 'implemented', progress: progress({ running: [], next: null }) }),
    '202': feature('202'),
    '203': feature('203', { status: 'approved', progress: progress({ running: [], tasks: { done: 0, total: 0, byStatus: { todo: 0, 'in-progress': 0, blocked: 0, done: 0 } } }) }),
    '401': feature('401', { status: 'draft' }),
  };
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('buildRoad (AC-1)', () => {
  it('lists every item as a stop, in phase order then item order, with its facts', () => {
    const road = buildRoad(roadmap(), features());
    expect(ids(road.stops)).toEqual(['001', '002', '201', '202', '203', '301', '401']);
    expect(road.stops.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const s = road.stops[3];
    expect(s).toMatchObject({ id: '202', phase: 'p2', item: { title: 'd' }, statusText: 'In progress', link: true });
    expect(s.feature?.progress?.tasks).toMatchObject({ done: 2, total: 5 });
  });

  it('links only stops that have a spec', () => {
    const road = buildRoad(roadmap(), features());
    expect(road.stops.filter((s) => s.link).map((s) => s.id)).toEqual(['001', '201', '202', '203', '401']);
  });

  it('skips ids a phase names that the roadmap has no item for', () => {
    const r = roadmap();
    r.phases.byId.p3.items = ['301', '399'];
    expect(ids(buildRoad(r, features()).stops)).toEqual(['001', '002', '201', '202', '203', '301', '401']);
  });

  it("gives today's roadmap.json one stop per item, in order", () => {
    const r = JSON.parse(readFileSync(new URL('../../../../../specs/roadmap.json', import.meta.url), 'utf8')) as Roadmap;
    const road = buildRoad(r, {});
    const expected = r.phases.order.flatMap((p) => r.phases.byId[p].items.filter((id) => r.items.byId[id]));
    expect(ids(road.stops)).toEqual(expected);
    expect(road.stops.length).toBe(Object.keys(r.items.byId).length);
  });
});

describe('stop states and kinds (AC-2)', () => {
  const states = (r: Roadmap, f = features()) => Object.fromEntries(buildRoad(r, f).stops.map((s) => [s.id, s.state]));
  const kinds = (r: Roadmap, f = features()) => Object.fromEntries(buildRoad(r, f).stops.map((s) => [s.id, s.kind]));

  it('mid-phase: travelled up to the item in progress, current there, ahead after', () => {
    const road = buildRoad(roadmap(), features());
    expect(road.current?.id).toBe('202');
    expect(states(roadmap())).toEqual({ '001': 'travelled', '002': 'travelled', '201': 'travelled', '202': 'current', '203': 'ahead', '301': 'ahead', '401': 'ahead' });
    expect(kinds(roadmap())).toEqual({ '001': 'done', '002': 'done', '201': 'done', '202': 'in-progress', '203': 'approved', '301': 'not-started', '401': 'drafted' });
  });

  it('none started: the first item of the first phase is current, nothing travelled', () => {
    const r = roadmap();
    for (const id of Object.keys(r.items.byId)) r.items.byId[id].status = 'not-started';
    const road = buildRoad(r, {});
    expect(road.current?.id).toBe('001');
    expect(road.stops.filter((s) => s.state === 'travelled')).toEqual([]);
  });

  it('a feature with blocked tasks is a blocked stop (unless done)', () => {
    const f = features();
    f['202'] = feature('202', { progress: progress({ blocked: [{ id: 'T004', text: 'Four.', reason: 'Needs the maintainer.' }] }) });
    f['201'] = feature('201', { status: 'implemented', progress: progress({ blocked: [{ id: 'T009', text: 'Nine.', reason: 'Manual.' }] }) });
    expect(kinds(roadmap(), f)['202']).toBe('blocked');
    expect(kinds(roadmap(), f)['201']).toBe('done');
    expect(buildRoad(roadmap(), f).current?.id).toBe('202');
  });

  it('all done: no current stop, every stop travelled', () => {
    const r = roadmap();
    for (const id of Object.keys(r.items.byId)) r.items.byId[id].status = 'done';
    const road = buildRoad(r, features());
    expect(road.current).toBeNull();
    expect(new Set(road.stops.map((s) => s.state))).toEqual(new Set(['travelled']));
  });

  it('currentPhase set: its first item not done is current, even with an item in progress elsewhere', () => {
    expect(buildRoad(roadmap({ currentPhase: 'p3' }), features()).current?.id).toBe('301');
    expect(states(roadmap({ currentPhase: 'p3' }))['202']).toBe('travelled');
  });

  it('a current phase that is all done hands over to the first item not done after it', () => {
    expect(buildRoad(roadmap({ currentPhase: 'base' }), features()).current?.id).toBe('202');
  });

  it('a phase with no items is an empty region and changes nothing else', () => {
    const r = roadmap();
    r.phases.order.splice(2, 0, 'empty');
    r.phases.byId.empty = { title: 'Empty', items: [] };
    const road = buildRoad(r, features());
    expect(road.regions.map((g) => g.phase)).toEqual(['base', 'p2', 'empty', 'p3', 'other']);
    expect(road.regions[2]).toMatchObject({ stops: [], items: { done: 0, total: 0 }, tasks: { done: 0, total: 0 } });
    expect(road.current?.id).toBe('202');
  });

  it('every stop carries its status as text', () => {
    for (const s of buildRoad(roadmap(), features()).stops) expect(s.statusText.length).toBeGreaterThan(0);
    const r = roadmap();
    r.items.byId['301'].status = 'unknown';
    expect(buildRoad(r, features()).stops.find((s) => s.id === '301')).toMatchObject({ kind: 'not-started', statusText: 'unknown' });
  });
});

describe('regions (AC-3)', () => {
  it('give title, goal, exit, release, items and tasks done / total, and which one is current', () => {
    const road = buildRoad(roadmap(), features());
    expect(road.regions.map((g) => [g.phase, g.items, g.tasks, g.current])).toEqual([
      ['base', { done: 2, total: 2 }, { done: 2, total: 5 }, false],
      ['p2', { done: 1, total: 3 }, { done: 4, total: 10 }, true],
      ['p3', { done: 0, total: 1 }, { done: 0, total: 0 }, false],
      ['other', { done: 0, total: 1 }, { done: 2, total: 5 }, false],
    ]);
    expect(road.regions[0]).toMatchObject({ title: 'Base', goal: 'g', exit: 'e', release: null });
    expect(road.regions[1]).toMatchObject({ release: '3.0.0' });
    expect(ids(road.regions[1].stops)).toEqual(['201', '202', '203']);
  });
});

describe('heroModel (AC-6)', () => {
  const stopOf = (f: Record<string, FeatureSummary>, id = '202') => buildRoad(roadmap(), f).stops.find((s) => s.id === id)!;

  it('one running task: ring, segments, running, next, no blocked', () => {
    expect(heroModel(stopOf(features()))).toEqual({
      ring: { done: 2, total: 5 },
      segments: [
        { title: 'Tests', done: 2, total: 2 },
        { title: 'Core', done: 0, total: 3 },
      ],
      running: [{ id: 'T003', text: 'Three.', section: 'Core', startedOn: '2026-01-02' }],
      next: { id: 'T004', text: 'Four.' },
      blocked: [],
    });
  });

  it('two running tasks are both listed', () => {
    const f = features();
    const two = [
      { id: 'T003', text: 'Three.', section: 'Core', startedOn: '2026-01-02' },
      { id: 'T004', text: 'Four.', section: 'Core', startedOn: null },
    ];
    f['202'] = feature('202', { progress: progress({ running: two }) });
    expect(heroModel(stopOf(f))?.running).toEqual(two);
  });

  it('none running: no running tasks, the next one to do is shown', () => {
    const f = features();
    f['202'] = feature('202', { progress: progress({ running: [], upNext: { id: 'T004', text: 'Four.' } }) });
    expect(heroModel(stopOf(f))).toMatchObject({ running: [], next: { id: 'T004', text: 'Four.' } });
  });

  it('blocked tasks come with their reasons', () => {
    const f = features();
    f['202'] = feature('202', { progress: progress({ blocked: [{ id: 'T005', text: 'Five.', reason: 'Waits for hardware.' }] }) });
    expect(heroModel(stopOf(f))?.blocked).toEqual([{ id: 'T005', text: 'Five.', reason: 'Waits for hardware.' }]);
  });

  it('all done: a full ring, nothing running, no next', () => {
    const f = features();
    f['202'] = feature('202', {
      progress: progress({ tasks: { done: 5, total: 5, byStatus: { todo: 0, 'in-progress': 0, blocked: 0, done: 5 } }, running: [], next: null, upNext: null }),
    });
    expect(heroModel(stopOf(f))).toMatchObject({ ring: { done: 5, total: 5 }, running: [], next: null });
  });

  it('a stop without a spec has no hero model', () => {
    expect(heroModel(stopOf(features(), '301'))).toBeNull();
  });
});

describe('roadblocks (AC-7)', () => {
  it('lists every blocked task with its stop, in road order', () => {
    const f = features();
    f['202'] = feature('202', { progress: progress({ blocked: [{ id: 'T005', text: 'Five.', reason: 'Hardware.' }] }) });
    f['001'] = feature('001', { status: 'implemented', progress: progress({ blocked: [{ id: 'T030', text: 'Mac.', reason: null }] }) });
    const blocks = roadblocks(buildRoad(roadmap(), f).stops);
    expect(blocks.map((b) => [b.stop.id, b.task.id, b.task.reason])).toEqual([
      ['001', 'T030', null],
      ['202', 'T005', 'Hardware.'],
    ]);
  });

  it('is empty when nothing is blocked', () => {
    expect(roadblocks(buildRoad(roadmap(), features()).stops)).toEqual([]);
  });
});
