/*
 * Readers for the software factory (specs/software-factory.md; 402 plan §1): the roadmap, every feature folder,
 * memory/, gate runs and git, turned into plain data. Shared by the dashboard, `next.mjs` and the orchestrator.
 * The parse* functions take text and return data (tested on fixtures/); the read* functions add the file system.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const STATIONS = ['Backlog', 'Specify', 'Plan', 'Tasks', 'Implement', 'Verify', 'Done'];

export const readText = (root, p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n') : '');

/** "T020, T022–T024" → ['T020', 'T022', 'T023', 'T024']; "203-205" → ['203', '204', '205']; "—" or "" → []. */
export function expandIds(s) {
  const out = [];
  for (const part of String(s ?? '').split(',').map((p) => p.trim()).filter((p) => p && p !== '—' && p !== '-')) {
    const r = /^([A-Z]*)(\d+)\s*[–-]\s*([A-Z]*)(\d+)$/.exec(part);
    if (!r) {
      out.push(part);
      continue;
    }
    const [, prefix, from, , to] = r;
    for (let n = Number(from); n <= Number(to); n++) out.push(prefix + String(n).padStart(from.length, '0'));
  }
  return out;
}

/** Roadmap rows `| 202 | title | [spec](…) | 🚧 |` (and an optional `| Needs |` cell), with the `## ` heading above. */
export function parseRoadmap(text) {
  const rows = [];
  let phase = '';
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const h = /^## (.+)/.exec(line);
    if (h) phase = h[1].trim();
    if (!/^\|\s*\d{3}\s*\|.*\|\s*$/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    rows.push({ id: cells[0], title: cells[1], status: cells[3], phase, needs: expandIds(cells[4]) });
  }
  return rows;
}

/**
 * Tasks: `- [x] **T010** 👤 [P] — text · files: … · test: … · area: ui:editors · deps: T020`, with its wrapped lines;
 * the indented `- **Result …**` / `- **Status …**` notes under it are not part of the text. An unticked task with a
 * Status note has stopped part-way (`note`).
 */
export function parseTasks(text) {
  const tasks = [];
  let cur = null;
  let inNote = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^- \[( |x|X)\] \*\*(T\d+)\*\*(.*)$/.exec(line);
    if (m) {
      // 👤 and [P] count only between the id and the dash: a description may mention "👤 task".
      const marks = m[3].split('—')[0];
      cur = { id: m[2], done: m[1] !== ' ', human: marks.includes('👤'), parallel: marks.includes('[P]'), raw: m[3], note: '' };
      tasks.push(cur);
      inNote = false;
    } else if (/^#/.test(line)) cur = null;
    else if (cur && /^\s+\S/.test(line)) {
      const note = /^\s+- \*\*(Status|Result)/.exec(line);
      if (note) {
        inNote = true;
        const s = /^\s+- \*\*(Status[^*]*)\*\*/.exec(line);
        if (s && !cur.done && !cur.note) cur.note = s[1].trim();
      } else if (!inNote) cur.raw += ' ' + line.trim();
    }
  }
  return tasks.map(({ raw, ...t }) => {
    const area = /\s*·\s*area:\s*([^\s·]+)/.exec(raw);
    const deps = /\s*·\s*deps:\s*([^·]+)/.exec(raw);
    const body = raw
      .replace(area?.[0] ?? '', '')
      .replace(deps?.[0] ?? '', '')
      .replace(/^[^—]*—\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { ...t, text: body, area: area?.[1], deps: expandIds(deps?.[1]) };
  });
}

export function parseSpec(text) {
  const t = text.replace(/\r\n/g, '\n');
  const acs = [...t.matchAll(/^\s*- \[( |x|X)\] \*\*AC-\d+/gm)];
  return {
    title: (/^# \d{3} — (.+)$/m.exec(t)?.[1] ?? '').trim(),
    status: /\*\*Status:\*\*\s*([A-Za-z ]+?)\s*(<!--|$|\*\*)/m.exec(t)?.[1] ?? 'Draft',
    acDone: acs.filter((a) => a[1] !== ' ').length,
    acTotal: acs.length,
    clarify: (t.match(/\[NEEDS CLARIFICATION/g) ?? []).length,
  };
}

/** progress.md: `## 2026-10-07 — title`, then **Done:** / **Next:** / **Blockers:**; newest first, as written. */
export function parseProgress(text) {
  const entries = [];
  for (const block of text.replace(/\r\n/g, '\n').split(/\n(?=## \d{4}-\d{2}-\d{2})/)) {
    const h = /^## (\d{4}-\d{2}-\d{2}) — (.+)$/m.exec(block);
    if (!h) continue;
    const field = (name) => (new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*\\w+:\\*\\*|$)`).exec(block)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    entries.push({ date: h[1], title: h[2].trim(), done: field('Done'), next: field('Next'), blockers: field('Blockers') });
  }
  return entries;
}

export function parseDecisions(text) {
  return [...text.replace(/\r\n/g, '\n').matchAll(/^## (D-\d+) — (.+)$/gm)].map((m) => ({ id: m[1], title: m[2].trim() }));
}

export function parseMemory(text) {
  const t = text.replace(/\r\n/g, '\n');
  const bullet = (label) => (new RegExp(`^- \\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n\\n|(?![\\s\\S]))`, 'm').exec(t)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  return { date: /Current State \((\d{4}-\d{2}-\d{2})\)/.exec(t)?.[1] ?? '', next: bullet('Next step'), blockers: bullet('Blockers'), phase: bullet('Phase') };
}

export const countLearnings = (text) => (text.match(/^- /gm) ?? []).length;

export function stationOf(f) {
  if (/implemented/i.test(f.status)) return 'Done';
  if (/draft/i.test(f.status)) return 'Specify';
  if (!f.hasPlan) return 'Plan';
  if (!f.hasTasks) return 'Tasks';
  const open = (f.tasks ?? []).filter((t) => !t.done);
  if (open.length && open.every((t) => /^T09\d$/.test(t.id))) return 'Verify';
  return open.length ? 'Implement' : 'Verify';
}

export const isPaused = (f) => (f.roadmap ?? '').includes('⏸');

/** Every feature folder plus the roadmap items that have none yet (Backlog), sorted by number. */
export function readFeatures(root, { roadmapPath = 'specs/roadmap.md', featuresDir = 'specs/features' } = {}) {
  const roadmap = parseRoadmap(readText(root, roadmapPath));
  const dir = join(root, featuresDir);
  const folders = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{3}-/.test(f)).sort() : [];
  const features = folders.map((folder) => {
    const id = folder.slice(0, 3);
    const base = `${featuresDir}/${folder}`;
    const spec = parseSpec(readText(root, `${base}/spec.md`));
    const tasks = parseTasks(readText(root, `${base}/tasks.md`));
    const row = roadmap.find((r) => r.id === id);
    const f = {
      id,
      folder,
      title: spec.title || folder,
      status: spec.status,
      roadmap: row?.status ?? '',
      phase: row?.phase ?? '',
      needs: row?.needs ?? [],
      hasPlan: existsSync(join(root, base, 'plan.md')),
      hasTasks: tasks.length > 0,
      clarify: spec.clarify,
      acDone: spec.acDone,
      acTotal: spec.acTotal,
      tasks,
    };
    return { ...f, station: stationOf(f) };
  });
  for (const r of roadmap)
    if (!features.some((f) => f.id === r.id))
      features.push({ id: r.id, title: r.title.replace(/\s*\(P\d\.\d+\).*$/, ''), status: '—', roadmap: r.status, phase: r.phase, needs: r.needs, station: 'Backlog', tasks: [], acDone: 0, acTotal: 0, clarify: 0 });
  return features.sort((a, b) => a.id.localeCompare(b.id));
}

/** The feature being worked on: the first not paused in Implement or Verify, else the first in flight. */
export function activeFeature(features) {
  const live = features.filter((f) => !isPaused(f));
  return live.find((f) => ['Implement', 'Verify'].includes(f.station)) ?? live.find((f) => f.station !== 'Done' && f.station !== 'Backlog');
}

/**
 * What an agent may do next on a feature: the first open task that is not 👤, not stopped (Status note) and not
 * waiting on an open dependency; plus those lists, and whether the features it needs are Done.
 */
export function nextFor(id, features) {
  const f = features.find((x) => x.id === id);
  if (!f) return null;
  const done = new Set(features.filter((x) => x.station === 'Done').map((x) => x.id));
  const needsOpen = (f.needs ?? []).filter((n) => !done.has(n));
  const open = f.tasks.filter((t) => !t.done);
  const openIds = new Set(open.map((t) => t.id));
  const blocked = open.filter((t) => (t.deps ?? []).some((d) => openIds.has(d)));
  const human = open.filter((t) => t.human);
  const stopped = open.filter((t) => !t.human && t.note);
  const next = f.station === 'Done' ? null : (open.find((t) => !t.human && !t.note && !blocked.includes(t)) ?? null);
  return { feature: f.id, title: f.title, station: f.station, paused: isPaused(f), ready: needsOpen.length === 0, needsOpen, next, human, stopped, blocked };
}

export function readRuns(root, limit = 12) {
  const dir = join(root, '.factory/runs');
  if (!existsSync(dir)) return [];
  const runs = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort().reverse().slice(0, limit)) {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (Array.isArray(r.gates)) runs.push(r);
    } catch {
      // A half-written or hand-edited run file: skip it rather than fail the reader.
    }
  }
  return runs;
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function readGit(root) {
  const log = git(root, ['log', '-8', '--format=%h\t%ad\t%s', '--date=short']);
  return {
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) || '—',
    dirty: git(root, ['status', '--porcelain']).split('\n').filter(Boolean).length,
    commits: log ? log.split('\n').map((l) => l.split('\t')) : [],
  };
}

export function readRepo(root) {
  return {
    features: readFeatures(root),
    progress: parseProgress(readText(root, 'memory/progress.md')),
    decisions: parseDecisions(readText(root, 'memory/decisions.md')),
    memory: parseMemory(readText(root, 'memory/MEMORY.md')),
    learnings: countLearnings(readText(root, 'memory/learnings.md')),
    runs: readRuns(root),
    git: readGit(root),
    at: new Date(),
  };
}
