import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_NOTE, renderPlan, renderSpec, renderTasks } from '../lib/render/feature.mjs';
import { renderRoadmap } from '../lib/render/roadmap.mjs';
import { syncRepo } from '../lib/sync.mjs';
import { MINI, editJson, readJsonFile, tempMini } from './helpers.mjs';

const feature = (folder) => readJsonFile(join(MINI, 'specs/features', folder, 'feature.json'));
const lines = (...l) => l.join('\n') + '\n';

describe('renderSpec', () => {
  it('writes header, sections in order, grouped criteria and open questions (102)', () => {
    expect(renderSpec(feature('102-beta'))).toBe(
      lines(
        FEATURE_NOTE,
        '',
        '# 102 — Beta | the slip one',
        '',
        '**Status:** In Progress',
        '**Roadmap phase:** 1 — Basics · **Created:** 2026-01-02 · **Owner:** tester',
        '',
        '## Summary',
        '',
        'Beta slips.',
        '',
        'It slips **left**.',
        '',
        '## Acceptance Criteria',
        '',
        '### Slipping',
        '',
        '- [ ] **AC-1:** Beta slips. _(unit)_',
        '',
        '### Docs',
        '',
        '- [ ] **AC-2:** Beta has docs. _(manual)_',
        '',
        '## Out of Scope',
        '',
        '- Sliding right.',
        '',
        '## Open Questions',
        '',
        '- **Q1** [NEEDS CLARIFICATION] Which way? _Proposed:_ left.',
        '',
        '## Changelog',
        '',
        '- 2026-01-02 — Created.',
      ),
    );
  });

  it('writes stories, ticked criteria and resolved questions (101)', () => {
    const md = renderSpec(feature('101-alpha'));
    expect(md).toContain('## User Stories\n\n- **US-1:** As a tester, I want alpha, so that it works.\n');
    expect(md).toContain('## Acceptance Criteria\n\n- [x] **AC-1:** Alpha works. _(unit)_\n- [x] **AC-2:** Alpha is fast. _(unit)_\n');
    expect(md).toContain('- **Q1** _(resolved)_ Fast? _Answer:_ yes.\n');
  });

  it('writes the intro of a criteria group under its heading', () => {
    const f = feature('102-beta');
    f.spec.groupIntros = { Slipping: 'On a clean clone:' };
    expect(renderSpec(f)).toContain('### Slipping\n\nOn a clean clone:\n\n- [ ] **AC-1:** Beta slips. _(unit)_\n');
  });

  it('says so when a structured section is empty', () => {
    const f = feature('101-alpha');
    f.spec.stories = { order: [], byId: {} };
    expect(renderSpec(f)).toContain('## User Stories\n\n_None yet._\n');
  });
});

describe('renderPlan', () => {
  it('writes header, markdown sections and the data sections as tables and lists', () => {
    expect(renderPlan(feature('102-beta'))).toBe(
      lines(
        FEATURE_NOTE,
        '',
        '# 102 — Beta | the slip one · Implementation Plan',
        '',
        '**Spec:** `./spec.md` · **Status:** Approved',
        '',
        '## Approach',
        '',
        'Make beta slip **left**. See [the spec](./spec.md).',
        '',
        '## Files',
        '',
        '| File | Change | Purpose |',
        '| --- | --- | --- |',
        '| `b.ts`, `b.test.ts` | new | beta \\| slip |',
        '',
        '## Risks & Mitigations',
        '',
        '- **Slips too far:** clamp it.',
        '',
        '## Constitution Check',
        '',
        '| Principle | Status | Notes |',
        '| --- | --- | --- |',
        '| I. Spec before code | ✅ |  |',
      ),
    );
  });
});

describe('renderTasks', () => {
  it('writes sections, task lines with flags, status and notes, and the coverage table', () => {
    expect(renderTasks(feature('102-beta'))).toBe(
      lines(
        FEATURE_NOTE,
        '',
        '# 102 — Beta | the slip one · Tasks',
        '',
        '**Plan:** `./plan.md`',
        '',
        '## Core',
        '',
        '- [x] **T001** — Tests for beta. · files: `b.test.ts` · test: fails',
        '- [ ] **T002** — Beta. · files: `b.ts` · test: T001',
        '  - **In progress** since 2026-01-03',
        '',
        '## Verify',
        '',
        'Checked by hand.',
        '',
        '- [ ] **T003** [P] 👤 — Docs, checked by hand. · files: `README.md` · test: manual read',
        '  - **Blocked:** Waits for the maintainer.',
        '  - **Status (2026-01-03):** asked.',
        '    Two lines.',
        '- [ ] **T004** — Release.',
        '',
        '## AC coverage',
        '',
        '| AC | Tasks |',
        '| --- | --- |',
        '| AC-1 | T001, T002 |',
        '| AC-2 | T003 |',
      ),
    );
  });

  it('marks an uncovered criterion', () => {
    const f = feature('102-beta');
    f.tasks.items.byId.T003.covers = [];
    expect(renderTasks(f)).toContain('| AC-2 | — |\n');
  });
});

describe('renderRoadmap', () => {
  it('writes the roadmap with its generated note, tables and backlog', () => {
    const md = renderRoadmap(readJsonFile(join(MINI, 'specs/roadmap.json')));
    expect(md.split('\n')[0]).toMatch(/^<!-- Generated from specs\/roadmap\.json/);
    expect(md).toContain('| 102 | Beta \\| the slip one (P1.2) | [spec](features/102-beta/spec.md) | 🚧 half way | 101 |\n');
    expect(md).toContain('## Other features\n\nAnything else.\n\n_No items yet._\n');
    expect(md.endsWith('## Backlog\n\n- An **idea** for later. _(added 2026-01-01)_\n')).toBe(true);
  });
});

describe('syncRepo', () => {
  it('writes every generated file, then nothing on a second run', () => {
    const dir = tempMini();
    expect(syncRepo(dir).changed).toEqual([
      'specs/roadmap.md',
      'specs/features/101-alpha/spec.md',
      'specs/features/101-alpha/tasks.md',
      'specs/features/102-beta/spec.md',
      'specs/features/102-beta/plan.md',
      'specs/features/102-beta/tasks.md',
    ]);
    expect(syncRepo(dir).changed).toEqual([]);
    expect(readFileSync(join(dir, 'specs/features/102-beta/plan.md'), 'utf8')).toBe(renderPlan(feature('102-beta')));
  });

  it('follows a change in the JSON, keeps CRLF files CRLF, and reports without writing when asked', () => {
    const dir = tempMini();
    syncRepo(dir);
    const tasksPath = join(dir, 'specs/features/102-beta/tasks.md');
    writeFileSync(tasksPath, readFileSync(tasksPath, 'utf8').replace(/\n/g, '\r\n'));
    expect(syncRepo(dir).changed).toEqual([]);
    editJson(join(dir, 'specs/features/102-beta/feature.json'), (f) => (f.tasks.items.byId.T004.status = 'done'));
    expect(syncRepo(dir, { write: false }).changed).toEqual(['specs/features/102-beta/tasks.md']);
    expect(syncRepo(dir).changed).toEqual(['specs/features/102-beta/tasks.md']);
    const text = readFileSync(tasksPath, 'utf8');
    expect(text).toContain('- [x] **T004** — Release.\r\n');
  });

  it('removes a generated file whose part of the JSON is gone, but never a hand-written one', () => {
    const dir = tempMini();
    syncRepo(dir);
    editJson(join(dir, 'specs/features/102-beta/feature.json'), (f) => (f.plan = null));
    expect(syncRepo(dir).changed).toEqual(['specs/features/102-beta/plan.md']);
    expect(existsSync(join(dir, 'specs/features/102-beta/plan.md'))).toBe(false);
    writeFileSync(join(dir, 'specs/features/101-alpha/plan.md'), '# my notes\n');
    expect(syncRepo(dir).changed).toEqual([]);
    expect(existsSync(join(dir, 'specs/features/101-alpha/plan.md'))).toBe(true);
  });
});
