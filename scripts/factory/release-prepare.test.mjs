// Release station wrapper (402 §7, T071, AC-17): `npm run release:prepare -- X.Y.Z`. The checks run against a fake
// git; the scratch-branch run builds a real git repo from the committed release files, runs the wrapper on a
// scratch branch (the `main` check overridden by --test-branch), diffs every file, and throws the repo away.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RELEASE_FILES, parseReleaseArgs, prepareRelease, remainingChecklist } from './release.mjs';

const ROOT = join(import.meta.dirname, '../..');
const DATE = '2026-10-20';

/** A fake git: answers `rev-parse --abbrev-ref HEAD` and `status --porcelain`. */
function fakeGit({ branch = 'main', status = '' } = {}) {
  return (args) => {
    if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') return `${branch}\n`;
    if (args[0] === 'status') return status;
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

/**
 * A committed file as the tests' copy of it. Right after a release the real CHANGELOG's Unreleased is empty (the
 * wrapper then refuses, correctly), so the copy always gets one entry: the tests don't depend on pending changes.
 */
function committed(path) {
  const text = execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (path !== 'CHANGELOG.md') return text;
  return text.replace(/^## \[Unreleased\](\r?\n)/m, (head, nl) => `${head}${nl}- A change for the release tests.${nl}`);
}

const quiet = { log: () => {} };
const never = (what) => () => {
  throw new Error(`${what} must not be called`);
};

describe('parseReleaseArgs', () => {
  it('takes the version, an optional --date and the --test-branch flag', () => {
    expect(parseReleaseArgs(['2.9.0'])).toMatchObject({ version: '2.9.0', testBranch: null });
    expect(parseReleaseArgs(['2.9.0', '--date', '2026-10-20', '--test-branch', 'scratch/r'])).toMatchObject({
      version: '2.9.0',
      date: '2026-10-20',
      testBranch: 'scratch/r',
    });
    expect(parseReleaseArgs(['2.9.0']).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refuses no version, two versions, unknown flags and --test-branch main', () => {
    expect(() => parseReleaseArgs([])).toThrow(/usage/i);
    expect(() => parseReleaseArgs(['2.9.0', '2.9.1'])).toThrow(/usage/i);
    expect(() => parseReleaseArgs(['2.9.0', '--yes'])).toThrow(/usage/i);
    expect(() => parseReleaseArgs(['2.9.0', '--test-branch'])).toThrow(/usage/i);
    expect(() => parseReleaseArgs(['2.9.0', '--test-branch', 'main'])).toThrow(/test-branch/);
  });
});

describe('remainingChecklist', () => {
  it("lists specs/release.md's steps before tagging, minus the ones the script did", () => {
    const items = remainingChecklist(readFileSync(join(ROOT, 'specs/release.md'), 'utf8'));
    const text = items.join('\n');
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(text).toMatch(/Definition-of-Done/);
    expect(text).toMatch(/desktop:pack/);
    expect(text).toMatch(/dry run/);
    expect(text).not.toMatch(/APP_CACHE|npm version|move \*\*Unreleased\*\*/);
  });
});

describe('prepareRelease checks (nothing written)', () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'factory-release-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const base = () => ({ root: dir, version: '9.9.9', date: DATE, testBranch: null, npmVersion: never('npm version'), ask: never('ask'), dryRun: never('dry run'), ...quiet });

  it('refuses a branch other than main', async () => {
    await expect(prepareRelease({ ...base(), git: fakeGit({ branch: 'feat/402-x' }) })).rejects.toThrow(/main.*feat\/402-x/);
  });

  it('refuses main when the test flag names another branch', async () => {
    await expect(prepareRelease({ ...base(), testBranch: 'scratch/r', git: fakeGit({ branch: 'main' }) })).rejects.toThrow(/scratch\/r/);
  });

  it('refuses a tree with changes', async () => {
    await expect(prepareRelease({ ...base(), git: fakeGit({ status: ' M src/App.tsx\n' }) })).rejects.toThrow(/clean/);
  });

  it('refuses a malformed version before looking at git', async () => {
    await expect(prepareRelease({ ...base(), version: 'v9.9.9', git: never('git') })).rejects.toThrow(/X\.Y\.Z/);
  });
});

describe('scratch-branch run on the committed release files (AC-17)', () => {
  let repo;
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  const tracked = [...RELEASE_FILES, 'package-lock.json', 'specs/release.md'];
  let before;
  let result;
  let asked;
  const lines = [];

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'factory-release-repo-'));
    git('init', '-q', '-b', 'main');
    for (const [k, v] of [['user.name', 'test'], ['user.email', 'test@example.com'], ['commit.gpgsign', 'false'], ['tag.gpgsign', 'false'], ['core.hooksPath', join(repo, '.no-hooks')], ['core.autocrlf', 'false']]) git('config', k, v);
    before = {};
    for (const path of tracked) {
      const text = committed(path);
      before[path] = text;
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), text);
    }
    git('add', '-A');
    git('commit', '-q', '-m', 'release files');
    git('checkout', '-q', '-b', 'scratch/release');
    asked = 0;
    result = await prepareRelease({
      root: repo,
      version: '9.9.9',
      date: DATE,
      testBranch: 'scratch/release',
      ask: async () => (asked++, true),
      dryRun: never('dry run'),
      log: (l) => lines.push(l),
    });
  }, 120_000);
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('changes exactly the five files and the lock file, commits and tags nothing', () => {
    const changed = git('diff', '--name-only').trim().split('\n').sort();
    expect(changed).toEqual([...RELEASE_FILES, 'package-lock.json'].sort());
    expect(result.changed.sort()).toEqual(changed);
    expect(git('tag').trim()).toBe('');
    expect(git('rev-list', '--count', 'HEAD').trim()).toBe('1');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('scratch/release');
  });

  it('every file says the new version', () => {
    const read = (p) => readFileSync(join(repo, p), 'utf8');
    const old = JSON.parse(before['package.json']).version;
    expect(JSON.parse(read('package.json')).version).toBe('9.9.9');
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe('9.9.9');
    expect(lock.packages[''].version).toBe('9.9.9');
    expect(JSON.parse(read('plugins/chitthi/.claude-plugin/plugin.json')).version).toBe('9.9.9');
    expect(read('docker-compose.yml')).toMatch(/image:\s*chitthi-studio:9\.9\.9\s*$/m);
    const cache = (t) => Number(/const APP_CACHE = '[^']*?v(\d+)'/.exec(t)[1]);
    expect(cache(read('public/sw.js'))).toBe(cache(before['public/sw.js']) + 1);
    const log = read('CHANGELOG.md');
    expect(log).toMatch(/^## \[Unreleased\]\r?\n\r?\n## \[9\.9\.9\] - 2026-10-20$/m);
    expect(log).toContain(`/compare/v${old}...v9.9.9`);
  });

  it('only the version lines change in package.json and the lock file', () => {
    const diff = (p) =>
      git('diff', '-U0', '--', p)
        .split('\n')
        .filter((l) => /^[-+](?![-+])/.test(l));
    expect(diff('package.json')).toEqual([expect.stringMatching(/^-\s*"version"/), expect.stringMatching(/^\+\s*"version": "9\.9\.9"/)]);
    expect(diff('package-lock.json').every((l) => /"version"/.test(l))).toBe(true);
    expect(diff('package-lock.json')).toHaveLength(4);
  });

  it('prints the remaining checklist and never offers the dry run off main', () => {
    const out = lines.join('\n');
    expect(out).toMatch(/desktop:pack/);
    expect(out).toMatch(/dry run.*not on main/i);
    expect(out).toMatch(/git tag v9\.9\.9/);
    expect(asked).toBe(0);
    expect(result.dryRun).toBe('skipped');
  });
});

describe('the dry run on main', () => {
  /** Runs the wrapper on main (fake git, fake npm) in a fresh copy of the files; returns its result and the runs. */
  async function onMain(answer) {
    const dir = mkdtempSync(join(tmpdir(), 'factory-release-main-'));
    try {
      for (const path of RELEASE_FILES) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), committed(path));
      }
      const pkg = () => writeFileSync(join(dir, 'package.json'), readFileSync(join(dir, 'package.json'), 'utf8').replace(/"version": "[^"]*"/, '"version": "9.9.9"'));
      const runs = [];
      const questions = [];
      const result = await prepareRelease({
        root: dir,
        version: '9.9.9',
        date: DATE,
        testBranch: null,
        git: fakeGit(),
        npmVersion: pkg,
        ask: async (q) => (questions.push(q), answer),
        dryRun: () => runs.push('gh'),
        ...quiet,
      });
      return { result, runs, questions };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('asks once; runs only after a yes, and is reported as declined otherwise', async () => {
    const no = await onMain(false);
    expect(no.questions).toHaveLength(1);
    expect(no.questions[0]).toMatch(/desktop-release\.yml/);
    expect(no.result.dryRun).toBe('declined');
    expect(no.runs).toEqual([]);
    const yes = await onMain(true);
    expect(yes.result.dryRun).toBe('ran');
    expect(yes.runs).toEqual(['gh']);
  });
});
