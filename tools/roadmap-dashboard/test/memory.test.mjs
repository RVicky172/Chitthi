import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentState, latestProgress } from '../lib/memory.mjs';
import { MINI } from './helpers.mjs';

const read = (name) => readFileSync(join(MINI, 'memory', name), 'utf8');

describe('memory', () => {
  it('reads the Current State section of MEMORY.md', () => {
    expect(currentState(read('MEMORY.md'))).toEqual({
      title: 'Current State (2026-01-03)',
      markdown: '- **Phase:** basics; 102 in progress.',
    });
  });

  it('reads the newest progress entry, skipping the template in the code fence and the --- rule', () => {
    expect(latestProgress(read('progress.md'))).toEqual({
      title: '2026-01-03 — 102 T001',
      markdown: '**Done:** beta tests.\n**Next:** T002.',
    });
  });

  it('returns null when there is none', () => {
    expect(currentState('# x\n## Files\n')).toBeNull();
    expect(latestProgress('')).toBeNull();
    expect(currentState(null)).toBeNull();
  });

  it('reads CRLF files', () => {
    // The checkout may already be CRLF (core.autocrlf): normalise first, then make every line end CRLF.
    const crlf = read('MEMORY.md').replace(/\r?\n/g, '\r\n');
    expect(currentState(crlf).markdown).toBe('- **Phase:** basics; 102 in progress.');
  });
});
