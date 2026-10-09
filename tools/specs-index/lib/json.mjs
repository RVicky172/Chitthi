// Reading and writing the data files. Writes are atomic (temp file + rename), so a crash never leaves half a file.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

/** Reads a text file; returns null when it doesn't exist. */
export function readText(path, read = (p) => readFileSync(p, 'utf8')) {
  try {
    return read(path);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** Reads and parses a JSON file: { data } or { error: 'missing' | 'invalid JSON (…)' }. */
export function readJson(path, read) {
  const text = readText(path, read);
  if (text === null) return { data: null, error: 'missing' };
  try {
    return { data: JSON.parse(text), error: null };
  } catch (e) {
    return { data: null, error: `invalid JSON (${e.message})` };
  }
}

export function writeText(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** Two-space JSON with a final newline, keys in the order they were inserted. */
export const formatJson = (data) => JSON.stringify(data, null, 2) + '\n';

export const writeJson = (path, data) => writeText(path, formatJson(data));
