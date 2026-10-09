#!/usr/bin/env node
// Claude Code hook (.claude/settings.json, PreToolUse and PostToolUse on Write | Edit | MultiEdit). Keeps the spec
// Markdown generated without anyone running a sync step:
//   - before an edit to a generated file (roadmap.md, a feature's spec.md / plan.md / tasks.md): refuse (exit 2) and
//     name the JSON to edit instead;
//   - after an edit to roadmap.json or a feature.json: regenerate the Markdown; if the JSON has problems, report them
//     to the agent (exit 2) so it fixes them.
// It never breaks a session: unreadable input or an unexpected error lets the tool call through (exit 0).
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { checkRepo } from './lib/check.mjs';
import { REPO_ROOT } from './lib/paths.mjs';
import { syncRepo } from './lib/sync.mjs';

const GENERATED = /^specs\/(?:roadmap\.md|features\/(\d{3}-[a-z0-9-]+)\/(?:spec|plan|tasks)\.md)$/;
const SOURCE = /^specs\/(?:roadmap\.json|features\/(\d{3}-[a-z0-9-]+)\/feature\.json)$/;

function run() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }
  const file = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (typeof file !== 'string' || !file) return 0;
  const root = resolve(process.env.SPECS_ROOT || REPO_ROOT);
  const path = relative(root, resolve(input.cwd ?? process.cwd(), file)).split(sep).join('/');
  if (path.startsWith('..')) return 0;

  if (input.hook_event_name === 'PreToolUse') {
    const m = GENERATED.exec(path);
    if (!m) return 0;
    const source = m[1] ? `specs/features/${m[1]}/feature.json` : 'specs/roadmap.json';
    console.error(
      `${path} is generated from ${source} and rewritten from it automatically. Edit ${source} instead ` +
        '(or use npm run specs -- …); the Markdown follows.',
    );
    return 2;
  }

  if (input.hook_event_name === 'PostToolUse') {
    const m = SOURCE.exec(path);
    if (!m) return 0;
    const { changed } = syncRepo(root);
    const scope = m[1] ? `specs/features/${m[1]}/` : 'specs/roadmap';
    const problems = checkRepo(root).problems.filter((p) => p.startsWith(scope));
    if (problems.length) {
      console.error(`specs: ${path} has problems (fix them; the Markdown is regenerated once it is valid):\n  ${problems.join('\n  ')}`);
      return 2;
    }
    if (changed.length) console.log(`specs: regenerated ${changed.join(', ')}`);
  }
  return 0;
}

let code = 0;
try {
  code = run();
} catch (e) {
  console.error(`specs hook: ${e.message} (ignored)`);
}
process.exit(code);
