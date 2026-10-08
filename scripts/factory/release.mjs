// Release station (402 §7, AC-17). T070: the pure bump. T071 adds the wrapper (main and clean checks, writing the
// files, `npm version --no-git-tag-version`, the checklist, the dry run). Nothing here tags or pushes.
//
//   npm run release:prepare -- X.Y.Z [--date YYYY-MM-DD]
//
// `--test-branch <name>` lets the checks accept that branch instead of `main`, only to prove the script on a scratch
// branch (T071); off `main` the dry run is never offered.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

/** The files a release changes, as specs/release.md lists them (package-lock.json comes from `npm version`). */
export const RELEASE_FILES = ['package.json', 'public/sw.js', 'docker-compose.yml', 'plugins/chitthi/.claude-plugin/plugin.json', 'CHANGELOG.md'];

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_LINE = /^(\s*"version"\s*:\s*")([^"]*)(")/m;
const APP_CACHE = /(const APP_CACHE = '[^']*?v)(\d+)(')/;
const IMAGE_TAG = /^(\s*image:\s*chitthi-studio:)(\S+)[ \t]*$/m;
const UNRELEASED = /^## \[Unreleased\][ \t]*\n/m;
const UNRELEASED_LINK = /^\[Unreleased\]:[ \t]*(\S+?)\/compare\/\S+\.\.\.HEAD[ \t]*$/m;

/** Compares two X.Y.Z versions numerically: < 0, 0 or > 0. */
export function compareVersions(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function match(path, text, re, what) {
  const m = re.exec(text);
  if (!m) throw new Error(`${path}: ${what} not found`);
  return m;
}

/** The new CHANGELOG text: Unreleased → `## [X.Y.Z] - date`, a fresh empty Unreleased above, compare links. */
function bumpChangelog(text, current, version, date) {
  const path = 'CHANGELOG.md';
  const head = match(path, text, UNRELEASED, '"## [Unreleased]"');
  const start = head.index + head[0].length;
  const rest = text.slice(start);
  const next = /^## \[/m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest.replace(/^\[[^\]]+\]:.*$/gm, '');
  if (!body.trim()) throw new Error(`${path}: Unreleased is empty, nothing to release`);
  const esc = version.replace(/\./g, '\\.');
  if (new RegExp(`^## \\[${esc}\\]`, 'm').test(text)) throw new Error(`${path} already has a ${version} section`);
  // Keep the file's own separator between version and date ("- " today; Keep a Changelog's form).
  const sep = /^## \[\d+\.\d+\.\d+\]( [-—–] )/m.exec(text)?.[1] ?? ' - ';
  let out = `${text.slice(0, start)}\n## [${version}]${sep}${date}\n${rest}`;
  const link = UNRELEASED_LINK.exec(out);
  if (link) {
    const base = link[1];
    const lines = `[Unreleased]: ${base}/compare/v${version}...HEAD\n[${version}]: ${base}/compare/v${current}...v${version}`;
    out = out.slice(0, link.index) + lines + out.slice(link.index + link[0].length);
  }
  return out;
}

/**
 * Bumps a release to `version` (X.Y.Z, greater than the current one) dated `date` (YYYY-MM-DD).
 * `files` maps each path of RELEASE_FILES to its text; returns a new map with the new texts. Each file keeps its own
 * line endings. Throws, changing nothing, when a file is missing, a marker isn't found or the files disagree on the
 * current version.
 */
export function bumpRelease(files, version, date) {
  if (!SEMVER.test(version)) throw new Error(`version must be X.Y.Z (got ${version})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`date must be YYYY-MM-DD (got ${date})`);
  }
  const eols = {};
  const lf = {};
  for (const path of RELEASE_FILES) {
    if (typeof files[path] !== 'string') throw new Error(`${path} is missing`);
    eols[path] = files[path].includes('\r\n') ? '\r\n' : '\n';
    lf[path] = files[path].replace(/\r\n/g, '\n');
  }

  const current = JSON.parse(lf['package.json']).version;
  if (!SEMVER.test(current)) throw new Error(`package.json: current version ${current} is not X.Y.Z`);
  if (compareVersions(version, current) <= 0) throw new Error(`version must be greater than ${current} (got ${version})`);
  const plugin = 'plugins/chitthi/.claude-plugin/plugin.json';
  const seen = {
    [plugin]: JSON.parse(lf[plugin]).version,
    'docker-compose.yml': match('docker-compose.yml', lf['docker-compose.yml'], IMAGE_TAG, 'image: chitthi-studio:<tag>')[2],
  };
  for (const [path, v] of Object.entries(seen)) {
    if (v !== current) throw new Error(`${path} has version ${v}, package.json ${current}: make them agree first`);
  }

  const out = {};
  out['package.json'] = lf['package.json'].replace(VERSION_LINE, `$1${version}$3`);
  out[plugin] = lf[plugin].replace(VERSION_LINE, `$1${version}$3`);
  out['docker-compose.yml'] = lf['docker-compose.yml'].replace(IMAGE_TAG, (_, pre) => `${pre}${version}`);
  const cache = match('public/sw.js', lf['public/sw.js'], APP_CACHE, "APP_CACHE = '…v<n>'");
  out['public/sw.js'] = lf['public/sw.js'].replace(APP_CACHE, `$1${Number(cache[2]) + 1}$3`);
  out['CHANGELOG.md'] = bumpChangelog(lf['CHANGELOG.md'], current, version, date);

  // The JSON files must still parse and say the new version (the first "version" line is the top-level one).
  for (const path of ['package.json', plugin]) {
    if (JSON.parse(out[path]).version !== version) throw new Error(`${path}: the top-level "version" line was not found`);
  }
  for (const path of RELEASE_FILES) out[path] = out[path].replace(/\n/g, eols[path]);
  return out;
}

const USAGE = 'usage: npm run release:prepare -- X.Y.Z [--date YYYY-MM-DD] [--test-branch <scratch branch>]';

const today = () => new Date().toISOString().slice(0, 10);

/** The command line: one version, `--date` (default today, UTC), `--test-branch` (never `main`). */
export function parseReleaseArgs(argv) {
  const out = { version: null, date: today(), testBranch: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date' || a === '--test-branch') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(USAGE);
      if (a === '--date') out.date = v;
      else out.testBranch = v;
    } else if (!a.startsWith('-') && !out.version) out.version = a;
    else throw new Error(USAGE);
  }
  if (!out.version) throw new Error(USAGE);
  if (out.testBranch === 'main') throw new Error('--test-branch names a scratch branch, not main');
  return out;
}

/** specs/release.md's "Before tagging" steps, minus the three the script does (CHANGELOG, npm version, bumps). */
export function remainingChecklist(md) {
  const text = md.replace(/\r\n/g, '\n');
  const start = text.indexOf('\n## Before tagging');
  if (start < 0) throw new Error('specs/release.md: "## Before tagging" not found');
  const end = text.indexOf('\n## ', start + 1);
  const section = text.slice(start, end < 0 ? undefined : end);
  const items = [];
  for (const line of section.split('\n')) {
    if (/^- \[ \] /.test(line)) items.push(line.slice(6).trim());
    else if (/^\s+\S/.test(line) && items.length) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items.filter((i) => !/CHANGELOG\.md|npm version|APP_CACHE/.test(i));
}

async function askOnTerminal(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

const DRY_RUN = ['workflow', 'run', 'desktop-release.yml', '--ref', 'main'];

/**
 * Prepares release `version` in `root`: refuses unless on `main` (or `testBranch`) with a clean tree, runs
 * `npm version X.Y.Z --no-git-tag-version` (package.json and its lock file), writes the other release files from
 * `bumpRelease`, prints what is left of specs/release.md and, on `main` only, asks before the dry run. It never
 * commits, tags or pushes. `git`, `npmVersion`, `ask`, `dryRun` and `log` are seams for the tests.
 * Returns `{ from, changed, dryRun: 'ran' | 'declined' | 'skipped' }`.
 */
export async function prepareRelease({
  root = process.cwd(),
  version,
  date = today(),
  testBranch = null,
  git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }),
  npmVersion = (v) => execFileSync(`npm version ${v} --no-git-tag-version`, { cwd: root, stdio: 'inherit', shell: true }),
  ask = askOnTerminal,
  dryRun = () => execFileSync('gh', DRY_RUN, { cwd: root, stdio: 'inherit' }),
  log = console.log,
}) {
  if (!SEMVER.test(version ?? '')) throw new Error(`version must be X.Y.Z (got ${version})`);
  const allowed = testBranch ?? 'main';
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch !== allowed) throw new Error(`a release is prepared on ${allowed}, not on ${branch}`);
  const dirty = git(['status', '--porcelain']).trimEnd();
  if (dirty.trim()) throw new Error(`the working tree must be clean first:\n${dirty}`);

  const files = {};
  for (const path of RELEASE_FILES) files[path] = readFileSync(join(root, path), 'utf8');
  const from = JSON.parse(files['package.json']).version;
  const out = bumpRelease(files, version, date); // throws, nothing written, on any problem

  npmVersion(version);
  if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version !== version) {
    throw new Error(`npm version did not set package.json to ${version}`);
  }
  const changed = ['package.json'];
  if (existsSync(join(root, 'package-lock.json'))) changed.push('package-lock.json');
  for (const path of RELEASE_FILES) {
    if (path === 'package.json') continue; // npm version wrote it
    writeFileSync(join(root, path), out[path]);
    changed.push(path);
  }

  log(`Release ${version} prepared on ${branch} (was ${from}). Changed, not committed:`);
  for (const path of changed) log(`  ${path}`);
  log('');
  log('Still to do before tagging (specs/release.md):');
  const checklist = existsSync(join(root, 'specs/release.md')) ? remainingChecklist(readFileSync(join(root, 'specs/release.md'), 'utf8')) : [];
  for (const item of checklist) log(`  [ ] ${item}`);
  log('');

  let ran = 'skipped';
  if (branch !== 'main') {
    log(`Dry run not offered: not on main (--test-branch ${branch}).`);
  } else {
    const yes = await ask(`Start the dry run now (gh ${DRY_RUN.join(' ')})? It builds what is pushed to origin/main, so commit and push the release first. [y/N] `);
    if (yes) {
      dryRun();
      ran = 'ran';
    } else {
      ran = 'declined';
      log(`Dry run not started. When main is pushed: gh ${DRY_RUN.join(' ')}`);
    }
  }
  log(`Tag and publish are yours, after a green dry run: git tag v${version} && git push origin v${version}. This script never tags or pushes.`);
  return { from, changed, dryRun: ran };
}

async function main(argv) {
  try {
    const args = parseReleaseArgs(argv);
    await prepareRelease(args);
    return 0;
  } catch (e) {
    console.error(`release:prepare: ${e.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(await main(process.argv.slice(2)));
