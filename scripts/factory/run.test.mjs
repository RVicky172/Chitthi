// The orchestrator's pure parts (402 §5): the loop's state machine, the agent's end marker, the commit message and
// the test-first pairs. Every stop kind of AC-12 comes from `decide`; the runner (T052) only carries them out.
import { describe, expect, it } from 'vitest';
import { nextFor, parseTasks, stationOf } from './state.mjs';
import { commitMessage, decide, parseAgentOutput, taskBatch } from './run.mjs';

/** A feature as readFeatures makes it, from an inline tasks.md. */
function feature(id, tasksText, { status = 'Approved', roadmap = '🚧', needs = [] } = {}) {
  const tasks = parseTasks(tasksText);
  const f = { id, folder: `${id}-x`, title: `Feature ${id}`, status, roadmap, needs, hasPlan: true, hasTasks: tasks.length > 0, tasks };
  return { ...f, station: stationOf(f) };
}
const next = (id, tasksText, opts, others = []) => nextFor(id, [feature(id, tasksText, opts), ...others]);

const TASKS = ['- [x] **T010** — Done already. · files: a.mjs', '- [ ] **T011** — Next one. · files: b.mjs', '- [ ] **T090** — Verify.'].join('\n');
const S = { attempt: 1, maxAttempts: 3, budgetLeft: 8, minBudget: 0.5, once: false };
const GOOD = { ticked: true, resultNote: true, depsChanged: false, specChanged: false, maxTurns: false };
const impl = (output, checks = {}) => ({ type: 'implemented', output, checks: { ...GOOD, ...checks } });

describe('decide: start', () => {
  it('implements the next agent task', () => {
    const d = decide(S, { type: 'start', next: next('402', TASKS) });
    expect(d).toMatchObject({ action: 'implement', attempt: 1 });
  });

  it('stops when the feature needs work items that are not done (not ready), naming them', () => {
    const d = decide(S, { type: 'start', next: next('203', TASKS, { needs: ['201', '202'] }, [feature('201', '- [x] **T010** — x', { status: 'Implemented' })]) });
    expect(d).toMatchObject({ action: 'stop', kind: 'not-ready' });
    expect(d.reason).toMatch(/202/);
    expect(d.reason).not.toMatch(/201/);
  });

  it('stops on a paused feature', () => {
    expect(decide(S, { type: 'start', next: next('001', TASKS, { roadmap: '⏸️ Paused' }) })).toMatchObject({ action: 'stop', kind: 'paused' });
  });

  it('stops at Verify: it waits for sign-off', () => {
    const d = decide(S, { type: 'start', next: next('402', '- [x] **T010** — a\n- [ ] **T090** — Verify all.') });
    expect(d).toMatchObject({ action: 'stop', kind: 'verify' });
    expect(d.reason).toMatch(/sign-off/);
  });

  it('stops on a feature that is done', () => {
    expect(decide(S, { type: 'start', next: next('401', '- [x] **T010** — a', { status: 'Implemented' }) })).toMatchObject({ action: 'stop', kind: 'done' });
  });

  it('stops waiting on you when only 👤 tasks are left, listing them', () => {
    const d = decide(S, { type: 'start', next: next('402', '- [x] **T010** — a\n- [ ] **T054** 👤 — First real run.\n- [ ] **T060** — After it. · deps: T054') });
    expect(d).toMatchObject({ action: 'stop', kind: 'waiting-on-you' });
    expect(d.reason).toMatch(/T054/);
  });

  it('stops waiting on you when the only open task has stopped (Status note)', () => {
    const text = '- [ ] **T001** — Spike.\n  - **Status (2026-10-07):** waits on 2 manual checks.\n- [ ] **T002** — Uses it. · deps: T001';
    const d = decide(S, { type: 'start', next: next('202', text) });
    expect(d).toMatchObject({ action: 'stop', kind: 'waiting-on-you' });
    expect(d.reason).toMatch(/T001/);
  });

  it('stops with nothing to do when there is no next and nothing waiting', () => {
    const n = { feature: '402', station: 'Implement', paused: false, ready: true, needsOpen: [], next: null, human: [], stopped: [], blocked: [] };
    expect(decide(S, { type: 'start', next: n })).toMatchObject({ action: 'stop', kind: 'nothing-to-do' });
  });

  it('stops with nothing to do on an unknown feature', () => {
    expect(decide(S, { type: 'start', next: null })).toMatchObject({ action: 'stop', kind: 'nothing-to-do' });
  });
});

describe('decide: after the implementer', () => {
  it('goes on to the gates when the task is ticked with a Result note and the agent said done', () => {
    expect(decide(S, impl('work…\nFACTORY: done'))).toMatchObject({ action: 'gates', attempt: 1 });
  });

  it.each([
    ['spec-change', 'FACTORY-STOP: spec-change: the plan says X, the code needs Y'],
    ['dependency', 'FACTORY-STOP: dependency: needs a zip library'],
    ['question', 'FACTORY-STOP: question: which default?'],
  ])('stops on the agent’s FACTORY-STOP %s, with its reason', (kind, output) => {
    const d = decide(S, impl(output, { ticked: false, resultNote: false }));
    expect(d).toMatchObject({ action: 'stop', kind });
    expect(d.reason).toBe(output.split(': ').slice(2).join(': '));
  });

  it('stops on a new dependency in package.json even when the agent said done', () => {
    expect(decide(S, impl('FACTORY: done', { depsChanged: true }))).toMatchObject({ action: 'stop', kind: 'dependency' });
  });

  it('stops on a spec or plan change even when the agent said done', () => {
    expect(decide(S, impl('FACTORY: done', { specChanged: true }))).toMatchObject({ action: 'stop', kind: 'spec-change' });
  });

  it.each([
    ['no marker', impl('I think it works.'), /FACTORY: done/],
    ['not ticked', impl('FACTORY: done', { ticked: false }), /tick/i],
    ['no Result note', impl('FACTORY: done', { resultNote: false }), /Result/],
  ])('retries with feedback on %s', (_name, event, why) => {
    const d = decide(S, event);
    expect(d).toMatchObject({ action: 'retry', attempt: 2 });
    expect(d.feedback).toMatch(why);
  });

  it('stops on the turn cap (AC-12, Q3), whatever else the run did', () => {
    for (const event of [impl('', { maxTurns: true }), impl('FACTORY: done', { maxTurns: true }), impl('x', { maxTurns: true, ticked: false, resultNote: false })]) {
      const d = decide(S, event);
      expect(d).toMatchObject({ action: 'stop', kind: 'turns' });
      expect(d.reason).toMatch(/turn cap/);
      expect(d.reason).toMatch(/stash/);
    }
  });

  it('names everything missing in one feedback', () => {
    const d = decide(S, impl('FACTORY: done', { ticked: false, resultNote: false }));
    expect(d.feedback).toMatch(/tick/i);
    expect(d.feedback).toMatch(/Result/);
  });
});

describe('decide: gates, review, commit', () => {
  const green = { ok: true, gates: [{ name: 'check', ok: true, summary: '1106 passed' }] };
  const red = {
    ok: false,
    gates: [
      { name: 'check', ok: false, summary: 'run.test.mjs: 2 failed' },
      { name: 'selftest', ok: true, summary: '6100 checks' },
      { name: 'e2e:editors', ok: false, summary: '1 failed: snapping' },
    ],
  };

  it('reviews after green gates', () => {
    expect(decide(S, { type: 'gates', run: green })).toMatchObject({ action: 'review' });
  });

  it('retries after red gates, with the red gates’ summaries only', () => {
    const d = decide(S, { type: 'gates', run: red });
    expect(d).toMatchObject({ action: 'retry', attempt: 2 });
    expect(d.feedback).toMatch(/check.*2 failed/);
    expect(d.feedback).toMatch(/e2e:editors.*snapping/);
    expect(d.feedback).not.toMatch(/6100/);
  });

  it('commits after a passing review', () => {
    expect(decide(S, { type: 'reviewed', verdict: { ok: true, reasons: [] } })).toMatchObject({ action: 'commit' });
  });

  it('retries after a failing review, with its reasons', () => {
    const verdict = { ok: false, reasons: [{ rule: 'test-first', file: 'src/engine/x.ts', line: 12, why: 'no test for the new branch' }, { rule: 'scope', why: 'touches a file the task does not name' }] };
    const d = decide({ ...S, attempt: 2 }, { type: 'reviewed', verdict });
    expect(d).toMatchObject({ action: 'retry', attempt: 3 });
    expect(d.feedback).toMatch(/test-first.*src\/engine\/x\.ts:12.*no test for the new branch/);
    expect(d.feedback).toMatch(/scope.*touches a file/);
  });

  it('goes to the next task after a commit', () => {
    expect(decide({ ...S, attempt: 2 }, { type: 'committed' })).toMatchObject({ action: 'next', attempt: 1 });
  });

  it('stops after one task with once', () => {
    expect(decide({ ...S, once: true }, { type: 'committed' })).toMatchObject({ action: 'stop', kind: 'once' });
  });
});

describe('decide: limits', () => {
  it('stops on the third failure of one task (2 retries), not before', () => {
    const fail = { type: 'gates', run: { ok: false, gates: [{ name: 'check', ok: false, summary: 'red' }] } };
    expect(decide({ ...S, attempt: 1 }, fail).action).toBe('retry');
    expect(decide({ ...S, attempt: 2 }, fail).action).toBe('retry');
    const d = decide({ ...S, attempt: 3 }, fail);
    expect(d).toMatchObject({ action: 'stop', kind: 'retries', attempt: 3 });
    expect(d.feedback).toMatch(/red/);
  });

  it('counts every kind of failure towards the limit', () => {
    expect(decide({ ...S, attempt: 3 }, impl('nothing'))).toMatchObject({ action: 'stop', kind: 'retries' });
    expect(decide({ ...S, attempt: 3 }, { type: 'reviewed', verdict: { ok: false, reasons: [{ rule: 'r', why: 'w' }] } })).toMatchObject({ action: 'stop', kind: 'retries' });
  });

  it('defaults to 3 attempts', () => {
    const noMax = { ...S, maxAttempts: undefined };
    expect(decide({ ...noMax, attempt: 3 }, impl('nothing'))).toMatchObject({ action: 'stop', kind: 'retries' });
  });

  it('stops when the budget left is under the minimum, before acting on any event', () => {
    const poor = { ...S, budgetLeft: 0.3 };
    for (const event of [{ type: 'start', next: next('402', TASKS) }, impl('FACTORY: done'), { type: 'gates', run: { ok: true, gates: [] } }, { type: 'reviewed', verdict: { ok: true, reasons: [] } }, { type: 'committed' }])
      expect(decide(poor, event)).toMatchObject({ action: 'stop', kind: 'budget' });
    expect(decide({ ...S, budgetLeft: 0.5 }, impl('FACTORY: done')).action).toBe('gates');
  });

  it('a stop from the agent wins over the budget check only when budget is fine', () => {
    expect(decide({ ...S, budgetLeft: 0.1 }, impl('FACTORY-STOP: question: x')).kind).toBe('budget');
  });

  it('has no budget check without a budget', () => {
    const noBudget = { ...S, budgetLeft: undefined };
    expect(decide(noBudget, impl('FACTORY: done')).action).toBe('gates');
  });

  it('refuses an unknown event', () => {
    expect(() => decide(S, { type: 'nope' })).toThrow(/nope/);
  });
});

describe('parseAgentOutput', () => {
  it('reads FACTORY: done', () => {
    expect(parseAgentOutput('All green.\nFACTORY: done')).toEqual({ done: true });
  });

  it('reads FACTORY-STOP with its kind and why', () => {
    expect(parseAgentOutput('Needs a zip library.\nFACTORY-STOP: dependency: fflate for the export')).toEqual({ done: false, stop: { kind: 'dependency', why: 'fflate for the export' } });
  });

  it('keeps colons in the why', () => {
    expect(parseAgentOutput('FACTORY-STOP: spec-change: AC-3 says: 10 s')).toEqual({ done: false, stop: { kind: 'spec-change', why: 'AC-3 says: 10 s' } });
  });

  it('ignores noise around the marker, CRLF and trailing spaces', () => {
    expect(parseAgentOutput('text\r\n\r\n  FACTORY: done  \r\n\r\n')).toEqual({ done: true });
    expect(parseAgentOutput('x\r\nFACTORY-STOP: question: which one?\r\n')).toEqual({ done: false, stop: { kind: 'question', why: 'which one?' } });
  });

  it('takes the last marker line: a marker quoted earlier does not win', () => {
    const text = 'I must finish with `FACTORY: done` or\nFACTORY-STOP: dependency: example\nas the task says.\n…work…\nFACTORY: done';
    expect(parseAgentOutput(text)).toEqual({ done: true });
    expect(parseAgentOutput('FACTORY: done\nthen I found a problem\nFACTORY-STOP: question: is X right?')).toEqual({ done: false, stop: { kind: 'question', why: 'is X right?' } });
  });

  it('does not take a marker inside a sentence', () => {
    expect(parseAgentOutput('I will print FACTORY: done when finished.')).toEqual({ done: false });
  });

  it('accepts the marker in backticks or bold', () => {
    expect(parseAgentOutput('`FACTORY: done`')).toEqual({ done: true });
    expect(parseAgentOutput('**FACTORY-STOP: dependency: a font**')).toEqual({ done: false, stop: { kind: 'dependency', why: 'a font' } });
  });

  it('treats an unknown kind as a question, keeping all of it', () => {
    expect(parseAgentOutput('FACTORY-STOP: blocked: the server is down')).toEqual({ done: false, stop: { kind: 'question', why: 'blocked: the server is down' } });
    expect(parseAgentOutput('FACTORY-STOP: no kind at all')).toEqual({ done: false, stop: { kind: 'question', why: 'no kind at all' } });
  });

  it('finds nothing in text without a marker', () => {
    expect(parseAgentOutput('')).toEqual({ done: false });
    expect(parseAgentOutput(undefined)).toEqual({ done: false });
    expect(parseAgentOutput('FACTORY done\nFACTORY:done!')).toEqual({ done: false });
  });
});

describe('commitMessage', () => {
  const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
  const task = (id, text) => ({ id, text });

  it('builds feat(NNN): summary (P2.x) for a 2xx with a work item', () => {
    const msg = commitMessage('202', task('T030', 'Edit tools in the timeline. · files: `src/components/studio/Timeline.tsx` · test: e2e'), 'Edit operations: ripple, roll, slip, slide, magnetic main track, snapping (P2.2)');
    const [subject, blank] = msg.split('\n');
    expect(subject).toBe('feat(202): edit tools in the timeline (P2.2)');
    expect(blank).toBe('');
    expect(msg).toMatch(/T030/);
    expect(msg.trimEnd().endsWith(TRAILER)).toBe(true);
  });

  it('has no suffix for a 4xx', () => {
    const msg = commitMessage({ id: '402' }, task('T053', 'Notifications and the dashboard’s **Loop** panel: `notify.mjs`'), 'Software factory: agents run the spec-driven line, people decide (F1–F7 of [software-factory.md](software-factory.md))');
    expect(msg.split('\n')[0]).toBe('feat(402): notifications and the dashboard’s Loop panel: notify.mjs');
  });

  it('removes backticks and (loop) marks, keeps acronyms', () => {
    expect(commitMessage('402', task('T061', '**(loop)** `run.mjs --worktree` for parallel lines'), '').split('\n')[0]).toBe('feat(402): run.mjs --worktree for parallel lines');
    expect(commitMessage('402', task('T070', 'MCP smoke in the release station'), '').split('\n')[0]).toBe('feat(402): MCP smoke in the release station');
  });

  it('trims a long task text to 60 characters at a word boundary', () => {
    const text = 'The runner around them: start checks on the branch and a clean tree, implementer and reviewer calls, turn counts';
    const subject = commitMessage('402', task('T052', text), '').split('\n')[0];
    const summary = subject.replace('feat(402): ', '');
    expect(summary.length).toBeLessThanOrEqual(60);
    expect(text.toLowerCase().startsWith(summary.toLowerCase())).toBe(true);
    expect(text[summary.length]).toMatch(/[\s,]/);
    expect(summary).not.toMatch(/[\s,:;]$/);
  });

  it('stops the summary at the end of the first sentence or clause', () => {
    expect(commitMessage('402', task('T052', 'The runner: start checks; calls. More.'), '').split('\n')[0]).toBe('feat(402): the runner: start checks');
    expect(commitMessage('402', task('T052', 'The runner. Then more; calls.'), '').split('\n')[0]).toBe('feat(402): the runner');
  });

  it('uses the implementation task of a test-first pair and names both', () => {
    const pair = [task('T050', 'Failing tests for `decide`.'), task('T051', '`decide`, `parseAgentOutput` (and more) in `scripts/factory/run.mjs` until T050 passes.')];
    const msg = commitMessage('402', pair, '');
    expect(msg.split('\n')[0]).toMatch(/^feat\(402\): decide, parseAgentOutput/);
    expect(msg).toMatch(/T050.*T051/);
  });
});

describe('taskBatch', () => {
  const tasks = parseTasks(
    [
      '- [x] **T010** — Failing tests for the old thing.',
      '- [x] **T011** — The old thing.',
      '- [ ] **T050** — Failing tests for `decide`. · files: run.test.mjs · test: fails',
      '- [ ] **T051** — `decide` until T050 passes. · files: run.mjs',
      '- [ ] **T052** — The runner.',
      '- [ ] **T053** — tests first: the panel.',
      '- [ ] **T054** 👤 — First real run.',
      '- [ ] **T060** — **(loop)** Failing tests then `scripts/factory/lock.mjs`: take, wait, release.',
      '- [ ] **T061** — The worktree.',
      '- [ ] **T070** — Tests first for the release station.',
      '- [x] **T071** — Already done.',
      '- [ ] **T072** — The release station.',
      '- [ ] **T080** — Failing tests for the batch intake.',
      '- [ ] **T081** — The batch intake.',
      '  - **Status (2026-10-08):** stopped: waits on the maintainer.',
    ].join('\n'),
  );
  const ids = (id) => taskBatch(tasks.find((t) => t.id === id), tasks).map((t) => t.id);

  it('pairs a failing-tests task with the next task', () => {
    expect(ids('T050')).toEqual(['T050', 'T051']);
  });

  it('hands over any other task alone', () => {
    expect(ids('T051')).toEqual(['T051']);
    expect(ids('T052')).toEqual(['T052']);
  });

  it('does not pair with a 👤 task', () => {
    expect(ids('T053')).toEqual(['T053']);
  });

  it('does not pair with a stopped task (Status note)', () => {
    expect(tasks.find((t) => t.id === 'T081').note).toMatch(/^Status/);
    expect(ids('T080')).toEqual(['T080']);
  });

  it('does not pair a task that does both (“Failing tests then …”)', () => {
    expect(ids('T060')).toEqual(['T060']);
  });

  it('skips done tasks to find the next unchecked one', () => {
    expect(ids('T070')).toEqual(['T070', 'T072']);
  });
});
