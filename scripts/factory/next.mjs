#!/usr/bin/env node
/*
 * What an agent may do next (402 plan §1): prints, as JSON, a feature's next agent task, its 👤 tasks, tasks stopped
 * with a Status note, tasks waiting on open dependencies, and whether the features it needs are Done.
 *   node scripts/factory/next.mjs [NNN]     no NNN: the active feature, as the dashboard picks it
 * Read-only; always exits 0 (a feature that can't be found prints { "error": … }).
 */
import { activeFeature, nextFor, readFeatures } from './state.mjs';

const features = readFeatures(process.cwd());
const id = process.argv[2] ?? activeFeature(features)?.id;
const n = id ? nextFor(id, features) : null;
const brief = (t) => ({ id: t.id, text: t.text, ...(t.area && { area: t.area }), ...(t.deps.length && { deps: t.deps }), ...(t.note && { note: t.note }) });

console.log(
  JSON.stringify(
    n
      ? { ...n, next: n.next && brief(n.next), human: n.human.map(brief), stopped: n.stopped.map(brief), blocked: n.blocked.map(brief) }
      : { error: id ? `no feature ${id} in specs/features or the roadmap` : 'no active feature' },
    null,
    2,
  ),
);
