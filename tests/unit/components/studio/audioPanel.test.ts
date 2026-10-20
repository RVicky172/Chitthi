import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * 505 §5 (AC-3, D1, D3, D4): the Audio panel's sections, read from its source: Add sound, Record voice, Recordings,
 * Tracks and Loudness, in that order; Record voice opens the microphone only when the user opens it and is never the
 * default.
 */

const source = fs.readFileSync(path.join('src', 'components', 'studio', 'AudioPanel.tsx'), 'utf8');

/**
 * A component's source: from its declaration to the next top-level declaration.
 * @param name the component
 * @returns its text
 */
function componentSource(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  const next = source.slice(start + 1).search(/\n(?:export )?(?:function|const) /);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

/** The components AudioPanel renders, in order. */
const parts = [...componentSource('AudioPanel').matchAll(/<([A-Z]\w*)\b/g)].map((match) => match[1]);

/**
 * The FoldSection a component renders.
 * @param name the component
 * @returns the FoldSection's opening tag
 */
const sectionOf = (name: string): string => /<FoldSection\b[^>]*>/.exec(componentSource(name))?.[0] ?? '';

describe('the Audio panel’s sections (AC-3)', () => {
  it('renders Add sound, Record voice, Recordings, Tracks and Loudness, in that order (D1, D3)', () => {
    const ids = parts.map((part) => /id="([^"]+)"/.exec(sectionOf(part))?.[1]).filter(Boolean);
    expect(ids).toEqual(['audio.add', 'audio.record', 'audio.takes', 'audio.tracks', 'audio.loudness']);
  });

  it('names the sections', () => {
    const titles = parts.map((part) => /title="([^"]+)"/.exec(sectionOf(part))?.[1]).filter(Boolean);
    expect(titles).toEqual(['Add sound', 'Record voice', 'Recordings', 'Tracks', 'Loudness']);
  });

  it('opens the microphone from the user’s own open, closes it on closing, and isn’t the default (D4)', () => {
    const record = sectionOf(parts.find((part) => sectionOf(part).includes('id="audio.record"')) ?? '');
    expect(record).toMatch(/onOpened=\{/);
    expect(record).toMatch(/onClosed=\{/);
    expect(record).toMatch(/defaultOpen=\{false\}/);
  });
});
