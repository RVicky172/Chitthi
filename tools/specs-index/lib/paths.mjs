// Where the spec data lives. Every function takes the repository root, so tests can point at a fixture.
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This repository's root (tools/specs-index/lib → ../../..). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const FEATURE_FILE = 'feature.json';
/** A feature folder: three digits, a dash and a kebab-case name. */
export const FOLDER_RE = /^(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const roadmapJson = (root) => join(root, 'specs', 'roadmap.json');
export const roadmapMd = (root) => join(root, 'specs', 'roadmap.md');
export const featuresDir = (root) => join(root, 'specs', 'features');
export const featureDir = (root, folder) => join(featuresDir(root), folder);
export const memoryFile = (root, name) => join(root, 'memory', name);
/** Schemas always come from this repository, whatever root is checked. */
export const schemaFile = (name) => join(REPO_ROOT, 'specs', 'schema', `${name}.schema.json`);
export const templateFile = (name) => join(REPO_ROOT, 'specs', 'templates', name);

/** A path relative to root with forward slashes, for messages. */
export const rel = (root, path) => relative(root, path).split(sep).join('/');
