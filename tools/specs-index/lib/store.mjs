// Loads roadmap.json and every feature.json, and the helpers that read the { order, byId } collections.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './json.mjs';
import { FEATURE_FILE, FOLDER_RE, featureDir, featuresDir, rel, roadmapJson } from './paths.mjs';

/** Feature folders (NNN-name) in number order. */
export function featureFolders(root) {
  let entries;
  try {
    entries = readdirSync(featuresDir(root), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && FOLDER_RE.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Everything the tools need: { root, roadmap, features: Map<id, { id, folder, dir, path, data }>, problems }.
 * Never throws on bad data: unreadable files become problems ("path: message") and null data.
 * `read` (path → text) can be replaced, e.g. by the dashboard's cached reader.
 */
export function loadIndex(root, { read } = {}) {
  const problems = [];
  const rPath = roadmapJson(root);
  const r = readJson(rPath, read);
  if (r.error) problems.push(`${rel(root, rPath)}: ${r.error}`);

  const features = new Map();
  for (const folder of featureFolders(root)) {
    const id = FOLDER_RE.exec(folder)[1];
    const dir = featureDir(root, folder);
    const path = join(dir, FEATURE_FILE);
    const f = readJson(path, read);
    if (f.error) problems.push(`${rel(root, path)}: ${f.error === 'missing' ? `missing (every feature folder needs one)` : f.error}`);
    if (features.has(id)) problems.push(`${rel(root, dir)}: a second folder for ${id}`);
    else features.set(id, { id, folder, dir, path, data: f.data });
  }
  return { root, roadmap: r.data, features, problems };
}

/** [id, entry] pairs of an { order, byId } collection, in order; ids missing from byId are skipped. */
export function entries(collection) {
  if (!collection?.order || !collection.byId) return [];
  return collection.order.filter((id) => collection.byId[id]).map((id) => [id, collection.byId[id]]);
}

/** Criterion id → ids of the tasks that cover it (the reverse of task.covers). */
export function coverage(feature) {
  const out = {};
  for (const id of feature?.spec?.criteria?.order ?? []) out[id] = [];
  for (const [taskId, task] of entries(feature?.tasks?.items))
    for (const ac of task.covers ?? []) (out[ac] ??= []).push(taskId);
  return out;
}

export const TASK_STATUSES = ['todo', 'in-progress', 'blocked', 'done'];

/** Item id → ids of the items that need it (the reverse of item.needs). */
export function dependents(roadmap) {
  const out = {};
  for (const [id, item] of Object.entries(roadmap?.items?.byId ?? {}))
    for (const need of item.needs ?? []) (out[need] ??= []).push(id);
  return out;
}

/**
 * A feature's progress: criteria done / total, tasks per status, open questions, and the next task (the first in
 * progress, else the first to do; blocked tasks wait for someone).
 */
export function progress(feature) {
  const criteria = entries(feature?.spec?.criteria);
  const tasks = entries(feature?.tasks?.items);
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0]));
  for (const [, t] of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  const next = tasks.find(([, t]) => t.status === 'in-progress') ?? tasks.find(([, t]) => t.status === 'todo');
  return {
    criteria: { done: criteria.filter(([, c]) => c.done).length, total: criteria.length },
    tasks: { done: byStatus.done, total: tasks.length, byStatus },
    openQuestions: entries(feature?.spec?.questions).filter(([, q]) => q.open).length,
    next: next ? { id: next[0], text: next[1].text, status: next[1].status } : null,
    // For the roadmap's road (405): sections in their order (then any section only tasks name), the tasks in
    // progress, blocked and finished (done with a date), and every task's status for spotting changes.
    sections: [...new Set([...(feature?.tasks?.sections ?? []).map((s) => s.title), ...tasks.map(([, t]) => t.section)])]
      .map((title) => {
        const inSection = tasks.filter(([, t]) => t.section === title);
        return { title, done: inSection.filter(([, t]) => t.status === 'done').length, total: inSection.length };
      })
      .filter((s) => s.total > 0),
    running: tasks
      .filter(([, t]) => t.status === 'in-progress')
      .map(([id, t]) => ({ id, text: t.text, section: t.section, startedOn: t.startedOn ?? null })),
    blocked: tasks.filter(([, t]) => t.status === 'blocked').map(([id, t]) => ({ id, text: t.text, reason: t.blockedReason ?? null })),
    finished: tasks.filter(([, t]) => t.status === 'done' && t.doneOn).map(([id, t]) => ({ id, text: t.text, doneOn: t.doneOn })),
    statuses: Object.fromEntries(tasks.map(([id, t]) => [id, t.status])),
    upNext: ((t) => (t ? { id: t[0], text: t[1].text } : null))(tasks.find(([, t]) => t.status === 'todo')),
  };
}
