#!/usr/bin/env node
/*
 * The software factory's dashboard (specs/software-factory.md, Part 4). Reads the roadmap, every feature folder,
 * memory/, the gate runs in .factory/runs/ and git, and renders one HTML page. Read-only: it writes nothing but
 * .factory/dashboard.html. The Loop panel shows the orchestrator's .factory/state.json (run.mjs, 402 §5, AC-13).
 *   node scripts/factory/dashboard.mjs              writes .factory/dashboard.html
 *   node scripts/factory/dashboard.mjs --serve [n]  http://127.0.0.1:4310 (or port n), re-read on every load
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STATIONS, activeFeature, isPaused, nextFor, readRepo } from './state.mjs';

const ROOT = process.cwd();
const REFRESH_S = 10;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Markdown inline bits we meet in task and progress lines: `code` and **bold**; everything else stays text.
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// --- Derived views ---------------------------------------------------------------------------------------------

function waitingOnYou(features) {
  const items = [];
  for (const f of features) {
    if (f.station === 'Specify') items.push({ f, kind: 'Approve spec', text: `${f.folder ?? f.id}/spec.md is a draft` });
    if (f.clarify) items.push({ f, kind: 'Clarify', text: `${f.clarify} [NEEDS CLARIFICATION] in the spec` });
    for (const t of f.tasks)
      if (!t.done && (t.human || t.note)) items.push({ f, kind: t.human ? '👤 task' : 'Stopped', text: `${t.id} — ${t.note || t.text}` });
  }
  return items;
}

// --- Rendering --------------------------------------------------------------------------------------------------

function bar(done, total, label) {
  if (!total) return '';
  const pct = Math.round((done / total) * 100);
  return `<div class="bar" role="img" aria-label="${esc(label)}: ${done} of ${total}"><span style="width:${pct}%"></span></div><div class="barlabel">${esc(label)} ${done}/${total}</div>`;
}

function card(f, activeId, loop) {
  const done = f.tasks.filter((t) => t.done).length;
  const flags = [isPaused(f) ? '<span class="tag warn">paused</span>' : '', f.id === activeId ? '<span class="tag hot">active</span>' : ''].join('');
  // The loop's feature carries what the loop is doing on it right now (AC-13).
  const doing =
    loop && loop.feature === f.id
      ? `<div class="loopline${loop.stop ? ' stopped' : ''}">${loop.stop ? `■ stopped: ${esc(loop.stop.kind)}` : `▶ ${esc([loop.task, loop.phase, loop.attempt ? `attempt ${loop.attempt}` : ''].filter(Boolean).join(' · '))}`}</div>`
      : '';
  return `<article class="card${isPaused(f) ? ' paused' : ''}">
    <div class="cardhead"><span class="id">${esc(f.id)}</span>${flags}</div>
    <div class="title">${esc(clip(f.title, 90))}</div>${doing}
    ${bar(done, f.tasks.length, 'tasks')}${bar(f.acDone, f.acTotal, 'ACs')}
  </article>`;
}

function line(data, activeId) {
  return `<div class="line">${STATIONS.map((s) => {
    const here = data.features.filter((f) => f.station === s);
    const shown = s === 'Backlog' ? here.slice(0, 6) : here;
    const more = here.length - shown.length;
    return `<section class="station" aria-label="${s}"><h3>${s} <span class="count">${here.length}</span></h3>
      ${shown.map((f) => card(f, activeId, data.loop)).join('') || '<p class="empty">—</p>'}
      ${more > 0 ? `<p class="more">+ ${more} more on the roadmap</p>` : ''}</section>`;
  }).join('')}</div>`;
}

// --- The loop (.factory/state.json, written by run.mjs on every phase change) -----------------------------------

const PHASES = ['implement', 'gates', 'review', 'commit'];
// run.mjs kills an implementer call after 90 min; a state older than that (plus a margin) is a run that died.
const STALE_S = 95 * 60;

/** The loop's state plus `updatedAt` (the file's mtime, unless the state has one); null if none or unreadable. */
export function readLoop(root) {
  const p = join(root, '.factory/state.json');
  try {
    const s = JSON.parse(readFileSync(p, 'utf8'));
    if (!s || typeof s !== 'object' || !s.feature) return null;
    return { ...s, updatedAt: s.updatedAt ?? statSync(p).mtime.toISOString() };
  } catch {
    return null; // missing, or caught half-written: the next refresh reads it again
  }
}

function since(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

/** The Loop panel: feature, task, station, phase, attempt, cost, and on a stop its kind and reason (AC-13). */
export function loopPanel(loop, now = new Date()) {
  if (!loop)
    return '<p class="empty">No loop has run here yet: <code>/factory NNN</code> in Claude Code (or <code>npm run factory -- NNN</code>) starts one.</p>';
  const age = (now.getTime() - new Date(loop.updatedAt ?? loop.startedAt ?? now).getTime()) / 1000;
  const stopped = loop.phase === 'stopped' || Boolean(loop.stop);
  const at = PHASES.indexOf(loop.phase);
  const phases = PHASES.map((p, i) => {
    const cls = stopped ? (i < at ? 'done' : '') : i < at ? 'done' : i === at ? 'now' : '';
    return `<span class="phase ${cls}"${i === at && !stopped ? ' aria-current="step"' : ''}>${p}</span>`;
  }).join('<span class="arrow">→</span>');
  const status = stopped
    ? `<span class="tag stop">stopped</span>`
    : age > STALE_S
      ? `<span class="tag warn">no change for ${since(age)}: the run may have ended without a stop</span>`
      : `<span class="tag hot">running</span>`;
  const stopBox = loop.stop
    ? `<div class="stopbox"><b>${esc(loop.stop.kind)}</b>: ${inline(clip(String(loop.stop.reason ?? ''), 600))}${loop.stop.stash ? `<div class="meta">Work stashed as <code>${esc(loop.stop.stash)}</code></div>` : ''}</div>`
    : '';
  return `<div class="loophead">${status} <b>${esc(loop.feature)}</b>${loop.task ? ` · <b>${esc(loop.task)}</b>` : ''}${loop.station ? ` · ${esc(loop.station)}` : ''}</div>
    <div class="phases">${phases}</div>
    <div class="meta">attempt <b>${esc(loop.attempt ?? 1)}</b> of ${esc(loop.maxAttempts ?? 3)} · US$${(Number(loop.costUsd) || 0).toFixed(2)} · ${esc(loop.turns ?? 0)} turns · started ${esc(loop.startedAt ? since((now.getTime() - new Date(loop.startedAt).getTime()) / 1000) + ' ago' : '—')} · last change ${since(age)} ago</div>
    ${stopBox}`;
}

function runsPanel(runs) {
  if (!runs.length)
    return '<p class="empty">No gate runs yet: <code>npm run factory:gates</code> writes them to <code>.factory/runs/</code>.</p>';
  const when = (at) => {
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? String(at ?? '') : d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  };
  // Red gates show their summary inline (a title tooltip can't be read on a phone); green ones keep it as a tooltip.
  return `<div style="overflow-x:auto"><table><thead><tr><th>When</th><th>Feature</th><th>Task</th><th>Gates</th></tr></thead><tbody>${runs
    .map((r) => `<tr><td>${esc(when(r.at))}</td><td>${esc(r.feature ?? '')}</td><td>${esc(r.task ?? '')}</td><td>${r.gates
      .map((g) => `<span class="gate ${g.ok ? 'ok' : 'fail'}" title="${esc(g.summary ?? '')}">${g.ok ? '✓' : '✗'} ${esc(g.name)}${g.ms ? ` · ${(g.ms / 1000).toFixed(0)} s` : ''}</span>`)
      .join(' ')}${r.gates
      .filter((g) => !g.ok)
      .map((g) => `<div class="runfail">${esc(g.name)}: ${esc(clip(g.summary ?? '', 240))}</div>`)
      .join('')}${r.gates.length ? '' : '<span class="meta">no gates needed</span>'}</td></tr>`)
    .join('')}</tbody></table></div>`;
}

export function render(data, { serve }) {
  const now = data.now ?? new Date();
  // The loop's feature is the active one while it runs, and for a day after it stopped (its stop needs you).
  const loopFresh = data.loop && (!data.loop.stop || now.getTime() - new Date(data.loop.updatedAt ?? 0).getTime() < 86_400_000);
  const act = (loopFresh && data.features.find((f) => f.id === data.loop.feature)) || activeFeature(data.features);
  const next = act ? nextFor(act.id, data.features).next : null;
  // Paused features (roadmap ⏸️) wait by choice: count them, don't list every task.
  const waiting = waitingOnYou(data.features.filter((f) => !isPaused(f)));
  const parked = waitingOnYou(data.features.filter(isPaused));
  const counts = Object.fromEntries(STATIONS.map((s) => [s, data.features.filter((f) => f.station === s).length]));
  const inFlight = data.features.filter((f) => !['Backlog', 'Done'].includes(f.station));
  const openTasks = inFlight.reduce((n, f) => n + f.tasks.filter((t) => !t.done).length, 0);
  const stamp = data.at.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${serve ? `<meta http-equiv="refresh" content="${REFRESH_S}">` : ''}
<title>Chitthi Factory</title>
<style>
:root{--bg:#f6f5f2;--panel:#fff;--ink:#1d1d1b;--muted:#6b6a66;--line:#e3e1db;--accent:#b4442b;--ok:#2f7d4f;--fail:#b3261e;--warn:#9a6a00;--chip:#f0eee8;--barbg:#ebe8e1}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--panel:#1d1d1b;--ink:#ecebe7;--muted:#a3a19b;--line:#33322f;--accent:#e2765c;--ok:#6cc08b;--fail:#f08a80;--warn:#e0b45a;--chip:#2a2927;--barbg:#2f2e2b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
header{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:baseline;justify-content:space-between;padding:20px 24px 8px}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:0 0 10px}h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 8px;display:flex;justify-content:space-between}
.meta{color:var(--muted);font-size:12px}
main{padding:8px 24px 32px;display:grid;gap:16px}main>*,.cols>*{min-width:0}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.kpi b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.kpi span{color:var(--muted);font-size:12px}
.line{display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:10px;overflow-x:auto;padding-bottom:4px}
.station{background:var(--chip);border-radius:8px;padding:10px;min-height:120px}
.count{background:var(--panel);border-radius:999px;padding:0 7px;color:var(--ink)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:8px}
.card.paused{opacity:.7;border-style:dashed}
.cardhead{display:flex;gap:6px;align-items:center}.id{font-weight:700;font-variant-numeric:tabular-nums}
.title{font-size:12px;margin:2px 0 6px}
.tag{font-size:10px;padding:1px 6px;border-radius:999px;background:var(--chip)}.tag.hot{color:var(--accent);font-weight:600}.tag.warn{color:var(--warn)}
.bar{height:5px;background:var(--barbg);border-radius:3px;overflow:hidden}.bar span{display:block;height:100%;background:var(--accent)}
.barlabel{font-size:10px;color:var(--muted);margin:2px 0 4px;font-variant-numeric:tabular-nums}
.empty,.more{color:var(--muted);font-size:12px;margin:4px 0}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
dl{margin:0;display:grid;grid-template-columns:max-content 1fr;gap:6px 12px}dt{color:var(--muted)}dd{margin:0}
ul{margin:0;padding-left:18px}li{margin:4px 0}
.kind{font-size:11px;font-weight:600;color:var(--accent);margin-right:6px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500;font-size:12px}
td.num{font-variant-numeric:tabular-nums}
.runfail{color:var(--fail);font-size:12px;margin-top:4px}
.gate{display:inline-block;font-size:12px;padding:1px 6px;border-radius:4px;background:var(--chip)}.gate.ok{color:var(--ok)}.gate.fail{color:var(--fail);font-weight:600}
code{font:12px ui-monospace,Consolas,monospace;background:var(--chip);padding:0 3px;border-radius:3px}
.session{border-top:1px solid var(--line);padding:8px 0}.session:first-child{border-top:0;padding-top:0}
.session .d{color:var(--muted);font-size:12px}
.loophead{font-size:15px;margin-bottom:8px}.tag.stop{color:var(--fail);font-weight:600}
.phases{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:6px 0}.arrow{color:var(--muted)}
.phase{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--chip);color:var(--muted)}.phase.done{color:var(--ok)}.phase.now{background:var(--accent);color:var(--panel);font-weight:600}
.stopbox{margin-top:8px;padding:8px 10px;border-left:3px solid var(--fail);background:var(--chip);border-radius:4px;overflow-wrap:anywhere}
.loopline{font-size:11px;color:var(--accent);font-weight:600;margin:0 0 4px}.loopline.stopped{color:var(--fail)}
@media (max-width:640px){header,main{padding-left:16px;padding-right:16px}.line{grid-template-columns:repeat(7,78vw)}}
</style>
</head>
<body>
<header>
  <h1>Chitthi Factory</h1>
  <div class="meta">Branch <code>${esc(data.git.branch)}</code> · ${data.git.dirty} uncommitted file${data.git.dirty === 1 ? '' : 's'} · read ${esc(stamp)}${serve ? ` · refreshes every ${REFRESH_S} s` : ' · <code>npm run factory:dashboard -- --serve</code> for live'}</div>
</header>
<main>
  <div class="kpis">
    <div class="kpi"><b>${inFlight.length}</b><span>features in flight</span></div>
    <div class="kpi"><b>${openTasks}</b><span>open tasks in flight</span></div>
    <div class="kpi"><b>${waiting.length}</b><span>waiting on you</span></div>
    <div class="kpi"><b>${counts.Done}</b><span>features done</span></div>
    <div class="kpi"><b>${counts.Backlog}</b><span>in the backlog</span></div>
    <div class="kpi"><b>${data.decisions.length} · ${data.learnings}</b><span>decisions · learnings</span></div>
  </div>

  <section class="panel loop" aria-live="polite"><h2>Loop</h2>${loopPanel(data.loop ?? null, now)}</section>

  <section class="panel"><h2>The line</h2>${line(data, act?.id)}</section>

  <div class="cols">
    <section class="panel"><h2>Now</h2><dl>
      <dt>Active</dt><dd>${act ? `<b>${esc(act.id)}</b> ${esc(act.title)} · ${esc(act.station)}` : '—'}</dd>
      <dt>Next agent task</dt><dd>${next ? `<b>${esc(next.id)}</b> ${inline(clip(next.text, 220))}` : '—'}</dd>
      <dt>Memory says next</dt><dd>${inline(data.memory.next || '—')}</dd>
      <dt>Blockers</dt><dd>${inline(data.memory.blockers || 'none')}</dd>
      <dt>State as of</dt><dd>${esc(data.memory.date || '—')}</dd>
    </dl></section>
    <section class="panel"><h2>Waiting on you <span class="meta">(${waiting.length})</span></h2>${
      waiting.length
        ? `<ul>${waiting.map((w) => `<li><span class="kind">${esc(w.kind)}</span><b>${esc(w.f.id)}</b> ${inline(clip(w.text, 180))}</li>`).join('')}</ul>`
        : '<p class="empty">Nothing: the line can run.</p>'
    }${parked.length ? `<p class="more">+ ${parked.length} on paused features (${[...new Set(parked.map((w) => w.f.id))].map(esc).join(', ')}), parked by choice</p>` : ''}</section>
  </div>

  <section class="panel"><h2>Features</h2><div style="overflow-x:auto"><table>
    <thead><tr><th>#</th><th>Feature</th><th>Station</th><th>Spec</th><th>Roadmap</th><th>Tasks</th><th>ACs</th></tr></thead>
    <tbody>${data.features
      .filter((f) => f.station !== 'Backlog')
      .map((f) => `<tr><td class="num">${esc(f.id)}</td><td>${esc(clip(f.title, 80))}</td><td>${esc(f.station)}</td><td>${esc(f.status)}</td><td>${esc(f.roadmap)}</td><td class="num">${f.tasks.filter((t) => t.done).length}/${f.tasks.length}</td><td class="num">${f.acDone}/${f.acTotal}</td></tr>`)
      .join('')}</tbody></table></div></section>

  <section class="panel"><h2>Gate runs</h2>${runsPanel(data.runs)}</section>

  <div class="cols">
    <section class="panel"><h2>Recent sessions</h2>${data.progress
      .slice(0, 5)
      .map((p) => `<div class="session"><div class="d">${esc(p.date)} — ${inline(p.title)}</div>${p.next ? `<div><b>Next:</b> ${inline(clip(p.next, 200))}</div>` : ''}${p.blockers && !/^none/i.test(p.blockers) ? `<div><b>Blockers:</b> ${inline(clip(p.blockers, 200))}</div>` : ''}</div>`)
      .join('') || '<p class="empty">No sessions logged.</p>'}</section>
    <section class="panel"><h2>Latest decisions</h2><ul>${data.decisions
      .slice(-6)
      .reverse()
      .map((d) => `<li><b>${esc(d.id)}</b> ${inline(d.title)}</li>`)
      .join('')}</ul>
      <h2 style="margin-top:16px">Recent commits</h2><ul>${data.git.commits
        .map(([h, d, s]) => `<li><code>${esc(h)}</code> <span class="meta">${esc(d)}</span> ${esc(clip(s ?? '', 90))}</li>`)
        .join('')}</ul></section>
  </div>
</main>
</body>
</html>
`;
}

// --- Entry ------------------------------------------------------------------------------------------------------

const read = () => ({ ...readRepo(ROOT), loop: readLoop(ROOT) });

function main(args) {
  if (args[0] === '--serve') {
    const port = Number(args[1]) || 4310;
    createServer((req, res) => {
      if (req.url !== '/' && req.url !== '/index.html') {
        res.writeHead(404).end();
        return;
      }
      try {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(render(read(), { serve: true }));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e?.stack ?? e));
      }
    }).listen(port, '127.0.0.1', () => console.log(`Factory dashboard: http://127.0.0.1:${port}  (Ctrl+C to stop)`));
  } else {
    mkdirSync(join(ROOT, '.factory'), { recursive: true });
    const out = join(ROOT, '.factory/dashboard.html');
    writeFileSync(out, render(read(), { serve: false }));
    console.log(`Factory dashboard: ${out}`);
  }
}

// Imported by its tests: render only when run as a script.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
