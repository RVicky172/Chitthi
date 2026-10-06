import { describe, expect, it } from 'vitest';

/*
 * Definition of Done item 9 (specs/constitution.md): an error the app catches and shows to the user is also recorded
 * with logError('handled', e), so the copied error report can explain the message. This reads the app's own source
 * and lists every catch block that shows a message (a toast, or an error put into a dialog's state) without logging.
 */
const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.ts', '!../dev/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const SHOWS = /\b(toast|setError|setMsg|setStatus)\(/;

/** Each catch block's body, with the line it starts on. */
function catchBlocks(src: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = [];
  for (const m of src.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth && i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    out.push({ line: src.slice(0, m.index).split('\n').length, body: src.slice(m.index + m[0].length, i - 1) });
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
        .filter((b) => SHOWS.test(b.body) && !b.body.includes('logError('))
        .map((b) => `${file.replace('../', 'src/')}:${b.line}`),
    );
    expect(missing).toEqual([]);
  });
});
