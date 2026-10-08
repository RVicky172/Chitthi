// Readers for the factory (402 §1): roadmap, features, tasks, specs, memory, and what an agent may do next.
// Expected values are worked out from the frozen copies in fixtures/ (see fixtures/README.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  expandIds,
  nextFor,
  parseDecisions,
  parseMemory,
  parseProgress,
  parseRoadmap,
  parseSpec,
  parseTasks,
  readFeatures,
  readRepo,
  stationOf,
} from './state.mjs';

const FIX = join(import.meta.dirname, 'fixtures');
const fx = (p) => readFileSync(join(FIX, p), 'utf8');
const fixtureFeatures = () => readFeatures(FIX, { roadmapPath: 'roadmap.md', featuresDir: 'features' });

describe('roadmap', () => {
  const rows = parseRoadmap(fx('roadmap.md'));

  it('reads every feature row with its phase and status', () => {
    expect(rows).toHaveLength(25);
    const r202 = rows.find((r) => r.id === '202');
    expect(r202.status).toBe('🚧');
    expect(r202.phase).toMatch(/^Phase 2 — Multi-track timeline/);
    expect(rows.find((r) => r.id === '001').status).toMatch(/^⏸️/);
    expect(rows.find((r) => r.id === '309').phase).toMatch(/^Phase 3/);
    expect(rows.find((r) => r.id === '402').phase).toBe('Other features (400+)');
  });

  it('has no needs when the table has no Needs column', () => {
    expect(rows.every((r) => Array.isArray(r.needs) && r.needs.length === 0)).toBe(true);
  });

  it('reads a Needs column, expanding ranges', () => {
    const text = [
      '## Phase 2',
      '| # | Feature | Spec | Status | Needs |',
      '| --- | --- | --- | --- | --- |',
      '| 203 | Compositing | — | ⬜ | 201, 202 |',
      '| 212 | Agent tools | — | ⬜ | 203–206, 208 |',
      '| 204 | Decoder pool | — | ⬜ | — |',
    ].join('\n');
    const [a, b, c] = parseRoadmap(text);
    expect(a.needs).toEqual(['201', '202']);
    expect(b.needs).toEqual(['203', '204', '205', '206', '208']);
    expect(c.needs).toEqual([]);
  });

  it('expands id lists with en dashes or hyphens', () => {
    expect(expandIds('T020, T022-T024')).toEqual(['T020', 'T022', 'T023', 'T024']);
    expect(expandIds('210–211')).toEqual(['210', '211']);
    expect(expandIds('')).toEqual([]);
  });
});

describe('tasks', () => {
  it('reads ticks, 👤, Status notes, and keeps notes out of the text', () => {
    const t202 = parseTasks(fx('features/202-edit-operations/tasks.md'));
    const t001 = t202.find((t) => t.id === 'T001');
    expect(t001.done).toBe(false);
    expect(t001.note).toMatch(/^Status \(2026-10-07\): automated part done/);
    expect(t001.text).not.toMatch(/Findings|Status/);
    const t011 = t202.find((t) => t.id === 'T011');
    expect(t011.done).toBe(true);
    expect(t011.text).not.toMatch(/Result/);
    expect(t202.filter((t) => t.done)).toHaveLength(11);
    const human = parseTasks(fx('features/001-phase1-gate-release/tasks.md')).filter((t) => t.human && !t.done);
    expect(human.map((t) => t.id)).toEqual(['T022', 'T023', 'T030', 'T033', 'T041', 'T042', 'T043', 'T044', 'T045', 'T046', 'T047']);
  });

  it('reads optional area and deps tags', () => {
    const [a, b, c] = parseTasks(
      [
        '- [x] **T020** — Store. · files: `x` · test: T010',
        '- [ ] **T021** [P] — Panel. · files: `y` · test: e2e · area: ui:editors · deps: T020, T022–T023',
        '- [ ] **T030** 👤 — Check by hand. · area: docs',
      ].join('\n'),
    );
    expect(a).toMatchObject({ id: 'T020', done: true, area: undefined, deps: [] });
    expect(b).toMatchObject({ id: 'T021', parallel: true, area: 'ui:editors', deps: ['T020', 'T022', 'T023'] });
    expect(b.text).toBe('Panel. · files: `y` · test: e2e');
    expect(c).toMatchObject({ human: true, area: 'docs' });
  });

  it('counts 👤 and [P] only before the dash, not in the description', () => {
    const [t] = parseTasks('- [ ] **T050** — Tests for every stop: 👤 task, [P] lines, spec change.');
    expect(t).toMatchObject({ human: false, parallel: false, text: 'Tests for every stop: 👤 task, [P] lines, spec change.' });
  });
});

describe('spec', () => {
  it('reads title, status, AC counts and open questions', () => {
    expect(parseSpec(fx('features/202-edit-operations/spec.md'))).toMatchObject({ status: 'In Progress', acDone: 0, acTotal: 13, clarify: 0 });
    expect(parseSpec(fx('features/401-ai-models-on-device/spec.md'))).toMatchObject({ status: 'Implemented', acDone: 7, acTotal: 7 });
    const s = parseSpec('# 999 — Thing\n\n**Status:** Draft <!-- x -->\n\n- [ ] **AC-1:** a\n- **Q1** [NEEDS CLARIFICATION] b');
    expect(s).toEqual({ title: 'Thing', status: 'Draft', acDone: 0, acTotal: 1, clarify: 1 });
  });
});

describe('memory', () => {
  it('reads progress entries newest first', () => {
    const p = parseProgress(fx('memory/progress.md'));
    expect(p[0]).toMatchObject({ date: '2026-10-08' });
    expect(p[0].title).toMatch(/^402 spec, plan, tasks/);
    expect(p[0].next).toMatch(/T010/);
    expect(p.length).toBeGreaterThan(10);
  });

  it('reads decisions, skipping the template heading', () => {
    const d = parseDecisions(fx('memory/decisions.md'));
    expect(d.map((x) => x.id)).toEqual(Array.from({ length: 12 }, (_, i) => `D-${String(i + 1).padStart(3, '0')}`));
  });

  it("reads MEMORY's next step and blockers whole, across lines", () => {
    const m = parseMemory(fx('memory/MEMORY.md'));
    expect(m.date).toBe('2026-10-08');
    expect(m.next).toMatch(/T001's answers are needed before T032 \/ T033/);
    expect(m.blockers).toMatch(/^none/);
  });
});

describe('stations and next task', () => {
  const features = fixtureFeatures();
  const byId = (id) => features.find((f) => f.id === id);

  it('places each feature on the line', () => {
    expect(['000', '201', '401'].map((id) => byId(id).station)).toEqual(['Done', 'Done', 'Done']);
    expect(byId('202').station).toBe('Implement');
    expect(byId('402').station).toBe('Implement');
    expect(byId('203').station).toBe('Backlog');
    expect(stationOf({ status: 'Draft' })).toBe('Specify');
    expect(stationOf({ status: 'Approved', hasPlan: false })).toBe('Plan');
    expect(stationOf({ status: 'Approved', hasPlan: true, hasTasks: false })).toBe('Tasks');
    expect(stationOf({ status: 'In Progress', hasPlan: true, hasTasks: true, tasks: [{ id: 'T091', done: false }] })).toBe('Verify');
  });

  it('202: next T030, T001 stopped, no 👤 task', () => {
    const n = nextFor('202', features);
    expect(n.next.id).toBe('T030');
    expect(n.stopped.map((t) => t.id)).toEqual(['T001']);
    expect(n.human).toEqual([]);
    expect(n.ready).toBe(true);
    expect(n.paused).toBe(false);
  });

  it('001: paused, 11 👤 tasks, next agent task T040', () => {
    const n = nextFor('001', features);
    expect(n.paused).toBe(true);
    expect(n.human).toHaveLength(11);
    expect(n.next.id).toBe('T040');
  });

  it('402: next T010, three 👤 tasks', () => {
    const n = nextFor('402', features);
    expect(n.next.id).toBe('T010');
    expect(n.human.map((t) => t.id)).toEqual(['T054', 'T062', 'T063']);
  });

  it('done features have no next task', () => {
    for (const id of ['000', '201', '401']) expect(nextFor(id, features).next).toBeNull();
  });

  it('a task whose deps are open is blocked and skipped', () => {
    const f = [{ id: '999', station: 'Implement', roadmap: '🚧', needs: [], tasks: parseTasks('- [ ] **T010** — a · deps: T020\n- [ ] **T020** — b') }];
    const n = nextFor('999', f);
    expect(n.next.id).toBe('T020');
    expect(n.blocked.map((t) => t.id)).toEqual(['T010']);
  });

  it('a feature whose needs are not Done is not ready', () => {
    const f = [
      { id: '201', station: 'Done', roadmap: '✔️', needs: [], tasks: [] },
      { id: '202', station: 'Implement', roadmap: '🚧', needs: [], tasks: [] },
      { id: '203', station: 'Backlog', roadmap: '⬜', needs: ['201', '202'], tasks: [] },
    ];
    expect(nextFor('203', f)).toMatchObject({ ready: false, needsOpen: ['202'] });
  });

  it('an unknown feature gives null', () => {
    expect(nextFor('777', features)).toBeNull();
  });
});

describe('the live repository', () => {
  it('parses without errors and finds 402', () => {
    const repo = readRepo(join(import.meta.dirname, '../..'));
    expect(repo.features.some((f) => f.id === '402' && f.tasks.length > 30)).toBe(true);
    expect(repo.decisions.length).toBeGreaterThanOrEqual(12);
  });

  it("reads the roadmap's Needs column: Phase 2 items need 201, and 212 isn't ready", () => {
    const features = readFeatures(join(import.meta.dirname, '../..'));
    const f = (id) => features.find((x) => x.id === id);
    expect(['202', '203', '204', '205', '206', '207', '208', '210', '211'].every((id) => f(id).needs.includes('201'))).toBe(true);
    expect(f('212').needs.length).toBeGreaterThan(0);
    expect(nextFor('212', features).ready).toBe(false);
  });
});
