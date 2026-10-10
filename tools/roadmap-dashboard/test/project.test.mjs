import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_SCHEMA, createProject } from '../lib/project.mjs';
import { editJson, syncedMini } from './helpers.mjs';

describe('createProject', () => {
  it('gives the roadmap, a summary per feature, the Now panel and no problems', () => {
    const data = createProject(syncedMini()).project();
    expect(data.schema).toBe(API_SCHEMA);
    expect(data.problems).toEqual([]);
    expect(data.roadmap.phases.order).toEqual(['phase-1', 'other']);
    expect(data.features['102']).toMatchObject({
      id: '102',
      folder: '102-beta',
      status: 'in-progress',
      branch: 'feat/102-beta',
      progress: {
        criteria: { done: 0, total: 2 },
        tasks: { done: 1, total: 4, byStatus: { todo: 1, 'in-progress': 1, blocked: 1, done: 1 } },
        openQuestions: 1,
        next: { id: 'T002', text: 'Beta.', status: 'in-progress' },
      },
    });
    expect(data.now.state.title).toBe('Current State (2026-01-03)');
  });

  it('gives each feature what the road needs: sections, running, blocked and finished tasks, statuses (405)', () => {
    const data = createProject(syncedMini()).project();
    expect(data.schema).toBe(3);
    expect(data.features['102'].progress).toMatchObject({
      sections: [
        { title: 'Core', done: 1, total: 2 },
        { title: 'Verify', done: 0, total: 2 },
      ],
      running: [{ id: 'T002', text: 'Beta.', section: 'Core', startedOn: '2026-01-03' }],
      blocked: [{ id: 'T003', text: 'Docs, checked by hand.', reason: 'Waits for the maintainer.' }],
      finished: [{ id: 'T001', text: 'Tests for beta.', doneOn: '2026-01-03' }],
      statuses: { T001: 'done', T002: 'in-progress', T003: 'blocked', T004: 'todo' },
    });
  });

  it('leaves done tasks without a date out of finished', () => {
    const dir = syncedMini();
    editJson(join(dir, 'specs/features/102-beta/feature.json'), (f) => {
      f.tasks.items.byId.T004.status = 'done';
      f.tasks.items.byId.T004.doneOn = null;
    });
    const p = createProject(dir).project().features['102'].progress;
    expect(p.finished.map((t) => t.id)).toEqual(['T001']);
    expect(p.statuses.T004).toBe('done');
    expect(p.sections[1]).toEqual({ title: 'Verify', done: 1, total: 2 });
  });

  it('gives a feature with its coverage and generated documents', () => {
    const f = createProject(syncedMini()).feature('102');
    expect(f.feature.tasks.items.order).toEqual(['T001', 'T002', 'T003', 'T004']);
    expect(f.coverage).toEqual({ 'AC-1': ['T001', 'T002'], 'AC-2': ['T003'] });
    expect(f.docs.plan).toMatch(/^<!-- Generated[^\n]*\n\n# 102 — Beta \| the slip one · Implementation Plan/);
    expect(createProject(syncedMini()).feature('101').docs.plan).toBeNull();
    expect(createProject(syncedMini()).feature('199')).toBeNull();
  });

  it('changes its version when a file changes, and shows the new data', () => {
    const dir = syncedMini();
    const p = createProject(dir);
    const v1 = p.version();
    expect(p.version()).toBe(v1);
    editJson(join(dir, 'specs/features/102-beta/feature.json'), (f) => (f.tasks.items.byId.T004.status = 'done'));
    expect(p.version()).not.toBe(v1);
    expect(p.project().features['102'].progress.tasks.done).toBe(2);
  });

  it('shows bad data as problems and keeps the rest', () => {
    const dir = syncedMini();
    writeFileSync(join(dir, 'specs/features/102-beta/feature.json'), '{ nope');
    const p = createProject(dir);
    const data = p.project();
    expect(data.problems.some((x) => x.startsWith('specs/features/102-beta/feature.json: invalid JSON'))).toBe(true);
    expect(data.features['102']).toMatchObject({ id: '102', error: 'feature.json can’t be read' });
    expect(data.features['101'].status).toBe('implemented');
    rmSync(join(dir, 'specs/roadmap.json'));
    expect(p.project()).toMatchObject({ roadmap: null, problems: expect.arrayContaining(['specs/roadmap.json: missing']) });
  });
});
