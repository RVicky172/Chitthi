// Shared by the tests: the mini fixture, and a fresh temp copy of it that a test may change.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MINI = fileURLToPath(new URL('./fixtures/mini/', import.meta.url));

export function tempMini() {
  const dir = mkdtempSync(join(tmpdir(), 'specs-index-'));
  cpSync(MINI, dir, { recursive: true });
  return dir;
}

export const readJsonFile = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Changes a JSON file in place: `edit` gets the parsed data and changes it. */
export function editJson(path, edit) {
  const data = readJsonFile(path);
  edit(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export function editText(path, edit) {
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
}
