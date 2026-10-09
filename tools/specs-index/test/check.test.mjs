import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRepo } from '../lib/check.mjs';
import { syncRepo } from '../lib/sync.mjs';
import { editJson, editText, tempMini } from './helpers.mjs';

/** A synced temp copy of the mini fixture: passes the check until a test breaks it. */
function repo() {
  const dir = tempMini();
  syncRepo(dir);
  return dir;
}
const roadmap = (dir) => join(dir, 'specs/roadmap.json');
const beta = (dir, file) => join(dir, 'specs/features/102-beta', file);

describe('checkRepo', () => {
  it('passes on the synced mini fixture', () => {
    expect(checkRepo(repo()).problems).toEqual([]);
  });

  const cases = [
    [
      'a schema error',
      (d) => editJson(beta(d, 'feature.json'), (f) => (f.status = 'nearly')),
      'specs/features/102-beta/feature.json: /status: must be one of draft, approved, in-progress, implemented, superseded',
    ],
    ['invalid JSON', (d) => writeFileSync(roadmap(d), '{ nope'), 'specs/roadmap.json: invalid JSON'],
    [
      'a folder without feature.json',
      (d) => mkdirSync(join(d, 'specs/features/104-delta')),
      'specs/features/104-delta/feature.json: missing',
    ],
    [
      'an id that differs from the folder',
      (d) => editJson(beta(d, 'feature.json'), (f) => (f.id = '105')),
      'specs/features/102-beta/feature.json: id 105 does not match the folder (102)',
    ],
    [
      'a roadmap item pointing at a missing folder',
      (d) => renameSync(join(d, 'specs/features/101-alpha'), join(d, 'specs/features/101-alpha-x')),
      'specs/roadmap.json: item 101 points to features/101-alpha, which does not exist',
    ],
    [
      'a feature folder not on the roadmap',
      (d) => editJson(roadmap(d), (r) => (r.items.byId['102'].folder = null)),
      'specs/features/102-beta: not linked from any roadmap item (set its folder in roadmap.json)',
    ],
    [
      'an unknown dependency',
      (d) => editJson(roadmap(d), (r) => (r.items.byId['103'].needs = ['199'])),
      'specs/roadmap.json: item 103 needs 199, which is not on the roadmap',
    ],
    [
      'an item in no phase',
      (d) => editJson(roadmap(d), (r) => (r.phases.byId['phase-1'].items = ['101', '102'])),
      'specs/roadmap.json: item 103 is in no phase',
    ],
    [
      'a current phase that does not exist',
      (d) => editJson(roadmap(d), (r) => (r.currentPhase = 'phase-9')),
      'specs/roadmap.json: currentPhase phase-9 is not a phase',
    ],
    [
      'an unknown roadmap status',
      (d) => editJson(roadmap(d), (r) => (r.items.byId['103'].status = 'maybe')),
      'specs/roadmap.json: item 103 has status maybe, which is not in statuses',
    ],
    [
      'an order that misses an entry',
      (d) => editJson(beta(d, 'feature.json'), (f) => f.tasks.items.order.pop()),
      'specs/features/102-beta/feature.json: tasks T004 is in byId but not in order',
    ],
    [
      'an unknown covered criterion',
      (d) => editJson(beta(d, 'feature.json'), (f) => (f.tasks.items.byId.T002.covers = ['AC-9'])),
      'specs/features/102-beta/feature.json: T002 covers AC-9, which is not a criterion',
    ],
    [
      'a task in an unknown section',
      (d) => editJson(beta(d, 'feature.json'), (f) => (f.tasks.items.byId.T002.section = 'Nope')),
      'specs/features/102-beta/feature.json: T002 is in section Nope, which is not in tasks.sections',
    ],
    [
      'a blocked task without a reason',
      (d) => editJson(beta(d, 'feature.json'), (f) => (f.tasks.items.byId.T003.blockedReason = null)),
      'specs/features/102-beta/feature.json: T003 is blocked without a blockedReason',
    ],
    [
      'a roadmap status that does not fit the feature',
      (d) => editJson(roadmap(d), (r) => (r.items.byId['102'].status = 'done')),
      'specs/roadmap.json: item 102 is done (✔️) but its feature is in-progress',
    ],
    [
      'a generated file edited by hand',
      (d) => editText(beta(d, 'tasks.md'), (t) => t.replace('- [ ] **T002**', '- [x] **T002**')),
      'specs/features/102-beta/tasks.md: not what feature.json gives (edited by hand?): run npm run specs:sync',
    ],
    [
      'a generated file that is missing',
      (d) => rmSync(beta(d, 'plan.md')),
      'specs/features/102-beta/plan.md: missing: run npm run specs:sync',
    ],
    [
      'a generated file whose part of the JSON is gone',
      (d) => editJson(beta(d, 'feature.json'), (f) => (f.plan = null)),
      'specs/features/102-beta/plan.md: feature.json has no plan, so this file should not exist: run npm run specs:sync',
    ],
    [
      'a hand edit to roadmap.md',
      (d) => editText(join(d, 'specs/roadmap.md'), (t) => t.replace('Gamma', 'Gamma!')),
      'specs/roadmap.md: not what roadmap.json gives (edited by hand?): run npm run specs:sync',
    ],
  ];

  it.each(cases)('finds %s', (_name, breakIt, expected) => {
    const dir = repo();
    breakIt(dir);
    const problems = checkRepo(dir).problems;
    expect(problems.some((p) => p.startsWith(expected)), `${expected}\n\nin:\n${problems.join('\n')}`).toBe(true);
  });
});
