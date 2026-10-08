// Release station (402 §7, AC-17). T070: the pure bump. T071 adds the wrapper (main and clean checks, writing the
// files, `npm version --no-git-tag-version`, the checklist, the dry run). Nothing here tags or pushes.

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
