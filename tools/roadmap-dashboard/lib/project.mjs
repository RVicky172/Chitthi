// What the dashboard serves, read through tools/specs-index (the only code that knows the data's shape).
// Files are cached by mtime and size, so a refresh re-reads only what changed; version() is a hash of file stats,
// cheap enough for the page to ask for every 2 s.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkRepo } from '../../specs-index/lib/check.mjs';
import { readText } from '../../specs-index/lib/json.mjs';
import { featuresDir, memoryFile, roadmapJson, roadmapMd } from '../../specs-index/lib/paths.mjs';
import { loadSchema, validate } from '../../specs-index/lib/schema.mjs';
import { coverage, featureFolders, loadIndex, progress } from '../../specs-index/lib/store.mjs';
import { currentState, latestProgress } from './memory.mjs';

/** The API's shape version; app/src/types.ts API_SCHEMA must match (the page asks for a restart otherwise). */
export const API_SCHEMA = 3;

const DOCS = ['spec.md', 'plan.md', 'tasks.md'];

function stamp(paths) {
  const hash = createHash('sha1');
  for (const path of paths) {
    let s = '-';
    try {
      const st = statSync(path);
      s = `${st.mtimeMs}:${st.size}`;
    } catch {
      // missing: part of the version too
    }
    hash.update(`${path}\0${s}\n`);
  }
  return hash.digest('hex');
}

export function createProject(root) {
  const cache = new Map();
  const read = (path) => {
    const st = statSync(path); // ENOENT → readText returns null
    const key = `${st.mtimeMs}:${st.size}`;
    const hit = cache.get(path);
    if (hit?.key === key) return hit.text;
    const text = readFileSync(path, 'utf8');
    cache.set(path, { key, text });
    return text;
  };
  const dirs = () => featureFolders(root).map((folder) => join(featuresDir(root), folder));

  /** Every file the page shows. */
  const version = () =>
    stamp([
      roadmapJson(root),
      roadmapMd(root),
      featuresDir(root),
      memoryFile(root, 'MEMORY.md'),
      memoryFile(root, 'progress.md'),
      ...dirs().flatMap((d) => [d, join(d, 'feature.json'), ...DOCS.map((n) => join(d, n))]),
    ]);

  /** Only the JSON sources: when this changes, the Markdown is regenerated. */
  const jsonVersion = () => stamp([roadmapJson(root), featuresDir(root), ...dirs().map((d) => join(d, 'feature.json'))]);

  const valid = (schema, data) => data && validate(loadSchema(schema), data).length === 0;

  function project() {
    const index = loadIndex(root, { read });
    const features = {};
    for (const f of index.features.values()) {
      const d = f.data;
      if (!d) features[f.id] = { id: f.id, folder: f.folder, error: 'feature.json can’t be read' };
      else if (!valid('feature', d)) features[f.id] = { id: f.id, folder: f.folder, error: 'feature.json breaks its schema' };
      else
        features[f.id] = {
          id: f.id,
          folder: f.folder,
          title: d.title,
          status: d.status,
          workItem: d.workItem ?? null,
          dates: d.dates,
          branch: d.git?.branch ?? null,
          progress: progress(d),
        };
    }
    return {
      schema: API_SCHEMA,
      version: version(),
      roadmap: valid('roadmap', index.roadmap) ? index.roadmap : null,
      features,
      now: {
        state: currentState(readText(memoryFile(root, 'MEMORY.md'), read)),
        progress: latestProgress(readText(memoryFile(root, 'progress.md'), read)),
      },
      problems: checkRepo(root).problems,
    };
  }

  /** One feature: feature.json (null when unreadable), coverage and its generated documents; null if no folder. */
  function feature(id) {
    const f = loadIndex(root, { read }).features.get(id);
    if (!f) return null;
    const d = valid('feature', f.data) ? f.data : null;
    const doc = (name) => readText(join(f.dir, name), read);
    return {
      schema: API_SCHEMA,
      id,
      folder: f.folder,
      feature: d,
      coverage: d ? coverage(d) : {},
      docs: { spec: doc('spec.md'), plan: doc('plan.md'), tasks: doc('tasks.md') },
    };
  }

  return { version, jsonVersion, project, feature };
}
