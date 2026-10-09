// A small JSON Schema validator: the subset the schemas in specs/schema/ use (no dependency, Constitution III).
// Supported: type, enum, const, pattern, minLength, format "date", required, properties, additionalProperties,
// patternProperties, propertyNames, items, uniqueItems, $ref to "#/$defs/…". Anything else in a schema is ignored, so
// add support here before using a new keyword there.
import { readFileSync } from 'node:fs';
import { schemaFile } from './paths.mjs';

const cache = new Map();

/** The schema `name` ("roadmap" | "feature") from specs/schema/. */
export function loadSchema(name) {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(schemaFile(name), 'utf8')));
  return cache.get(name);
}

/** Validates `data` against `schema`; returns errors as "/json/pointer: message", in document order. */
export function validate(schema, data) {
  const errors = [];
  check(schema, data, '', schema, errors);
  return errors;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function typeMatches(want, v) {
  const t = typeOf(v);
  return want === t || (want === 'number' && t === 'integer');
}

function resolve(s, root) {
  while (s && s.$ref) {
    const m = /^#\/\$defs\/(.+)$/.exec(s.$ref);
    if (!m || !root.$defs?.[m[1]]) throw new Error(`Unsupported $ref ${s.$ref}`);
    s = root.$defs[m[1]];
  }
  return s;
}

function check(schemaIn, v, path, root, errors) {
  const s = resolve(schemaIn, root);
  if (!s || s === true) return;
  const at = path || '/';
  const err = (msg) => errors.push(`${at}: ${msg}`);

  if (s.oneOf) {
    // Passes when a branch passes; otherwise reports the branch whose type fits the value.
    const tries = s.oneOf.map((branch) => {
      const e = [];
      check(branch, v, path, root, e);
      return { branch: resolve(branch, root), e };
    });
    if (tries.some((t) => t.e.length === 0)) return;
    const fit = tries.find((t) => t.branch.type === undefined || [t.branch.type].flat().some((ty) => typeMatches(ty, v)));
    if (fit) errors.push(...fit.e);
    else err('does not match any allowed shape');
    return;
  }

  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeMatches(t, v))) return err(`must be ${types.join(' or ')}`);
  }
  if (s.const !== undefined && v !== s.const) return err(`must be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) return err(`must be one of ${s.enum.join(', ')}`);

  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.length < s.minLength) err(`must not be empty`);
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) err(`does not match ${s.pattern}`);
    if (s.format === 'date' && !(DATE.test(v) && !Number.isNaN(Date.parse(v)))) err('is not a date (YYYY-MM-DD)');
  }

  if (Array.isArray(v)) {
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) err('has duplicate items');
    if (s.items) v.forEach((x, i) => check(s.items, x, `${path}/${i}`, root, errors));
  }

  if (typeOf(v) === 'object') {
    for (const key of s.required ?? []) if (!(key in v)) err(`missing ${key}`);
    for (const [key, value] of Object.entries(v)) {
      const p = `${path}/${key}`;
      if (s.propertyNames?.pattern && !new RegExp(s.propertyNames.pattern, 'u').test(key))
        errors.push(`${p}: name does not match ${s.propertyNames.pattern}`);
      if (s.properties && key in s.properties) {
        check(s.properties[key], value, p, root, errors);
        continue;
      }
      const pattern = Object.keys(s.patternProperties ?? {}).find((re) => new RegExp(re, 'u').test(key));
      if (pattern) check(s.patternProperties[pattern], value, p, root, errors);
      else if (s.additionalProperties === false) errors.push(`${p}: is not allowed`);
      else if (typeof s.additionalProperties === 'object') check(s.additionalProperties, value, p, root, errors);
    }
  }
}
