import { describe, expect, it } from 'vitest';
import type { Feature, Task } from '../types';
import { COLUMNS, columns, moveTask } from './board';

const task = (over: Partial<Task>): Task => ({ text: 'x', section: 'Core', status: 'todo', covers: [], files: [], ...over });
const feature = (): Feature => ({
  schema: 2,
  id: '102',
  title: 'Beta',
  status: 'in-progress',
  dates: { created: '2026-01-01' },
  spec: {
    summary: '',
    stories: { order: [], byId: {} },
    criteria: { order: ['AC-1', 'AC-2'], byId: { 'AC-1': { text: 'a', done: false }, 'AC-2': { text: 'b', done: false } } },
    questions: { order: [], byId: {} },
    changelog: [],
    sections: [],
  },
  plan: null,
  tasks: {
    intro: '',
    sections: [{ title: 'Core' }, { title: 'Verify' }],
    items: {
      order: ['T001', 'T002', 'T003', 'T004'],
      byId: {
        T001: task({ text: 'Tests for slip', status: 'done', covers: ['AC-1'], doneOn: '2026-01-02' }),
        T002: task({ text: 'Slip', status: 'in-progress', covers: ['AC-1'] }),
        T003: task({ text: 'Docs', section: 'Verify', status: 'blocked', blockedReason: 'waits', covers: ['AC-2'] }),
        T004: task({ text: 'Release', section: 'Verify' }),
      },
    },
  },
});

describe('board', () => {
  it('has the four columns in lifecycle order', () => {
    expect(COLUMNS.map((c) => c.id)).toEqual(['todo', 'in-progress', 'blocked', 'done']);
  });

  it('groups tasks into columns in task order', () => {
    const c = columns(feature());
    expect(c.todo.map((t) => t.id)).toEqual(['T004']);
    expect(c['in-progress'].map((t) => t.id)).toEqual(['T002']);
    expect(c.blocked.map((t) => t.id)).toEqual(['T003']);
    expect(c.done.map((t) => t.id)).toEqual(['T001']);
  });

  it('filters by section, criterion and text', () => {
    const ids = (f: Parameters<typeof columns>[1]) =>
      Object.values(columns(feature(), f))
        .flat()
        .map((t) => t.id)
        .sort();
    expect(ids({ section: 'Verify' })).toEqual(['T003', 'T004']);
    expect(ids({ criterion: 'AC-1' })).toEqual(['T001', 'T002']);
    expect(ids({ q: 'slip' })).toEqual(['T001', 'T002']);
    expect(ids({ q: 't003' })).toEqual(['T003']);
    expect(columns({ ...feature(), tasks: null }).todo).toEqual([]);
  });

  it('moveTask returns a new feature, like the server would make it', () => {
    const before = feature();
    const after = moveTask(before, 'T004', 'blocked', { reason: 'waits for 101', today: '2026-02-03' });
    expect(before.tasks!.items.byId.T004.status).toBe('todo'); // unchanged
    expect(after.tasks!.items.byId.T004).toMatchObject({ status: 'blocked', blockedReason: 'waits for 101' });
    const done = moveTask(after, 'T004', 'done', { today: '2026-02-03' });
    expect(done.tasks!.items.byId.T004).toMatchObject({ status: 'done', blockedReason: null, doneOn: '2026-02-03' });
    const back = moveTask(done, 'T004', 'todo', { today: '2026-02-03' });
    expect(back.tasks!.items.byId.T004).toMatchObject({ status: 'todo', doneOn: null });
  });
});
