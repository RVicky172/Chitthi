// Release station (402 §7, T070, AC-17): bumpRelease on frozen copies of the five files a release changes
// (fixtures/release/, taken on 2026-10-08 at 2.8.0, APP_CACHE v15). Pure: text in, text out.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RELEASE_FILES, bumpRelease, compareVersions } from './release.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = {
  'package.json': 'package.json',
  'public/sw.js': 'sw.js',
  'docker-compose.yml': 'docker-compose.yml',
  'plugins/chitthi/.claude-plugin/plugin.json': 'plugin.json',
  'CHANGELOG.md': 'CHANGELOG.md',
};

/** The fixture files keyed by their repo path, with LF endings (or CRLF when asked). */
function load(eol = '\n') {
  const files = {};
  for (const [path, name] of Object.entries(FIXTURE)) {
    files[path] = readFileSync(join(here, 'fixtures', 'release', name), 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, eol);
  }
  return files;
}

/** Lines that differ between two texts, as [before, after] pairs (same line count assumed). */
function changedLines(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  return x.map((l, i) => [l, y[i]]).filter(([l, m]) => l !== m);
}

describe('compareVersions', () => {
  it('orders X.Y.Z numerically, not as text', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBeGreaterThan(0);
    expect(compareVersions('2.8.0', '2.8.0')).toBe(0);
    expect(compareVersions('2.8.0', '2.8.1')).toBeLessThan(0);
    expect(compareVersions('3.0.0', '2.99.99')).toBeGreaterThan(0);
  });
});

describe('bumpRelease', () => {
  const date = '2026-10-20';

  it('covers exactly the files specs/release.md lists', () => {
    expect([...RELEASE_FILES].sort()).toEqual(Object.keys(FIXTURE).sort());
  });

  it('package.json: only the version line changes', () => {
    const files = load();
    const out = bumpRelease(files, '2.9.0', date);
    expect(JSON.parse(out['package.json']).version).toBe('2.9.0');
    expect(changedLines(files['package.json'], out['package.json'])).toEqual([['  "version": "2.8.0",', '  "version": "2.9.0",']]);
  });

  it('public/sw.js: APP_CACHE goes up by one, the font cache stays', () => {
    const files = load();
    const out = bumpRelease(files, '2.9.0', date);
    expect(changedLines(files['public/sw.js'], out['public/sw.js'])).toEqual([
      ["const APP_CACHE = 'chitthi-app-v15';", "const APP_CACHE = 'chitthi-app-v16';"],
    ]);
  });

  it('docker-compose.yml: the image tag', () => {
    const files = load();
    const out = bumpRelease(files, '2.9.0', date);
    expect(changedLines(files['docker-compose.yml'], out['docker-compose.yml'])).toEqual([
      ['    image: chitthi-studio:2.8.0', '    image: chitthi-studio:2.9.0'],
    ]);
  });

  it('plugin.json: only the version line changes', () => {
    const files = load();
    const p = 'plugins/chitthi/.claude-plugin/plugin.json';
    const out = bumpRelease(files, '2.9.0', date);
    expect(JSON.parse(out[p]).version).toBe('2.9.0');
    expect(changedLines(files[p], out[p])).toEqual([['  "version": "2.8.0",', '  "version": "2.9.0",']]);
  });

  it('CHANGELOG.md: Unreleased becomes the dated section, a new empty Unreleased above it, links updated', () => {
    const files = load();
    const out = bumpRelease(files, '2.9.0', date)['CHANGELOG.md'];
    const headings = out.split('\n').filter((l) => l.startsWith('## '));
    expect(headings.slice(0, 3)).toEqual(['## [Unreleased]', '## [2.9.0] - 2026-10-20', '## [2.8.0] - 2026-10-02']);
    // The new Unreleased is empty: its heading is followed directly by the release's heading.
    expect(out).toContain('## [Unreleased]\n\n## [2.9.0] - 2026-10-20\n\n### Added\n');
    // Everything that was under Unreleased is now under 2.9.0, unchanged.
    const before = files['CHANGELOG.md'];
    const body = (t, from, to) => t.slice(t.indexOf(from) + from.length, t.indexOf(to));
    expect(body(out, '## [2.9.0] - 2026-10-20', '## [2.8.0]')).toBe(body(before, '## [Unreleased]', '## [2.8.0]'));
    // Compare links: Unreleased from the new tag, the new version from the previous one.
    expect(out).toContain('[Unreleased]: https://github.com/RVicky172/Chitthi/compare/v2.9.0...HEAD\n');
    expect(out).toContain('[2.9.0]: https://github.com/RVicky172/Chitthi/compare/v2.8.0...v2.9.0\n');
    expect(out).not.toContain('compare/v2.7.0...HEAD');
    // Nothing else is touched.
    const repo = 'https://github.com/RVicky172/Chitthi';
    const expected = before
      .replace('## [Unreleased]\n', '## [Unreleased]\n\n## [2.9.0] - 2026-10-20\n')
      .replace(`[Unreleased]: ${repo}/compare/v2.7.0...HEAD\n`, `[Unreleased]: ${repo}/compare/v2.9.0...HEAD\n[2.9.0]: ${repo}/compare/v2.8.0...v2.9.0\n`);
    expect(out).toBe(expected);
  });

  it('keeps each file’s line endings (CRLF in, CRLF out)', () => {
    const files = load('\r\n');
    const out = bumpRelease(files, '2.9.0', date);
    for (const path of RELEASE_FILES) {
      expect(out[path].replace(/\r\n/g, '')).not.toContain('\n');
    }
    expect(out['CHANGELOG.md']).toContain('## [Unreleased]\r\n\r\n## [2.9.0] - 2026-10-20\r\n');
    expect(out['CHANGELOG.md']).toContain('[2.9.0]: https://github.com/RVicky172/Chitthi/compare/v2.8.0...v2.9.0\r\n');
  });

  it('does not change its input', () => {
    const files = load();
    const copy = { ...files };
    bumpRelease(files, '2.9.0', date);
    expect(files).toEqual(copy);
  });

  it('refuses a version that is not greater than the current one', () => {
    expect(() => bumpRelease(load(), '2.8.0', date)).toThrow(/greater than 2\.8\.0/);
    expect(() => bumpRelease(load(), '2.7.9', date)).toThrow(/greater than 2\.8\.0/);
    expect(() => bumpRelease(load(), '2.10.0', date)).not.toThrow();
  });

  it('refuses a malformed version or date', () => {
    expect(() => bumpRelease(load(), 'v2.9.0', date)).toThrow(/X\.Y\.Z/);
    expect(() => bumpRelease(load(), '2.9', date)).toThrow(/X\.Y\.Z/);
    expect(() => bumpRelease(load(), '2.9.0-beta.1', date)).toThrow(/X\.Y\.Z/);
    expect(() => bumpRelease(load(), '2.9.0', '20/10/2026')).toThrow(/YYYY-MM-DD/);
  });

  it('refuses when the files disagree on the current version', () => {
    const files = load();
    files['docker-compose.yml'] = files['docker-compose.yml'].replace('chitthi-studio:2.8.0', 'chitthi-studio:2.7.0');
    expect(() => bumpRelease(files, '2.9.0', date)).toThrow(/docker-compose\.yml.*2\.7\.0/);
  });

  it('refuses when a file is missing or its marker is not found', () => {
    const files = load();
    delete files['public/sw.js'];
    expect(() => bumpRelease(files, '2.9.0', date)).toThrow(/public\/sw\.js/);
    const f2 = load();
    f2['public/sw.js'] = f2['public/sw.js'].replace('APP_CACHE', 'CACHE_NAME');
    expect(() => bumpRelease(f2, '2.9.0', date)).toThrow(/APP_CACHE/);
  });

  it('refuses a release with nothing under Unreleased, or when that version already has a section', () => {
    const once = bumpRelease(load(), '2.9.0', date);
    expect(() => bumpRelease(once, '2.9.1', date)).toThrow(/Unreleased is empty/);
    const files = load();
    files['CHANGELOG.md'] = files['CHANGELOG.md'].replace('## [2.8.0] - 2026-10-02', '## [2.8.0] - 2026-10-02\n\n## [2.9.0] - 2026-10-03');
    expect(() => bumpRelease(files, '2.9.0', date)).toThrow(/already has a 2\.9\.0 section/);
  });
});
