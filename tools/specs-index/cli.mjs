#!/usr/bin/env node
// npm run specs -- <command>: create and update features (feature.json) and the roadmap (roadmap.json).
// Every change writes the JSON and regenerates the Markdown. See tools/specs-index/README.md.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkRepo } from './lib/check.mjs';
import { writeJson } from './lib/json.mjs';
import { SpecsError, newFeature, setCriterion, setStatus, setTaskStatus } from './lib/ops.mjs';
import { REPO_ROOT, featureDir, rel, roadmapJson } from './lib/paths.mjs';
import { loadIndex } from './lib/store.mjs';
import { syncRepo } from './lib/sync.mjs';

const HELP = `Usage: npm run specs -- <command>

  new <NNN> <kebab-name> "<title>" [--phase <id>]   folder + feature.json (spec skeleton), roadmap 📝
  status <feature> <draft|approved|in-progress|implemented|superseded>
  start <feature> <T…>                                task in progress
  block <feature> <T…> --reason "<why>"               task waits for someone
  done <feature> <T…|AC-…> [--commit <hash>]… [--result "<text>"] [--date YYYY-MM-DD]
  undone <feature> <T…|AC-…>                          task back to do, criterion unticked
  sync                                                regenerate every generated Markdown file
  check                                               JSON valid, links resolve, Markdown up to date (exit 1 if not)

<feature> is the three-digit number (202). Spec, plan and tasks prose is written in feature.json itself.
--root <dir> works on another checkout.`;

const VALUE_FLAGS = new Set(['--root', '--commit', '--result', '--date', '--phase', '--reason']);

function parseArgs(argv) {
  const args = [];
  const flags = { commit: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) {
      if (i + 1 >= argv.length) throw new SpecsError(`${a} needs a value`);
      const v = argv[++i];
      if (a === '--commit') flags.commit.push(v);
      else flags[a.slice(2)] = v;
    } else if (a === '--help' || a === '-h') flags.help = true;
    else if (a.startsWith('--')) throw new SpecsError(`Unknown option ${a}: try npm run specs -- help`);
    else args.push(a);
  }
  return { args, flags };
}

function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function need(value, usage) {
  if (value === undefined) throw new SpecsError(`usage: npm run specs -- ${usage}`);
  return value;
}

function featureOf(index, id) {
  const f = index.features.get(id);
  if (!f) throw new SpecsError(`No feature ${id} (no folder specs/features/${id}-*)`);
  if (!f.data) throw new SpecsError(`${rel(index.root, f.path)} can't be read; fix it first`);
  return f;
}

function roadmapOf(index) {
  if (!index.roadmap) throw new SpecsError(`specs/roadmap.json can't be read (${index.problems[0] ?? 'missing'})`);
  return index.roadmap;
}

function synced(root) {
  const { changed } = syncRepo(root);
  return changed.length ? `; wrote ${changed.join(', ')}` : '';
}

const TASK_COMMANDS = { start: 'in-progress', block: 'blocked', done: 'done', undone: 'todo' };

function main(argv) {
  const { args, flags } = parseArgs(argv);
  const [cmd, ...rest] = args;
  const root = flags.root ? resolve(flags.root) : REPO_ROOT;
  const today = process.env.SPECS_TODAY || localToday();

  if (!cmd || cmd === 'help' || flags.help) return console.log(HELP);

  if (cmd === 'check') {
    const { problems } = checkRepo(root);
    if (problems.length) {
      console.error(`specs:check found ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
      return process.exit(1);
    }
    const index = loadIndex(root);
    const items = Object.keys(index.roadmap.items.byId).length;
    return console.log(`specs:check: ${index.features.size} features, ${items} items; JSON valid, Markdown up to date.`);
  }

  if (cmd === 'sync') {
    const { changed, problems } = syncRepo(root);
    for (const p of problems) console.error(`warning: ${p}`);
    console.log(changed.length ? `specs:sync wrote ${changed.join(', ')}` : 'specs:sync: nothing to change');
    return process.exit(problems.length ? 1 : 0);
  }

  const index = loadIndex(root);

  if (cmd in TASK_COMMANDS) {
    const usage = `${cmd} <feature> <${cmd === 'start' || cmd === 'block' ? 'T…' : 'T…|AC-…'}>`;
    const f = featureOf(index, need(rest[0], usage));
    const id = need(rest[1], usage);
    if (/^AC-/.test(id) && (cmd === 'done' || cmd === 'undone')) {
      setCriterion(f.data, id, cmd === 'done');
      writeJson(f.path, f.data);
      return console.log(`${f.id} ${id} ${cmd === 'done' ? 'done' : 'not done'}${synced(root)}`);
    }
    const status = TASK_COMMANDS[cmd];
    setTaskStatus(f.data, id, status, { reason: flags.reason, commits: flags.commit, result: flags.result, date: flags.date, today });
    writeJson(f.path, f.data);
    const when = status === 'done' ? ` (${f.data.tasks.items.byId[id].doneOn})` : '';
    return console.log(`${f.id} ${id} ${status}${when}${synced(root)}`);
  }

  if (cmd === 'status') {
    const usage = 'status <feature> <status>';
    const f = featureOf(index, need(rest[0], usage));
    const roadmap = roadmapOf(index);
    setStatus(roadmap, f.data, need(rest[1], usage), { today });
    writeJson(f.path, f.data);
    writeJson(roadmapJson(root), roadmap);
    return console.log(`${f.id} is ${f.data.status}${synced(root)}`);
  }

  if (cmd === 'new') {
    const usage = 'new <NNN> <kebab-name> "<title>" [--phase <id>]';
    const [id, name, title] = [need(rest[0], usage), need(rest[1], usage), need(rest[2], usage)];
    if (index.features.has(id)) throw new SpecsError(`${id} already has a folder: specs/features/${index.features.get(id).folder}`);
    const roadmap = roadmapOf(index);
    const { folder, feature } = newFeature(roadmap, { id, name, title, phase: flags.phase, today });
    const dir = featureDir(root, folder);
    mkdirSync(dir, { recursive: true });
    writeJson(join(dir, 'feature.json'), feature);
    writeJson(roadmapJson(root), roadmap);
    return console.log(`created ${rel(root, dir)}/feature.json (draft)${synced(root)}`);
  }

  throw new SpecsError(`Unknown command ${cmd}: try npm run specs -- help`);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof SpecsError)) throw e;
  console.error(`specs: ${e.message}`);
  process.exit(1);
}
