#!/usr/bin/env node
/*
 * Licence gate for everything Chitthi ships (policy: specs/licensing.md). Walks the dependency tree of the packages that
 * reach users: the desktop app's `dependencies` and the libraries Vite bundles into dist/ (listed in BUNDLED below, as
 * they are devDependencies). Every package must have a licence on the allowed list, or an approved exception. It also
 * fails when app code imports a package that is in neither list, so a new bundled library can't skip the check.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Libraries Vite bundles into the web app (devDependencies, but shipped to every browser). Add new ones here. */
const BUNDLED = ['react', 'react-dom', 'jspdf', 'lucide-react', 'mediabunny', '@anthropic-ai/sdk', 'onnxruntime-web'];

/** Permissive licences: allowed without review (keep their notices). SPDX identifiers. */
const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Zlib', 'BlueOak-1.0.0', 'Unlicense', 'CC0-1.0', 'Python-2.0']);

/**
 * Packages approved under a weak-copyleft or unusual licence, after review. Each needs a row in the exceptions table
 * of specs/licensing.md saying how its terms are met. The value is the licence string the package declares.
 */
const EXCEPTIONS = {
  mediabunny: 'MPL-2.0', // used unmodified from npm; source link in THIRD_PARTY_NOTICES.md
};

/** Imports that are not packages Chitthi ships: Node and Electron built-ins, and test / build tools. */
const NOT_SHIPPED = /^(node:|electron$|vite$|vitest$)/;

const root = process.cwd();
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const fails = [];

function find(name, from) {
  for (let d = from; ; d = dirname(d)) {
    const p = join(d, 'node_modules', name, 'package.json');
    if (existsSync(p)) return p;
    if (dirname(d) === d) return null;
  }
}

/** True when an SPDX expression is satisfied by the allowed list: OR needs one side, AND needs both. */
function allowed(expr) {
  const e = expr.trim().replace(/^\((.*)\)$/, '$1');
  if (/ OR /.test(e)) return e.split(/ OR /).some(allowed);
  if (/ AND /.test(e)) return e.split(/ AND /).every(allowed);
  return ALLOWED.has(e);
}

const licenceOf = (j) =>
  typeof j.license === 'string' ? j.license : (j.license?.type ?? (Array.isArray(j.licenses) ? j.licenses.map((l) => l.type ?? l).join(' OR ') : ''));

const seen = new Map();
function walk(name, from, via) {
  const p = find(name, from);
  if (!p) return; // optional dependency not installed on this OS
  if (seen.has(p)) return;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const lic = licenceOf(j);
  seen.set(p, lic);
  if (EXCEPTIONS[j.name] !== undefined) {
    if (EXCEPTIONS[j.name] !== lic) fails.push(`${j.name}@${j.version}: licence changed to "${lic}" (approved: ${EXCEPTIONS[j.name]}); review it again`);
  } else if (!lic) fails.push(`${j.name}@${j.version} (via ${via}): no licence declared`);
  else if (!allowed(lic)) fails.push(`${j.name}@${j.version} (via ${via}): "${lic}" is not on the allowed list; see specs/licensing.md`);
  for (const d of Object.keys({ ...j.dependencies, ...j.optionalDependencies })) walk(d, dirname(p), via);
}

for (const name of [...Object.keys(pkg.dependencies ?? {}), ...BUNDLED]) {
  if (!find(name, root)) fails.push(`${name} is listed as shipped but not installed (run npm ci)`);
  walk(name, root, name);
}

// Every package the app or the Electron main process imports must be one the walk above covered.
const shipped = new Set([...Object.keys(pkg.dependencies ?? {}), ...BUNDLED]);
const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
function scan(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) scan(p);
    else if (/\.(ts|tsx|cjs|mjs|js)$/.test(f) && !/\.(test|d)\.ts$/.test(f)) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/(?:from\s+|import\(\s*|require\(\s*)'([^.'/][^']*)'/g)) {
        const name = pkgName(m[1]);
        if (!NOT_SHIPPED.test(m[1]) && !shipped.has(name)) fails.push(`${p} imports "${name}", which is not in dependencies or BUNDLED in scripts/check-licenses.mjs`);
      }
    }
  }
}
scan('src');
scan('electron');

if (fails.length) {
  console.error(`check-licenses failed:\n  ${[...new Set(fails)].join('\n  ')}`);
  process.exit(1);
}
console.log(`check-licenses: ${seen.size} shipped packages, all on the allowed list (${Object.keys(EXCEPTIONS).length} approved exception).`);
