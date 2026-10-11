import { describe, expect, it } from 'vitest';
import type { Feature } from '../types';
import { taskBrief } from './taskBrief';

function feature(over: Partial<Feature> = {}): Feature {
  return {
    schema: 2,
    id: '406',
    title: 'Roadmap improvements',
    status: 'in-progress',
    dates: { created: '2026-10-11' },
    spec: {
      summary: 'Make roadmap work easier to start.',
      stories: { order: [], byId: {} },
      criteria: {
        order: ['AC-1', 'AC-2'],
        byId: {
          'AC-1': { text: 'Show the next task.', done: false },
          'AC-2': { text: 'Copy a task brief.', done: false },
        },
      },
      questions: { order: [], byId: {} },
      changelog: [],
      sections: [],
    },
    plan: {
      header: 'Approved plan: use existing feature data.',
      sections: [{ kind: 'markdown', title: 'Approach', markdown: 'Keep the brief local and concise.' }],
    },
    tasks: {
      intro: '',
      sections: [{ title: 'Dashboard' }],
      items: {
        order: ['T001'],
        byId: {
          T001: {
            text: 'Add the copy action.',
            section: 'Dashboard',
            status: 'todo',
            covers: ['AC-2'],
            files: ['tools/roadmap-dashboard/app/src/components/Board.tsx'],
            test: 'npm run test:roadmap',
          },
        },
      },
    },
    ...over,
  };
}

describe('taskBrief', () => {
  it('includes the feature, full task, covered criteria, files, test and relevant context', () => {
    const result = taskBrief(feature(), 'T001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('Feature: 406 — Roadmap improvements');
    expect(result.text).toContain('Feature context: Make roadmap work easier to start.');
    expect(result.text).toContain('Task: T001 (Dashboard)');
    expect(result.text).toContain('Add the copy action.');
    expect(result.text).toContain('AC-2: Copy a task brief.');
    expect(result.text).toContain('tools/roadmap-dashboard/app/src/components/Board.tsx');
    expect(result.text).toContain('npm run test:roadmap');
    expect(result.text).toContain('Approved plan: use existing feature data.');
    expect(result.text.length).toBeLessThanOrEqual(2000);
  });

  it('omits absent optional files, tests, criteria and plan context', () => {
    const f = feature({
      plan: null,
      tasks: {
        intro: '',
        sections: [],
        items: {
          order: ['T002'],
          byId: { T002: { text: 'Do the small task.', section: 'Small', status: 'todo' } },
        },
      },
      spec: {
        ...feature().spec,
        criteria: { order: [], byId: {} },
      },
    });

    const result = taskBrief(f, 'T002');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('Do the small task.');
    expect(result.text).not.toContain('Files:');
    expect(result.text).not.toContain('Proving test:');
    expect(result.text).not.toContain('Acceptance criteria:');
    expect(result.text).not.toContain('Plan context:');
  });

  it('returns an explicit failure for an unknown task', () => {
    expect(taskBrief(feature(), 'T999')).toEqual({ ok: false, reason: 'task-not-found' });
  });

  it('omits optional context rather than exceeding the brief budget', () => {
    const f = feature();
    f.spec.summary = 'Context '.repeat(100);
    f.plan!.header = 'Plan '.repeat(100);

    const result = taskBrief(f, 'T001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.length).toBeLessThanOrEqual(2000);
    expect(result.text).toContain('Add the copy action.');
    expect(result.text).toContain('npm run test:roadmap');
  });

  it('does not truncate required task instructions or test when they exceed the budget', () => {
    const long = 'x'.repeat(2001);
    const f = feature();
    f.tasks!.items.byId.T001.text = long;

    expect(taskBrief(f, 'T001')).toEqual({ ok: false, reason: 'required-content-too-long' });

    f.tasks!.items.byId.T001.text = 'Short instruction.';
    f.tasks!.items.byId.T001.test = long;
    expect(taskBrief(f, 'T001')).toEqual({ ok: false, reason: 'required-content-too-long' });
  });
});
