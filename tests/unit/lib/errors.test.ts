import { describe, expect, it } from 'vitest';

/*
 * Definition of Done item 9 (specs/constitution.md): an error the app catches and shows to the user is also recorded
 * with logError('handled', e), so the copied error report can explain the message. This reads the app's own source
 * and lists every catch block that shows a message (a toast, or an error put into a dialog's state) without logging.
 */
const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/dev/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const SHOWS = /\b(toast|setError|setMsg|setStatus)\(/;

/**
 * Each catch block's body, with the line it starts on.
 * @param src the source text
 * @returns the catch blocks
 */
function catchBlocks(src: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = [];
  for (const match of src.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{/g)) {
    let cursor = match.index + match[0].length;
    let depth = 1;
    while (depth && cursor < src.length) {
      if (src[cursor] === '{') depth++;
      else if (src[cursor] === '}') depth--;
      cursor++;
    }
    out.push({
      line: src.slice(0, match.index).split('\n').length,
      body: src.slice(match.index + match[0].length, cursor - 1),
    });
  }
  return out;
}

describe('shown errors are logged', () => {
  it('reads the app source', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });

  it('every catch block that shows a message also calls logError', () => {
    const missing = Object.entries(sources).flatMap(([file, src]) =>
      catchBlocks(src)
        .filter((catchBlock) => SHOWS.test(catchBlock.body) && !catchBlock.body.includes('logError('))
        .map((frame) => `${file.replace(/^\//, '')}:${frame.line}`),
    );
    expect(missing).toEqual([]);
  });
});
