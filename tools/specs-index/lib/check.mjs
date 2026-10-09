// `npm run specs:check`: the JSON is valid, its links resolve, and every generated file is what the JSON gives.
// Every problem is "relative/path: message". To add a rule: add it below and a case to test/check.test.mjs.
import { rel } from './paths.mjs';
import { loadSchema, validate } from './schema.mjs';
import { entries, loadIndex } from './store.mjs';
import { expectedFiles } from './sync.mjs';

const lf = (s) => s.replace(/\r\n/g, '\n');

/** order and byId hold the same ids. */
function checkCollection(name, c, out) {
  const keys = Object.keys(c?.byId ?? {});
  for (const id of c?.order ?? []) if (!keys.includes(id)) out(`${name} ${id} is in order but not in byId`);
  for (const id of keys) if (!c.order?.includes(id)) out(`${name} ${id} is in byId but not in order`);
}

function checkRoadmap(r, features, out) {
  for (const name of ['statuses', 'phases', 'backlog']) checkCollection(name, r[name], out);
  if (r.currentPhase && !r.phases.byId[r.currentPhase]) out(`currentPhase ${r.currentPhase} is not a phase`);
  const items = r.items.byId;
  const phaseOf = {};
  for (const [phaseId, phase] of entries(r.phases))
    for (const id of phase.items) {
      if (!items[id]) out(`phase ${phaseId} lists ${id}, which is not in items`);
      else if (phaseOf[id]) out(`item ${id} is in more than one phase (${phaseOf[id]}, ${phaseId})`);
      else phaseOf[id] = phaseId;
    }
  const byFolder = new Map([...features.values()].map((f) => [`features/${f.folder}`, f]));
  for (const [id, item] of Object.entries(items)) {
    if (!phaseOf[id]) out(`item ${id} is in no phase`);
    const status = r.statuses.byId[item.status];
    if (!status) out(`item ${id} has status ${item.status}, which is not in statuses`);
    for (const need of item.needs) if (!items[need]) out(`item ${id} needs ${need}, which is not on the roadmap`);
    if (!item.folder) continue;
    const f = byFolder.get(item.folder);
    if (!f) out(`item ${id} points to ${item.folder}, which does not exist`);
    else if (f.id !== id) out(`item ${id} points to ${item.folder}, the folder of ${f.id}`);
    else if (status && f.valid && f.data.status !== 'superseded' && !status.featureStatus.includes(f.data.status))
      out(`item ${id} is ${item.status} (${status.icon}) but its feature is ${f.data.status}`);
  }
}

function checkFeature(f, out) {
  const d = f.data;
  if (d.id !== f.id) out(`id ${d.id} does not match the folder (${f.id})`);
  checkCollection('stories', d.spec.stories, out);
  checkCollection('criteria', d.spec.criteria, out);
  checkCollection('questions', d.spec.questions, out);
  if (!d.tasks) return;
  checkCollection('tasks', d.tasks.items, out);
  const sections = d.tasks.sections.map((s) => s.title);
  if (new Set(sections).size !== sections.length) out('tasks.sections has a title twice');
  for (const [id, t] of Object.entries(d.tasks.items.byId)) {
    for (const ac of t.covers ?? []) if (!d.spec.criteria.byId[ac]) out(`${id} covers ${ac}, which is not a criterion`);
    if (!sections.includes(t.section)) out(`${id} is in section ${t.section}, which is not in tasks.sections`);
    if (t.status === 'blocked' && !t.blockedReason?.trim()) out(`${id} is blocked without a blockedReason`);
  }
}

/** Runs every rule. Returns { problems: string[] } (empty when all is well). */
export function checkRepo(root) {
  const index = loadIndex(root);
  const problems = [...index.problems];
  const roadmapFile = 'specs/roadmap.json';

  let roadmapValid = false;
  if (index.roadmap) {
    const errors = validate(loadSchema('roadmap'), index.roadmap);
    problems.push(...errors.map((e) => `${roadmapFile}: ${e}`));
    roadmapValid = errors.length === 0;
  }
  for (const f of index.features.values()) {
    if (!f.data) continue;
    const errors = validate(loadSchema('feature'), f.data);
    const file = rel(root, f.path);
    problems.push(...errors.map((e) => `${file}: ${e}`));
    f.valid = errors.length === 0;
    if (f.valid) checkFeature(f, (msg) => problems.push(`${file}: ${msg}`));
  }
  if (roadmapValid) {
    checkRoadmap(index.roadmap, index.features, (msg) => problems.push(`${roadmapFile}: ${msg}`));
    const linked = new Set(Object.values(index.roadmap.items.byId).map((i) => i.folder));
    for (const f of index.features.values())
      if (!linked.has(`features/${f.folder}`))
        problems.push(`${rel(root, f.dir)}: not linked from any roadmap item (set its folder in roadmap.json)`);
  }

  const run = 'run npm run specs:sync';
  for (const e of expectedFiles(index)) {
    const file = rel(root, e.path);
    const source = e.part === 'roadmap' ? 'roadmap.json' : 'feature.json';
    if (e.text === null) problems.push(`${file}: feature.json has no ${e.part}, so this file should not exist: ${run}`);
    else if (e.current === null) problems.push(`${file}: missing: ${run}`);
    else if (lf(e.current) !== e.text) problems.push(`${file}: not what ${source} gives (edited by hand?): ${run}`);
  }
  return { problems };
}
