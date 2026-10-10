import { describe, expect, it } from 'vitest';
import { API_SCHEMA, type FeatureStatus, type FeatureSummary, type ProjectData, type TaskStatus } from '../types';
import { diffProjects } from './changes';

function feature(id: string, status: FeatureStatus, statuses: Record<string, TaskStatus>): FeatureSummary {
  return {
    id,
    folder: `${id}-x`,
    status,
    progress: {
      criteria: { done: 0, total: 1 },
      tasks: { done: 0, total: 0, byStatus: { todo: 0, 'in-progress': 0, blocked: 0, done: 0 } },
      openQuestions: 0,
      next: null,
      sections: [],
      running: [],
      blocked: [],
      finished: [],
      statuses,
    },
  };
}
const project = (features: FeatureSummary[], schema = API_SCHEMA): ProjectData => ({
  schema,
  version: 'v',
  roadmap: null,
  features: Object.fromEntries(features.map((f) => [f.id, f])),
  now: { state: null, progress: null },
  problems: [],
});
const before = () => project([feature('204', 'in-progress', { T029: 'done', T030: 'in-progress', T031: 'todo' }), feature('405', 'approved', {})]);

describe('diffProjects (AC-10)', () => {
  it('nothing on the first load', () => {
    expect(diffProjects(null, before())).toEqual({ changes: [], announce: '' });
  });

  it('nothing when nothing changed', () => {
    expect(diffProjects(before(), before())).toEqual({ changes: [], announce: '' });
  });

  it('a task done', () => {
    const next = project([feature('204', 'in-progress', { T029: 'done', T030: 'done', T031: 'todo' }), feature('405', 'approved', {})]);
    expect(diffProjects(before(), next)).toEqual({
      changes: [{ feature: '204', task: 'T030', from: 'in-progress', to: 'done' }],
      announce: '204 T030 done',
    });
  });

  it('a task started and a task blocked', () => {
    const next = project([feature('204', 'in-progress', { T029: 'done', T030: 'blocked', T031: 'in-progress' }), feature('405', 'approved', {})]);
    expect(diffProjects(before(), next).announce).toBe('204 T030 blocked; 204 T031 started');
  });

  it('a task moved back to do', () => {
    const next = project([feature('204', 'in-progress', { T029: 'todo', T030: 'in-progress', T031: 'todo' }), feature('405', 'approved', {})]);
    expect(diffProjects(before(), next).announce).toBe('204 T029 back to do');
  });

  it('a feature that changed status', () => {
    const next = project([feature('204', 'in-progress', { T029: 'done', T030: 'in-progress', T031: 'todo' }), feature('405', 'in-progress', {})]);
    expect(diffProjects(before(), next)).toEqual({
      changes: [{ feature: '405', from: 'approved', to: 'in-progress' }],
      announce: '405 in progress',
    });
  });

  it('several at once: one announcement, joined', () => {
    const next = project([feature('204', 'implemented', { T029: 'done', T030: 'done', T031: 'done' }), feature('405', 'approved', {})]);
    const d = diffProjects(before(), next);
    expect(d.changes).toHaveLength(3);
    expect(d.announce).toBe('204 implemented; 204 T030 done; 204 T031 done');
  });

  it('ignores a new or vanished feature and new tasks', () => {
    const next = project([feature('204', 'in-progress', { T029: 'done', T030: 'in-progress', T031: 'todo', T032: 'todo' }), feature('406', 'draft', {})]);
    expect(diffProjects(before(), next).changes).toEqual([]);
  });

  it('ignores everything when the schema is stale', () => {
    const next = project([feature('204', 'in-progress', { T029: 'done', T030: 'done', T031: 'todo' })], API_SCHEMA + 1);
    expect(diffProjects(before(), next).changes).toEqual([]);
    expect(diffProjects(project([], API_SCHEMA - 1), before()).changes).toEqual([]);
  });

  it('copes with features that have no progress', () => {
    const odd = { id: '204', folder: '204-x', error: 'feature.json can’t be read' } as FeatureSummary;
    expect(diffProjects(project([odd]), before()).changes).toEqual([]);
    expect(diffProjects(before(), project([odd])).changes).toEqual([]);
  });
});
