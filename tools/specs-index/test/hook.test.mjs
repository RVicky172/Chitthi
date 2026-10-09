import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { syncRepo } from '../lib/sync.mjs';
import { editJson, tempMini } from './helpers.mjs';

const HOOK = fileURLToPath(new URL('../hook.mjs', import.meta.url));

function hook(root, input) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, SPECS_ROOT: root },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const call = (event, tool, file, cwd) => ({ hook_event_name: event, tool_name: tool, tool_input: { file_path: file }, cwd });

describe('hook: before an edit', () => {
  it('refuses to edit a generated document and names the JSON to edit', () => {
    const dir = tempMini();
    syncRepo(dir);
    const r = hook(dir, call('PreToolUse', 'Edit', join(dir, 'specs/features/102-beta/tasks.md'), dir));
    expect(r.code).toBe(2);
    expect(r.err).toContain('specs/features/102-beta/tasks.md is generated');
    expect(r.err).toContain('specs/features/102-beta/feature.json');
    const roadmap = hook(dir, call('PreToolUse', 'Write', 'specs/roadmap.md', dir)); // relative to cwd
    expect(roadmap.code).toBe(2);
    expect(roadmap.err).toContain('specs/roadmap.json');
  });

  it('lets every other file through', () => {
    const dir = tempMini();
    for (const file of ['src/app.ts', 'specs/features/102-beta/notes.md', 'specs/workflow.md', 'specs/features/102-beta/feature.json'])
      expect(hook(dir, call('PreToolUse', 'Write', join(dir, file), dir)).code, file).toBe(0);
  });
});

describe('hook: after an edit', () => {
  it('regenerates the Markdown when a feature.json changed', () => {
    const dir = tempMini();
    syncRepo(dir);
    const json = join(dir, 'specs/features/102-beta/feature.json');
    editJson(json, (f) => (f.tasks.items.byId.T004.status = 'done'));
    const r = hook(dir, call('PostToolUse', 'Edit', json, dir));
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, 'specs/features/102-beta/tasks.md'), 'utf8')).toContain('- [x] **T004** — Release.');
  });

  it('reports a broken feature.json back to the agent', () => {
    const dir = tempMini();
    const json = join(dir, 'specs/features/102-beta/feature.json');
    editJson(json, (f) => (f.status = 'nearly'));
    const r = hook(dir, call('PostToolUse', 'Write', json, dir));
    expect(r.code).toBe(2);
    expect(r.err).toContain('/status: must be one of');
  });

  it('does nothing for other files and never fails on bad input', () => {
    const dir = tempMini();
    expect(hook(dir, call('PostToolUse', 'Write', join(dir, 'src/a.ts'), dir)).code).toBe(0);
    expect(hook(dir, 'not json').code).toBe(0);
    expect(hook(dir, {}).code).toBe(0);
  });
});
