#!/usr/bin/env node
/*
 * The orchestrator (402 plan §5): runs a feature's agent tasks in order, implement → gates → review → commit → next,
 * and stops, saying why, on everything a person must decide (AC-11, AC-12).
 *   node scripts/factory/run.mjs <NNN> [--once] [--budget 10] [--max-turns 40] [--plan]
 * The pure parts come first: the loop's state machine (`decide`), the implementer's end marker
 * (`parseAgentOutput`), the commit message (AC-14), the test-first pairs (`taskBatch`), the prompts and the checks.
 * The runner (`runFeature`) carries the decisions out with git, `gates.mjs` and `claude -p`, each injectable so the
 * tests replace them. Importing this file has no side effects.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chooseGates, runGates as runGatesForReal } from './gates.mjs';
import { allowedToolsArgs } from './permissions.mjs';
import { nextFor, parseRoadmap, parseTasks, readFeatures, readText } from './state.mjs';

export const STOP_KINDS = ['spec-change', 'dependency', 'question'];
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

const list = (tasks) => tasks.map((t) => t.id).join(', ');
const stop = (kind, reason, attempt, extra = {}) => ({ action: 'stop', kind, reason, attempt, ...extra });

/**
 * The loop's next step. state: { attempt = 1, maxAttempts = 3, budgetLeft?, minBudget = 0.5, once }.
 * Events: start { next: nextFor() result } · implemented { output, checks: { ticked, resultNote, depsChanged,
 * specChanged, maxTurns } } · gates { run } · reviewed { verdict } · committed.
 * Returns { action: implement | gates | review | commit | retry | next | stop, kind?, reason?, feedback?, attempt }.
 */
export function decide(state, event) {
  const { attempt = 1, maxAttempts = 3, budgetLeft, minBudget = 0.5, once = false } = state ?? {};
  const retry = (feedback) =>
    attempt >= maxAttempts
      ? stop('retries', `failed ${attempt} times; last: ${feedback}`, attempt, { feedback })
      : { action: 'retry', feedback, attempt: attempt + 1 };

  if (typeof budgetLeft === 'number' && budgetLeft < minBudget)
    return stop('budget', `budget left US$${budgetLeft.toFixed(2)} is under US$${minBudget.toFixed(2)}`, attempt);

  switch (event?.type) {
    case 'start': {
      const n = event.next;
      if (!n) return stop('nothing-to-do', 'no such feature', 1);
      if (!n.ready) return stop('not-ready', `blocked by ${n.needsOpen.join(', ')} (not done yet)`, 1);
      if (n.paused) return stop('paused', `${n.feature} is paused on the roadmap`, 1);
      if (n.station === 'Done') return stop('done', `${n.feature} is done`, 1);
      if (n.station === 'Verify') return stop('verify', `${n.feature} is ready for sign-off (Verify)`, 1);
      if (n.next) return { action: 'implement', attempt: 1 };
      const waiting = [...(n.human ?? []), ...(n.stopped ?? [])];
      if (waiting.length) return stop('waiting-on-you', `waiting on you: ${list(waiting)}`, 1);
      return stop('nothing-to-do', n.blocked?.length ? `only blocked tasks left: ${list(n.blocked)}` : 'no open agent task', 1);
    }
    case 'implemented': {
      const out = parseAgentOutput(event.output);
      const c = event.checks ?? {};
      // The turn cap is a budget (AC-12, Q3: at most 40 turns per task): stop, whatever else the run did.
      if (c.maxTurns) return stop('turns', 'the implementer hit the turn cap for this task; its work is left as it is, to be stashed', attempt);
      if (out.stop) return stop(out.stop.kind, out.stop.why, attempt);
      if (c.depsChanged) return stop('dependency', 'package.json dependencies changed', attempt);
      if (c.specChanged) return stop('spec-change', 'spec.md or plan.md changed', attempt);
      const missing = [];
      if (!out.done) missing.push('no `FACTORY: done` (or FACTORY-STOP) line at the end of the reply');
      if (!c.ticked) missing.push('the task is not ticked in tasks.md');
      if (!c.resultNote) missing.push('the task has no dated **Result** note');
      return missing.length ? retry(missing.join('; ')) : { action: 'gates', attempt };
    }
    case 'gates': {
      if (event.run?.ok) return { action: 'review', attempt };
      const red = (event.run?.gates ?? []).filter((g) => !g.ok);
      return retry(red.length ? red.map((g) => `${g.name}: ${g.summary}`).join('; ') : 'the gates failed');
    }
    case 'reviewed': {
      if (event.verdict?.ok) return { action: 'commit', attempt };
      const reasons = (event.verdict?.reasons ?? []).map((r) => {
        const where = r.file ? ` (${r.file}${r.line ? `:${r.line}` : ''})` : '';
        return `${r.rule}${where}: ${r.why}`;
      });
      return retry(reasons.length ? `review: ${reasons.join('; ')}` : 'the review failed');
    }
    case 'committed':
      return once ? stop('once', 'one task done (--once)', attempt) : { action: 'next', attempt: 1 };
    default:
      throw new Error(`decide: unknown event ${JSON.stringify(event?.type)}`);
  }
}

const MARKER = /^[\s`*_]*(FACTORY: done|FACTORY-STOP:\s*(.+?))[\s`*_]*$/;

/** The implementer's last marker line: `FACTORY: done` or `FACTORY-STOP: <kind>: <why>` (unknown kind → question). */
export function parseAgentOutput(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = MARKER.exec(lines[i]);
    if (!m) continue;
    if (!m[2]) return { done: true };
    const k = /^([a-z-]+):\s*(.*)$/.exec(m[2]);
    if (k && STOP_KINDS.includes(k[1])) return { done: false, stop: { kind: k[1], why: k[2].trim() } };
    return { done: false, stop: { kind: 'question', why: m[2].trim() } };
  }
  return { done: false };
}

const LOOP = /^\*\*\(loop\)\*\*\s*/;
const TAIL_WORDS = /\s+(a|an|the|and|or|of|in|on|to|for|with|from|by|at|as|until)$/i;

/** A task's text as a commit summary: first sentence, no markdown or parentheses, lower-case first, ≤ max chars. */
export function summarize(text, max = 60) {
  let s = String(text ?? '')
    .replace(LOOP, '')
    .split(/\s·\s/)[0]
    .split(/[.;](?:\s|$)/)[0]
    .replace(/[`*]/g, '');
  for (let prev; prev !== s; ) {
    prev = s;
    s = s.replace(/\s*\([^()]*\)/g, '');
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > max) {
    const cut = s.slice(0, max + 1);
    s = cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max);
  }
  for (let prev; prev !== s; ) {
    prev = s;
    s = s.replace(/[\s,:;–—-]+$/, '').replace(TAIL_WORDS, '');
  }
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/**
 * `feat(NNN): <summary> (P2.x)` (CLAUDE.md "Git"); the work-item suffix comes from the roadmap title, if it has one.
 * A test-first pair is summarised from its implementation task (the last one) and names every task in the body.
 */
export function commitMessage(feature, task, roadmapTitle = '') {
  const id = typeof feature === 'object' ? feature.id : String(feature);
  const tasks = Array.isArray(task) ? task : [task];
  const item = /\((P\d+\.\d+)\)\s*$/.exec(roadmapTitle ?? '');
  const subject = `feat(${id}): ${summarize(tasks.at(-1).text)}${item ? ` (${item[1]})` : ''}`;
  return `${subject}\n\n${tasks.length > 1 ? 'Tasks' : 'Task'}: ${list(tasks)} (${id}, run by the factory).\n\n${TRAILER}\n`;
}

const TESTS_FIRST = /^(failing tests|tests first)\b/i;

/** What to hand the implementer at once: a "Failing tests" / "Tests first" task with the next unchecked task. */
export function taskBatch(task, tasks) {
  const text = String(task.text ?? '').replace(LOOP, '');
  // "Failing tests then the code" is one task that does both: nothing to pair.
  if (!TESTS_FIRST.test(text) || /\bthen\b/i.test(text.split(/[.·]/)[0])) return [task];
  const after = tasks.slice(tasks.indexOf(task) + 1).find((t) => !t.done);
  return after && !after.human && !after.note ? [task, after] : [task];
}

// ── Prompts (scripts/factory/prompts/*.md, read at run time so they can be edited without code changes) ──────────

const HERE = import.meta.dirname;

/** Fills `{{name}}` placeholders; a placeholder with no value is a typo in the template, so it throws. */
export function fillPrompt(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`prompt: no value for {{${k}}}`);
    return String(vars[k]);
  });
}

const PAIR =
  'These tasks are a test-first pair: write the failing tests and see them fail, then the implementation, in this one turn (the Stop hook will not end a turn on red tests). Tick both, each with its own dated Result note.';

/** The `· files: …` part of a task's text, without backticks. */
const filesOf = (text) => (/·\s*files:\s*([^·]+)/.exec(text ?? '')?.[1] ?? '').replace(/`/g, '').trim();
/** Paths named in the tasks' `files:` parts (for the gate guess in --plan). */
const pathsOf = (tasks) => tasks.flatMap((t) => filesOf(t.text).split(/,\s*|\s+and\s+|\s+/)).filter((p) => /^[\w.*/-]+$/.test(p) && /[./]/.test(p));

function promptVars(feature, tasks) {
  return {
    feature: feature.id,
    title: feature.title,
    folder: feature.folder ?? feature.id,
    tasks: tasks.map((t) => t.id).join(' + '),
    taskList: tasks.map((t) => `- **${t.id}** — ${t.text}`).join('\n'),
    pair: tasks.length > 1 ? PAIR : '',
    scope: tasks.map((t) => filesOf(t.text)).filter(Boolean).join('; ') || 'none named (stay within what the task describes)',
  };
}

const template = (name, dir = join(HERE, 'prompts')) => readFileSync(join(dir, `${name}.md`), 'utf8').replace(/\r\n/g, '\n');
const tidy = (s) => s.replace(/\n{3,}/g, '\n\n').trim() + '\n';

export const prompts = {
  implement: (feature, tasks, { dir } = {}) => tidy(fillPrompt(template('implement', dir), promptVars(feature, tasks))),
  retry: (feature, tasks, { feedback, attempt, maxAttempts, dir }) => tidy(fillPrompt(template('retry', dir), { ...promptVars(feature, tasks), feedback, attempt, maxAttempts })),
  review: (feature, tasks, { dir } = {}) => tidy(fillPrompt(template('review', dir), promptVars(feature, tasks))),
};

// ── Deterministic checks: the loop trusts files and git, not what the agent says (plan "Determinism over trust") ──

/** Every task of the batch ticked, and every one with an indented, dated `**Result (YYYY-MM-DD…` note. */
export function taskChecks(tasksText, ids) {
  const text = String(tasksText ?? '').replace(/\r\n/g, '\n');
  const tasks = parseTasks(text);
  const noted = new Set();
  let cur = null;
  for (const line of text.split('\n')) {
    const m = /^- \[[ xX]\] \*\*(T\d+)\*\*/.exec(line);
    if (m) cur = m[1];
    else if (/^\S/.test(line)) cur = null;
    else if (cur && /^\s+- \*\*Result \(\d{4}-\d{2}-\d{2}/.test(line)) noted.add(cur);
  }
  return { ticked: ids.every((id) => tasks.find((t) => t.id === id)?.done === true), resultNote: ids.every((id) => noted.has(id)) };
}

const DEP_KEYS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const depList = (o) => JSON.stringify(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));
/** Did a package get added, removed or re-versioned between two package.json objects? (Scripts don't count.) */
export const depsChanged = (before, after) => DEP_KEYS.some((k) => depList(before?.[k]) !== depList(after?.[k]));

// ── Claude Code, headless (T001: stdin closed, --max-turns works, StructuredOutput for --json-schema) ────────────

const denial = (d) => `${d?.tool_name ?? '?'}: ${d?.tool_input?.command ?? d?.tool_input?.file_path ?? JSON.stringify(d?.tool_input ?? {})}`;

/** The `result` event of `claude -p --output-format json` → { result, subtype, costUsd, turns, denials, structured }. */
export function parseClaudeJson(stdout) {
  const text = String(stdout ?? '').trim();
  let ev = null;
  try {
    ev = JSON.parse(text);
  } catch {
    for (const line of text.split(/\r?\n/).reverse()) {
      try {
        const j = JSON.parse(line);
        if (j?.type === 'result') {
          ev = j;
          break;
        }
      } catch {
        // not a JSON line
      }
    }
  }
  if (Array.isArray(ev)) ev = ev.findLast((e) => e?.type === 'result') ?? null;
  if (!ev || ev.type !== 'result') return { result: text, subtype: 'error_output', costUsd: 0, turns: 0, denials: [], structured: undefined };
  return {
    result: ev.result ?? '',
    subtype: ev.subtype ?? (ev.is_error ? 'error' : 'success'),
    costUsd: Number(ev.total_cost_usd) || 0,
    turns: Number(ev.num_turns) || 0,
    denials: (ev.permission_denials ?? []).map(denial),
    structured: ev.structured_output ?? undefined,
  };
}

export const claudeArgv = ({ agent, prompt, args = [] }) => ['-p', prompt, '--agent', agent, '--output-format', 'json', ...args];

/** Spawns `claude -p` (no shell: the prompt goes through argv untouched) and resolves with its parsed result. */
export function callClaude(call, { root = process.cwd(), bin = 'claude', timeoutMs = 90 * 60_000 } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE; // the gates the agent runs must open Electron (CLAUDE.md)
    const child = spawn(bin, claudeArgv(call), { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ...parseClaudeJson(''), subtype: 'error_spawn', result: String(e) });
    });
    child.on('close', () => {
      clearTimeout(timer);
      const r = parseClaudeJson(out);
      if (timedOut) r.subtype = 'error_timeout';
      if (r.subtype === 'error_output' && err.trim()) r.result = `${r.result}\n${err.trim()}`.trim();
      resolve(r);
    });
  });
}

/** The reviewer's schema, without a `$schema` key (Claude Code refuses draft 2020-12 there: learnings, T042). */
function verdictSchema() {
  const { $schema, ...schema } = JSON.parse(readFileSync(join(HERE, 'verdict.schema.json'), 'utf8'));
  void $schema;
  return JSON.stringify(schema);
}

function parseVerdict(text) {
  try {
    const v = JSON.parse(String(text ?? '').trim());
    return typeof v?.ok === 'boolean' ? { ok: v.ok, reasons: Array.isArray(v.reasons) ? v.reasons : [] } : null;
  } catch {
    return null;
  }
}

// ── The runner ────────────────────────────────────────────────────────────────────────────────────────────────

function gitRun(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  return { code: r.status ?? 1, out: (r.stdout ?? '').trim(), err: (r.stderr ?? String(r.error ?? '')).trim() };
}

const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};
const round = (usd) => Math.round(usd * 1e4) / 1e4;
const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
const lines = (s) => s.split(/\r?\n/).filter(Boolean);

/**
 * Runs feature `nnn`'s agent tasks until a stop (402 §5). opts: { root, once, budgetUsd = 10, maxTurns = 40,
 * callCapUsd = 4, maxAttempts = 3, plan, log, promptsDir }. deps: { callClaude, runGates, onState, now }.
 * Resolves { stop: { kind, reason, stash?, denials? }, commits, costUsd, turns } (or { plan } with --plan).
 * Never pushes, merges, tags, resets or cleans; a stop before a commit stashes the work (`git stash push -u`).
 */
export async function runFeature(nnn, opts = {}, deps = {}) {
  const { root = process.cwd(), once = false, budgetUsd = 10, maxTurns = 40, callCapUsd = 4, maxAttempts = 3, plan = false, log = console.log, promptsDir } = opts;
  const call = deps.callClaude ?? ((c) => callClaude(c, { root }));
  const gatesRun = deps.runGates ?? ((gates, info) => runGatesForReal(gates, info));
  const now = deps.now ?? (() => new Date());
  const git = (...args) => gitRun(root, args);
  const dirty = () => git('status', '--porcelain').out !== '';

  const loop = { feature: String(nnn), task: null, station: null, attempt: 1, phase: 'start', startedAt: now().toISOString(), costUsd: 0, turns: 0 };
  const commits = [];
  let denials = [];
  const save = (patch) => {
    Object.assign(loop, patch);
    if (plan) return;
    mkdirSync(join(root, '.factory'), { recursive: true });
    writeFileSync(join(root, '.factory/state.json'), JSON.stringify(loop, null, 2) + '\n');
    deps.onState?.(loop);
  };
  const account = (res) => {
    loop.costUsd = round(loop.costUsd + (res.costUsd ?? 0));
    loop.turns += res.turns ?? 0;
    for (const d of res.denials ?? []) if (!denials.includes(d)) denials.push(d);
  };
  const summary = () => ({ commits, costUsd: loop.costUsd, turns: loop.turns });

  /** Every stop goes through here: stash the work if the tree is dirty (never on a refusal), record, report. */
  const stopHere = (d, { stash = true } = {}) => {
    const s = { kind: d.kind, reason: d.reason };
    if (denials.length) s.denials = [...denials];
    if (stash && dirty()) {
      const message = `factory ${nnn} ${loop.task ?? '-'} attempt ${loop.attempt}: ${d.kind}`;
      const r = git('stash', 'push', '-u', '-m', message);
      if (r.code === 0) {
        s.stash = git('stash', 'list', '-1', '--format=%gd').out || 'stash@{0}';
        s.reason += ` — work stashed as ${s.stash} ("${message}")`;
      } else s.reason += ` — git stash failed, the work is still in the tree: ${r.err}`;
    }
    if (s.denials) s.reason += ` — refused commands: ${s.denials.join('; ')}`;
    save({ phase: 'stopped', stop: s });
    log(`■ ${nnn} stopped (${s.kind}): ${s.reason}`);
    return { stop: s, ...summary() };
  };
  const refuse = (reason) => (plan ? log(`! would refuse to run: ${reason}`) : stopHere({ kind: 'refused', reason }, { stash: false }));

  // Start checks (AC-14, plan §5 "Commits"): this feature's branch, a clean tree.
  if (!/^\d{3}$/.test(String(nnn))) return stopHere({ kind: 'refused', reason: `"${nnn}" is not a feature number (NNN)` }, { stash: false });
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;
  if (!branch.startsWith(`feat/${nnn}-`)) {
    const r = refuse(`the branch is ${branch || '(none)'}; the loop runs only on feat/${nnn}-* (check it out first)`);
    if (r) return r;
  }
  if (dirty()) {
    const r = refuse('the working tree is not clean: commit or stash your changes first (the loop commits each task and stashes its work on a stop, so it must start clean)');
    if (r) return r;
  }
  const roadmapTitle = parseRoadmap(readText(root, 'specs/roadmap.md')).find((r) => r.id === String(nnn))?.title ?? '';

  for (;;) {
    const features = readFeatures(root);
    const feature = features.find((f) => f.id === String(nnn));
    const n = nextFor(String(nnn), features);
    let attempt = 1;
    const state = () => ({ attempt, maxAttempts, budgetLeft: budgetUsd - loop.costUsd, once });
    denials = [];
    save({ station: n?.station ?? null, task: n?.next?.id ?? null, attempt, phase: 'start' });
    let d = decide(state(), { type: 'start', next: n });
    if (d.action === 'stop') return plan ? (log(`■ would stop (${d.kind}): ${d.reason}`), { plan: null, stop: d }) : stopHere(d);

    const batch = taskBatch(n.next, feature.tasks);
    const ids = batch.map((t) => t.id);
    const label = ids.join('+');
    const area = batch.at(-1).area ?? batch[0].area;
    const limits = () => ['--max-turns', String(maxTurns), '--max-budget-usd', Math.max(0.5, Math.min(budgetUsd - loop.costUsd, callCapUsd)).toFixed(2)];
    const implementerArgs = () => [...limits(), '--permission-mode', 'acceptEdits', ...allowedToolsArgs('implementer')];
    const reviewerArgs = () => [...limits(), '--json-schema', verdictSchema(), ...allowedToolsArgs('reviewer')];

    if (plan) {
      const gates = chooseGates(pathsOf(batch), { area });
      const implementPrompt = prompts.implement(feature, batch, { dir: promptsDir });
      const show = (agent, args) => `claude ${claudeArgv({ agent, prompt: `<${agent} prompt>`, args }).map((a) => (a.startsWith('{') ? '<scripts/factory/verdict.schema.json>' : quote(a))).join(' ')}`;
      log(`${nnn} (${n.station}): next ${label}${batch.length > 1 ? ' (test-first pair)' : ''}`);
      log(`gates guessed from the task's files (${pathsOf(batch).join(', ') || 'none named'}): ${gates.join(', ') || 'none'}`);
      log(show('implementer', implementerArgs()));
      log(show('reviewer', reviewerArgs()));
      log(`commit: ${commitMessage(nnn, batch, roadmapTitle).split('\n')[0]}`);
      log(`\n<implementer prompt>\n${implementPrompt}`);
      return { plan: { tasks: ids, gates, implementPrompt, reviewPrompt: prompts.review(feature, batch, { dir: promptsDir }) }, stop: null };
    }

    let feedback = null;
    for (;;) {
      save({ phase: 'implement', attempt });
      log(`▶ ${nnn} ${label} attempt ${attempt}/${maxAttempts}: implementer (US$${loop.costUsd.toFixed(2)} of ${budgetUsd.toFixed(2)} spent)`);
      const prompt = feedback ? prompts.retry(feature, batch, { feedback, attempt, maxAttempts, dir: promptsDir }) : prompts.implement(feature, batch, { dir: promptsDir });
      const res = await call({ agent: 'implementer', prompt, args: implementerArgs() });
      account(res);
      log(`  implementer: ${res.subtype}, ${res.turns} turns, US$${(res.costUsd ?? 0).toFixed(2)}${res.denials?.length ? `, ${res.denials.length} refused commands` : ''}`);
      if (res.subtype === 'error_max_budget_usd') return stopHere({ kind: 'budget', reason: 'the implementer spent its per-call budget' });
      if (res.subtype !== 'success' && res.subtype !== 'error_max_turns') return stopHere({ kind: 'error', reason: `claude failed (${res.subtype}): ${String(res.result).slice(0, 400)}` });

      const changed = [...new Set([...lines(git('diff', '--name-only', 'HEAD').out), ...lines(git('ls-files', '--others', '--exclude-standard').out)])];
      const base = `specs/features/${feature.folder}`;
      const checks = {
        ...taskChecks(readText(root, `${base}/tasks.md`), ids),
        depsChanged: changed.includes('package.json') && depsChanged(safeJson(git('show', 'HEAD:package.json').out), safeJson(readText(root, 'package.json'))),
        specChanged: changed.includes(`${base}/spec.md`) || changed.includes(`${base}/plan.md`),
        maxTurns: res.subtype === 'error_max_turns',
      };
      const retryWith = (fb) => {
        feedback = res.denials?.length ? `${fb}\n\nCommands refused in that run (not on the headless allow-list, D-014; find another way): ${res.denials.join('; ')}` : fb;
        attempt = d.attempt;
        log(`  ↻ retry: ${fb}`);
      };
      d = decide(state(), { type: 'implemented', output: res.result, checks });
      if (d.action === 'stop') return stopHere(d);
      if (d.action === 'retry') {
        retryWith(d.feedback);
        continue;
      }

      save({ phase: 'gates' });
      const gates = chooseGates(changed, { area });
      log(`  gates (${changed.length} changed files): ${gates.join(', ') || 'none'}`);
      const run = await gatesRun(gates, { feature: String(nnn), task: label, root });
      log(`  gates ${run.ok ? 'green' : 'red'}: ${run.gates.map((g) => `${g.ok ? '✓' : '✗'} ${g.name} ${g.summary}`).join('; ') || 'none run'}`);
      d = decide(state(), { type: 'gates', run });
      if (d.action === 'stop') return stopHere(d);
      if (d.action === 'retry') {
        retryWith(d.feedback);
        continue;
      }

      save({ phase: 'review' });
      const rv = await call({ agent: 'reviewer', prompt: prompts.review(feature, batch, { dir: promptsDir }), args: reviewerArgs() });
      account(rv);
      if (rv.subtype === 'error_max_budget_usd') return stopHere({ kind: 'budget', reason: 'the reviewer spent its per-call budget' });
      const verdict = rv.subtype === 'success' ? (rv.structured ?? parseVerdict(rv.result)) : null;
      if (!verdict) return stopHere({ kind: 'error', reason: `the reviewer gave no verdict (${rv.subtype}): ${String(rv.result).slice(0, 400)}` });
      log(`  review: ${verdict.ok ? 'accepted' : `rejected (${verdict.reasons.length} reasons)`}, US$${(rv.costUsd ?? 0).toFixed(2)}`);
      d = decide(state(), { type: 'reviewed', verdict });
      if (d.action === 'stop') return stopHere(d);
      if (d.action === 'retry') {
        retryWith(d.feedback);
        continue;
      }

      save({ phase: 'commit' });
      const message = commitMessage(nnn, batch, roadmapTitle);
      const added = git('add', '-A');
      if (added.code) return stopHere({ kind: 'error', reason: `git add failed: ${added.err}` });
      const tmp = mkdtempSync(join(tmpdir(), 'factory-msg-'));
      let committed;
      try {
        writeFileSync(join(tmp, 'COMMIT_MSG'), message);
        committed = git('commit', '-q', '-F', join(tmp, 'COMMIT_MSG')); // hooks run: never --no-verify
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
      if (committed.code) return stopHere({ kind: 'error', reason: `git commit failed: ${committed.err || committed.out}` });
      const sha = git('rev-parse', '--short', 'HEAD').out;
      commits.push(sha);
      log(`✓ ${sha} ${message.split('\n')[0]}`);
      d = decide(state(), { type: 'committed' });
      if (d.action === 'stop') return stopHere(d);
      break;
    }
  }
}

async function main(argv) {
  const valued = ['--budget', '--max-turns'];
  const positional = argv.filter((a, i) => !a.startsWith('--') && !valued.includes(argv[i - 1]));
  const num = (name, def) => {
    if (!argv.includes(name)) return def;
    const v = Number(argv[argv.indexOf(name) + 1]);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} needs a positive number`);
    return v;
  };
  if (positional.length !== 1 || !/^\d{3}$/.test(positional[0])) {
    console.error('usage: node scripts/factory/run.mjs <NNN> [--once] [--budget 10] [--max-turns 40] [--plan]');
    return 2;
  }
  const nnn = positional[0];
  const r = await runFeature(nnn, { once: argv.includes('--once'), plan: argv.includes('--plan'), budgetUsd: num('--budget', 10), maxTurns: num('--max-turns', 40) });
  if (r.plan !== undefined) return 0;
  console.log(`\nFactory ${nnn}: ${r.commits.length} commit${r.commits.length === 1 ? '' : 's'}${r.commits.length ? ` (${r.commits.join(', ')})` : ''}, US$${r.costUsd.toFixed(2)}, ${r.turns} turns. Stop: ${r.stop.kind} — ${r.stop.reason}`);
  return ['refused', 'error'].includes(r.stop.kind) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(await main(process.argv.slice(2)));
