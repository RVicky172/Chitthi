// Updates to loaded data. Pure: each function changes the objects it is given (and returns them); the CLI, the hook
// and the dashboard write the files and regenerate the Markdown. Every refusal is a SpecsError with a message.
import { readFileSync } from 'node:fs';
import { FOLDER_RE, templateFile } from './paths.mjs';
import { TASK_STATUSES, entries } from './store.mjs';

export class SpecsError extends Error {}

export const FEATURE_STATUSES = ['draft', 'approved', 'in-progress', 'implemented', 'superseded'];
const HASH = /^[0-9a-f]{7,40}$/;

/** A new feature.json object from specs/templates/feature-template.json. */
export function fromTemplate({ id, title, created }) {
  const f = JSON.parse(readFileSync(templateFile('feature-template.json'), 'utf8'));
  Object.assign(f, { id, title, status: 'draft' });
  f.dates.created = created;
  f.spec.changelog = [{ date: created, text: 'Created.' }];
  return f;
}

/** The roadmap status that fits a feature status (the first in legend order whose featureStatus lists it). */
export function roadmapStatusFor(roadmap, featureStatus) {
  return entries(roadmap.statuses).find(([, s]) => s.featureStatus.includes(featureStatus))?.[0] ?? null;
}

/**
 * Moves a task to `status` (todo | in-progress | blocked | done). Starting records startedOn; done records doneOn
 * (`date` or today), commits and a result note; blocked needs a reason; leaving blocked clears it.
 */
export function setTaskStatus(feature, id, status, { reason, commits = [], result, date, today }) {
  if (!feature.tasks) throw new SpecsError(`${feature.id} has no tasks yet`);
  const t = feature.tasks.items.byId[id];
  if (!t) throw new SpecsError(`${feature.id} has no task ${id}`);
  if (!TASK_STATUSES.includes(status))
    throw new SpecsError(`${status} is not a task status: ${TASK_STATUSES.join(', ')}`);
  for (const c of commits) if (!HASH.test(c)) throw new SpecsError(`${c} is not a commit hash (7–40 hex digits)`);
  const why = reason?.trim() || (t.status === 'blocked' ? t.blockedReason : null);
  if (status === 'blocked' && !why) throw new SpecsError(`Blocking ${feature.id} ${id} needs a reason (--reason "<why>")`);

  t.status = status;
  t.blockedReason = status === 'blocked' ? why : null;
  if (status === 'in-progress') t.startedOn ??= today;
  if (status === 'done') {
    t.doneOn = date ?? today;
    t.startedOn ??= t.doneOn;
  } else t.doneOn = null;
  t.commits = [...new Set([...(t.commits ?? []), ...commits])];
  if (result?.trim()) (t.notes ??= []).push(result.trim());
  return feature;
}

/** Ticks or unticks an acceptance criterion. */
export function setCriterion(feature, id, done) {
  const c = feature.spec.criteria.byId[id];
  if (!c) throw new SpecsError(`${feature.id} has no criterion ${id}`);
  c.done = Boolean(done);
  return feature;
}

/** Sets a feature's status, fills its dates on the way, and moves its roadmap item to the matching status. */
export function setStatus(roadmap, feature, status, { today }) {
  if (!FEATURE_STATUSES.includes(status))
    throw new SpecsError(`${status} is not a status: ${FEATURE_STATUSES.join(', ')}`);
  feature.status = status;
  const d = feature.dates;
  if (['approved', 'in-progress', 'implemented'].includes(status)) d.approved ??= today;
  if (['in-progress', 'implemented'].includes(status)) d.started ??= today;
  if (status === 'implemented') d.done ??= today;
  const item = roadmap.items.byId[feature.id];
  const next = status === 'superseded' ? null : roadmapStatusFor(roadmap, status);
  if (item && next) item.status = next;
  roadmap.updated = today;
  return { roadmap, feature };
}

/** A new feature: { folder, feature } with a spec skeleton. Links its roadmap item (adding one to `phase`). */
export function newFeature(roadmap, { id, name, title, phase, today }) {
  if (!/^\d{3}$/.test(id)) throw new SpecsError(`${id}: the id must be three digits (e.g. 405)`);
  const folder = `${id}-${name}`;
  if (!FOLDER_RE.test(folder)) throw new SpecsError(`${name}: the name must be kebab-case (e.g. roadmap-dashboard)`);
  let item = roadmap.items.byId[id];
  if (item?.folder) throw new SpecsError(`${id} already has a folder: ${item.folder}`);
  if (!item) {
    const phases = roadmap.phases.order;
    if (!phase) throw new SpecsError(`${id} is not on the roadmap: pass --phase <${phases.join('|')}>`);
    const p = roadmap.phases.byId[phase];
    if (!p) throw new SpecsError(`${phase} is not a phase: ${phases.join(', ')}`);
    item = { title, workItem: null, status: '', note: '', folder: null, needs: [] };
    roadmap.items.byId[id] = item;
    const at = p.items.findIndex((other) => other > id);
    p.items.splice(at < 0 ? p.items.length : at, 0, id);
  }
  item.folder = `features/${folder}`;
  item.status = roadmapStatusFor(roadmap, 'draft') ?? item.status;
  roadmap.updated = today;

  const feature = fromTemplate({ id, title, created: today });
  feature.workItem = item.workItem ?? null;
  feature.git.branch = `feat/${folder}`;
  feature.spec.phase = entries(roadmap.phases).find(([, p]) => p.items.includes(id))?.[1].title ?? null;
  return { folder, feature };
}
