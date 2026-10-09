import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SpecsError, newFeature, setCriterion, setStatus, setTaskStatus } from '../lib/ops.mjs';
import { MINI, readJsonFile } from './helpers.mjs';

const roadmap = () => readJsonFile(join(MINI, 'specs/roadmap.json'));
const beta = () => readJsonFile(join(MINI, 'specs/features/102-beta/feature.json'));
const TODAY = '2026-02-03';
const task = (f, id) => f.tasks.items.byId[id];

describe('setTaskStatus', () => {
  it('start: in progress, with the day it started', () => {
    const f = beta();
    setTaskStatus(f, 'T004', 'in-progress', { today: TODAY });
    expect(task(f, 'T004')).toMatchObject({ status: 'in-progress', startedOn: TODAY, doneOn: null });
  });

  it('done: date, commits (once each) and a result note', () => {
    const f = beta();
    setTaskStatus(f, 'T002', 'done', { commits: ['abc1234', 'abc1234', 'def5678'], result: 'It works.', today: TODAY });
    expect(task(f, 'T002')).toMatchObject({
      status: 'done',
      startedOn: '2026-01-03',
      doneOn: TODAY,
      commits: ['abc1234', 'def5678'],
      notes: ['It works.'],
    });
    setTaskStatus(f, 'T004', 'done', { date: '2026-02-01', today: TODAY });
    expect(task(f, 'T004')).toMatchObject({ doneOn: '2026-02-01', startedOn: '2026-02-01' });
  });

  it('blocked needs a reason; leaving blocked clears it; back to do clears the done date', () => {
    const f = beta();
    expect(() => setTaskStatus(f, 'T004', 'blocked', { today: TODAY })).toThrow(
      new SpecsError('Blocking 102 T004 needs a reason (--reason "<why>")'),
    );
    setTaskStatus(f, 'T004', 'blocked', { reason: 'Waits for 101.', today: TODAY });
    expect(task(f, 'T004')).toMatchObject({ status: 'blocked', blockedReason: 'Waits for 101.' });
    setTaskStatus(f, 'T003', 'todo', { today: TODAY });
    expect(task(f, 'T003')).toMatchObject({ status: 'todo', blockedReason: null });
    setTaskStatus(f, 'T001', 'todo', { today: TODAY });
    expect(task(f, 'T001')).toMatchObject({ status: 'todo', doneOn: null });
  });

  it('refuses unknown tasks, statuses and commits', () => {
    expect(() => setTaskStatus(beta(), 'T009', 'done', { today: TODAY })).toThrow(new SpecsError('102 has no task T009'));
    expect(() => setTaskStatus(beta(), 'T002', 'nearly', { today: TODAY })).toThrow(
      new SpecsError('nearly is not a task status: todo, in-progress, blocked, done'),
    );
    expect(() => setTaskStatus(beta(), 'T002', 'done', { commits: ['zz'], today: TODAY })).toThrow(/zz is not a commit hash/);
    const noTasks = beta();
    noTasks.tasks = null;
    expect(() => setTaskStatus(noTasks, 'T001', 'done', { today: TODAY })).toThrow(new SpecsError('102 has no tasks yet'));
  });
});

describe('setCriterion', () => {
  it('ticks and unticks a criterion', () => {
    const f = beta();
    setCriterion(f, 'AC-2', true);
    expect(f.spec.criteria.byId['AC-2'].done).toBe(true);
    setCriterion(f, 'AC-2', false);
    expect(f.spec.criteria.byId['AC-2'].done).toBe(false);
    expect(() => setCriterion(f, 'AC-9', true)).toThrow(new SpecsError('102 has no criterion AC-9'));
  });
});

describe('setStatus', () => {
  it('sets the feature status and dates, and the roadmap item status', () => {
    const r = roadmap();
    const f = beta();
    setStatus(r, f, 'implemented', { today: TODAY });
    expect(f.status).toBe('implemented');
    expect(f.dates).toEqual({ created: '2026-01-02', approved: '2026-01-02', started: '2026-01-03', done: TODAY });
    expect(r.items.byId['102'].status).toBe('done');
    expect(r.updated).toBe(TODAY);
  });

  it('refuses an unknown status', () => {
    expect(() => setStatus(roadmap(), beta(), 'nearly', { today: TODAY })).toThrow(
      new SpecsError('nearly is not a status: draft, approved, in-progress, implemented, superseded'),
    );
  });
});

describe('newFeature', () => {
  it('makes a draft with a spec skeleton and links its roadmap item', () => {
    const r = roadmap();
    const { folder, feature } = newFeature(r, { id: '103', name: 'gamma', title: 'Gamma', today: TODAY });
    expect(folder).toBe('103-gamma');
    expect(feature).toMatchObject({
      schema: 2,
      id: '103',
      title: 'Gamma',
      status: 'draft',
      dates: { created: TODAY },
      git: { branch: 'feat/103-gamma' },
      plan: null,
      tasks: null,
    });
    expect(feature.spec.phase).toBe('Phase 1 — Basics');
    expect(feature.spec.changelog).toEqual([{ date: TODAY, text: 'Created.' }]);
    expect(feature.spec.sections.map((s) => s.kind)).toEqual(['summary', 'stories', 'criteria', 'markdown', 'markdown', 'questions', 'changelog']);
    expect(r.items.byId['103']).toMatchObject({ folder: 'features/103-gamma', status: 'spec-drafted' });
  });

  it('adds a new item to a phase, in number order', () => {
    const r = roadmap();
    newFeature(r, { id: '100', name: 'zero', title: 'Zero', phase: 'phase-1', today: TODAY });
    expect(r.phases.byId['phase-1'].items).toEqual(['100', '101', '102', '103']);
  });

  it('refuses bad input', () => {
    expect(() => newFeature(roadmap(), { id: '1', name: 'x', title: 'X', today: TODAY })).toThrow(/three digits/);
    expect(() => newFeature(roadmap(), { id: '105', name: 'Bad Name', title: 'X', today: TODAY })).toThrow(/kebab-case/);
    expect(() => newFeature(roadmap(), { id: '102', name: 'b', title: 'B', today: TODAY })).toThrow(
      new SpecsError('102 already has a folder: features/102-beta'),
    );
    expect(() => newFeature(roadmap(), { id: '105', name: 'e', title: 'E', today: TODAY })).toThrow(
      new SpecsError('105 is not on the roadmap: pass --phase <phase-1|other>'),
    );
  });
});
