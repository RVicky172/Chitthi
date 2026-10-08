// The dashboard's Loop panel and active card (402 §5, T053, AC-13): what `.factory/state.json` (written by run.mjs on
// every phase) looks like on the page.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loopPanel, readLoop, render } from './dashboard.mjs';

const NOW = new Date('2026-10-08T12:00:00Z');
const ago = (s) => new Date(NOW.getTime() - s * 1000).toISOString();
const running = (patch = {}) => ({
  feature: '402',
  task: 'T060',
  station: 'Implement',
  attempt: 2,
  phase: 'gates',
  startedAt: ago(600),
  costUsd: 1.5,
  turns: 30,
  updatedAt: ago(5),
  ...patch,
});

const roots = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe('readLoop', () => {
  it('reads .factory/state.json and adds when it last changed; none or broken → null', () => {
    const root = mkdtempSync(join(tmpdir(), 'factory-dash-'));
    roots.push(root);
    expect(readLoop(root)).toBeNull();
    mkdirSync(join(root, '.factory'));
    const p = join(root, '.factory/state.json');
    writeFileSync(p, '{ "feature": "402", "phase": "implem');
    expect(readLoop(root)).toBeNull();
    writeFileSync(p, JSON.stringify(running({ updatedAt: undefined })));
    utimesSync(p, NOW, NOW);
    const l = readLoop(root);
    expect(l.feature).toBe('402');
    expect(l.updatedAt).toBe(NOW.toISOString());
  });
});

describe('loopPanel', () => {
  it('no state: says how to start the loop', () => {
    expect(loopPanel(null, NOW)).toMatch(/No loop has run.*\/factory/s);
  });

  it('running: feature, task, station, the current phase marked, attempt, cost, turns, last change', () => {
    const html = loopPanel(running(), NOW);
    expect(html).toContain('402');
    expect(html).toContain('T060');
    expect(html).toContain('Implement');
    expect(html).toMatch(/class="phase now"[^>]*>gates/);
    expect(html).toMatch(/class="phase done"[^>]*>implement/);
    expect(html).toMatch(/attempt <b>2<\/b> of 3/);
    expect(html).toContain('US$1.50');
    expect(html).toContain('30 turns');
    expect(html).toMatch(/running/);
    expect(html).toMatch(/5 s ago/);
  });

  it('stopped: the kind, the reason (escaped) and the stash', () => {
    const html = loopPanel(
      running({
        phase: 'stopped',
        stop: { kind: 'retries', reason: 'failed 3 times; last: <b>check</b>', stash: 'stash@{0}' },
      }),
      NOW,
    );
    expect(html).toMatch(/stopped/);
    expect(html).toContain('retries');
    expect(html).toContain('&lt;b&gt;check&lt;/b&gt;');
    expect(html).toContain('stash@{0}');
  });

  it('a run with no change for longer than the implementer may take is flagged', () => {
    expect(loopPanel(running({ updatedAt: ago(100 * 60) }), NOW)).toMatch(/no change for 1 h 40 min/);
    expect(loopPanel(running({ updatedAt: ago(30 * 60) }), NOW)).not.toMatch(/no change for/);
  });
});

describe('render with a loop', () => {
  const feature = (id, station, title) => ({
    id,
    title,
    station,
    status: 'In Progress',
    roadmap: '🚧',
    needs: [],
    tasks: [{ id: 'T060', text: 'lock', done: false }],
    acDone: 0,
    acTotal: 1,
  });
  const data = (loop) => ({
    features: [feature('202', 'Implement', 'Edit operations'), feature('402', 'Implement', 'Software factory')],
    progress: [],
    decisions: [],
    memory: {},
    learnings: 0,
    runs: [],
    git: { branch: 'feat/402-software-factory', dirty: 0, commits: [] },
    at: NOW,
    now: NOW,
    loop,
  });

  it('the Loop panel comes first, and the loop’s feature is the active card, with its task and phase', () => {
    const html = render(data(running()), { serve: true });
    expect(html.indexOf('<h2>Loop')).toBeGreaterThan(-1);
    expect(html.indexOf('<h2>Loop')).toBeLessThan(html.indexOf('<h2>The line'));
    const card402 = html.slice(
      html.indexOf('<span class="id">402'),
      html.indexOf('</article>', html.indexOf('<span class="id">402')),
    );
    expect(card402).toContain('active');
    expect(card402).toMatch(/T060 · gates · attempt 2/);
    const card202 = html.slice(
      html.indexOf('<span class="id">202'),
      html.indexOf('</article>', html.indexOf('<span class="id">202')),
    );
    expect(card202).not.toContain('active');
  });

  it('without a loop the first feature in Implement stays active', () => {
    const html = render(data(null), { serve: false });
    const card202 = html.slice(
      html.indexOf('<span class="id">202'),
      html.indexOf('</article>', html.indexOf('<span class="id">202')),
    );
    expect(card202).toContain('active');
  });
});
