// Writes every generated file from the JSON: roadmap.md, and each feature's spec.md, plan.md and tasks.md.
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { readText, writeText } from './json.mjs';
import { rel, roadmapMd } from './paths.mjs';
import { FEATURE_NOTE, renderPlan, renderSpec, renderTasks } from './render/feature.mjs';
import { renderRoadmap } from './render/roadmap.mjs';
import { loadSchema, validate } from './schema.mjs';
import { loadIndex } from './store.mjs';

const lf = (s) => s.replace(/\r\n/g, '\n');
const isGenerated = (text) => text !== null && lf(text).startsWith(FEATURE_NOTE + '\n');

const PARTS = [
  ['spec', 'spec.md', renderSpec],
  ['plan', 'plan.md', renderPlan],
  ['tasks', 'tasks.md', renderTasks],
];

/**
 * What the generated files should be: [{ path, part, current, text }], `text` null when the file should not exist
 * (its part of the JSON is gone; only listed when the file there was generated). Data that breaks its schema is
 * skipped: the check reports it, and nothing is written from it.
 */
export function expectedFiles(index) {
  const out = [];
  if (index.roadmap && validate(loadSchema('roadmap'), index.roadmap).length === 0) {
    const path = roadmapMd(index.root);
    out.push({ path, part: 'roadmap', current: readText(path), text: renderRoadmap(index.roadmap) });
  }
  for (const f of index.features.values()) {
    if (!f.data || validate(loadSchema('feature'), f.data).length) continue;
    for (const [part, name, render] of PARTS) {
      const path = join(f.dir, name);
      const current = readText(path);
      if (f.data[part]) out.push({ path, part, current, text: render(f.data) });
      else if (isGenerated(current)) out.push({ path, part, current, text: null });
    }
  }
  return out;
}

/** Brings the generated files in line with the JSON. Returns { changed: [relative paths], problems }. */
export function syncRepo(root, { write = true } = {}) {
  const index = loadIndex(root);
  const changed = [];
  for (const { path, current, text } of expectedFiles(index)) {
    if (text === null) {
      changed.push(rel(root, path));
      if (write) rmSync(path);
      continue;
    }
    if (current !== null && lf(current) === text) continue;
    changed.push(rel(root, path));
    // Keep a file's CRLF endings (Windows checkouts): git stores LF either way.
    if (write) writeText(path, current?.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  }
  return { changed, problems: index.problems };
}
