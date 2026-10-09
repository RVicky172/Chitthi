// Gates as code (402 §2): which gates a change needs, what each gate's output says, and the run file.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DOD, chooseGates, commandFor, runGates, summarize } from './gates.mjs';

const out = (name) => readFileSync(join(import.meta.dirname, 'fixtures/gate-output', name), 'utf8');

describe('chooseGates', () => {
  // Build first, test at the end (constitution II, D-023): code gets `check`; slow gates only for their own tests.
  const cases = [
    ['engine only', ['src/engine/edits.ts'], {}, ['check']],
    ['engine test only', ['src/engine/edits.test.ts'], {}, ['check']],
    ['timeline component', ['src/components/studio/Timeline.tsx'], {}, ['check']],
    ['component with an area tag', ['src/components/studio/Shell.tsx'], { area: 'ui:instagram' }, ['check']],
    ['print studio component', ['src/components/Stage.tsx'], {}, ['check']],
    ['electron main', ['electron/main.cjs'], {}, ['check']],
    ['agent tools', ['src/agent/tools.ts'], {}, ['check']],
    ['the self-test', ['src/dev/selftest.ts'], {}, ['check', 'selftest']],
    ['the MCP smoke test', ['scripts/mcp-smoke.mjs'], {}, ['check', 'mcp']],
    ['a dependency', ['package.json', 'package-lock.json'], {}, ['check', 'licenses']],
    ['vite config', ['vite.config.ts'], {}, ['check', 'build']],
    ['CSP', ['nginx/security-headers.conf'], {}, ['build']],
    ['docs only', ['docs/MEDIA-STUDIO.md', 'specs/roadmap.md', 'memory/progress.md', 'CHANGELOG.md'], {}, []],
    ['scripts only', ['scripts/factory/state.mjs'], {}, ['check']],
    ['an e2e file', ['e2e/editors.e2e.ts'], {}, ['check', 'e2e:editors']],
    ['mixed', ['src/engine/timeline.ts', 'src/components/studio/Timeline.tsx', 'e2e/editors.e2e.ts', 'docs/MCP.md'], {}, ['check', 'e2e:editors']],
  ];
  it.each(cases)('%s', (_name, paths, task, gates) => {
    expect(chooseGates(paths, task)).toEqual(gates);
  });

  it('accepts Windows paths', () => {
    expect(chooseGates(['src\\dev\\selftest.ts'])).toEqual(['check', 'selftest']);
  });

  it('verify runs the whole Definition of Done', () => {
    expect(chooseGates([], {}, { verify: true })).toEqual(DOD);
    expect(DOD).toEqual(['check', 'build', 'e2e', 'selftest', 'mcp', 'licenses']);
  });
});

describe('commands', () => {
  it('maps each gate to its npm command', () => {
    expect(commandFor('check')).toBe('npm run check');
    expect(commandFor('e2e')).toBe('npm run test:e2e');
    expect(commandFor('e2e:editors')).toBe('npx playwright test e2e/editors.e2e.ts');
    expect(commandFor('selftest')).toBe('npm test');
    expect(commandFor('mcp')).toBe('npm run test:mcp');
    expect(commandFor('licenses')).toBe('npm run check:licenses');
    expect(commandFor('build')).toBe('npm run build');
  });
});

describe('summarize', () => {
  it('check: unit tests and lint', () => {
    expect(summarize('check', out('check-pass.txt'), 0)).toEqual({ ok: true, summary: '1011 tests passed, lint 0 errors / 5 warnings' });
    expect(summarize('check', 'src/x.ts(3,1): error TS2304: Cannot find name', 2)).toMatchObject({ ok: false, summary: 'typecheck: 1 error' });
  });
  it('e2e: passed, failed and flaky, with the failing names', () => {
    expect(summarize('e2e:docs', out('e2e-pass.txt'), 0)).toEqual({ ok: true, summary: '2 passed' });
    const r = summarize('e2e:x', out('e2e-fail-flaky.txt'), 1);
    expect(r.ok).toBe(false);
    expect(r.summary).toBe('1 passed, 1 failed, 1 flaky: scratch fails; flaky: scratch is flaky');
  });
  it('self-test: counts and the first failures', () => {
    expect(summarize('selftest', out('selftest-pass.txt'), 0)).toEqual({ ok: true, summary: '6124 checks passed, 0 failed' });
    expect(summarize('selftest', out('selftest-fail.txt'), 1)).toEqual({
      ok: false,
      summary: '6122 checks passed, 2 failed: video: frame 12 differs from the 2.x placement; console error: Refused to load blob: worker',
    });
  });
  it('MCP and licences', () => {
    expect(summarize('mcp', out('mcp-pass.txt'), 0)).toEqual({ ok: true, summary: 'MCP smoke test passed' });
    expect(summarize('mcp', '✗ export_pdf\n\n1 failed', 1)).toEqual({ ok: false, summary: '1 failed' });
    expect(summarize('licenses', out('licenses-pass.txt'), 0)).toEqual({ ok: true, summary: '168 shipped packages, all allowed' });
  });
  it('a non-zero exit is a failure whatever the output says', () => {
    expect(summarize('selftest', out('selftest-pass.txt'), 1).ok).toBe(false);
  });
  it('unrecognised output falls back to its last line', () => {
    expect(summarize('build', 'vite v8\n✓ built in 9.1s\n', 0)).toEqual({ ok: true, summary: '✓ built in 9.1s' });
  });
});

describe('runGates', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('runs each gate, writes one run file and reports a red gate', async () => {
    dir = mkdtempSync(join(tmpdir(), 'factory-'));
    const ran = [];
    const exec = async (cmd) => {
      ran.push(cmd);
      return cmd === 'npm run check' ? { code: 0, output: out('check-pass.txt') } : { code: 1, output: out('e2e-fail-flaky.txt') };
    };
    const now = () => new Date('2026-10-08T14:03:00Z');
    const run = await runGates(['check', 'e2e:editors'], { feature: '202', task: 'T030', root: dir, exec, now });
    expect(ran).toEqual(['npm run check', 'npx playwright test e2e/editors.e2e.ts']);
    expect(run.ok).toBe(false);
    expect(run.gates.map((g) => [g.name, g.ok])).toEqual([
      ['check', true],
      ['e2e:editors', false],
    ]);
    expect(run.gates.every((g) => typeof g.ms === 'number')).toBe(true);
    const files = readdirSync(join(dir, '.factory/runs'));
    expect(files).toEqual(['2026-10-08T14-03-00Z-202-T030.json']);
    const saved = JSON.parse(readFileSync(join(dir, '.factory/runs', files[0]), 'utf8'));
    expect(saved).toMatchObject({ at: '2026-10-08T14:03:00.000Z', feature: '202', task: 'T030', ok: false });
    expect(saved.gates[1].summary).toMatch(/1 failed/);
  });

  it('an empty gate list is green and still recorded', async () => {
    dir = mkdtempSync(join(tmpdir(), 'factory-'));
    const run = await runGates([], { feature: '402', task: 'T081', root: dir, exec: async () => ({ code: 0, output: '' }) });
    expect(run).toMatchObject({ ok: true, gates: [] });
    expect(readdirSync(join(dir, '.factory/runs'))).toHaveLength(1);
  });
});
