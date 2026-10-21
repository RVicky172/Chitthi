import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * 501 AC-3: the panel parts (panel header, folding section, list row, empty state) exist once, in
 * src/components/panel, and both studios use them; the media studio keeps no copies of its own.
 */

const COMPONENTS = path.join('src', 'components');
/** The folders whose panels must use the shared parts. */
const PANEL_FOLDERS = ['studio', 'ig', 'panes'];

/** A use of a shared part's markup kept on purpose, with the reason. */
interface Exception {
  /** The file, relative to src/components, with forward slashes. */
  file: string;
  rule: 'title' | 'empty state' | 'fold toggle';
  reason: string;
}
const EXCEPTIONS: readonly Exception[] = Object.freeze<Exception[]>([
  { file: 'studio/Dialog.tsx', rule: 'title', reason: 'a dialog titles itself; it is not a panel' },
  { file: 'studio/KeyframeLane.tsx', rule: 'fold toggle', reason: 'expands a timeline lane into rows, not a panel section' },
  { file: 'studio/TrackHead.tsx', rule: 'fold toggle', reason: 'menu buttons (aria-haspopup) for a track, not a panel section' },
]);

/** What each rule looks for in a component's source. */
const RULES: Record<Exception['rule'], RegExp> = {
  title: /<h2[\s>]/,
  'empty state': /\bmst-empty\b/,
  'fold toggle': /aria-expanded/,
};

/**
 * The .tsx files under a folder of src/components, as paths relative to src/components.
 * @param folder the folder's name
 * @returns the files, with forward slashes
 */
function filesIn(folder: string): string[] {
  const root = path.join(COMPONENTS, folder);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `${folder}/${file.split(path.sep).join('/')}`);
}

/**
 * A component's source.
 * @param file its path relative to src/components
 * @returns its text
 */
const source = (file: string) => fs.readFileSync(path.join(COMPONENTS, file), 'utf8');

/**
 * Whether a file imports from the shared panel parts.
 * @param file its path relative to src/components
 * @param name the part it must import
 * @returns true when an import from …/panel names it
 */
function importsPart(file: string, name: string): boolean {
  const imports = source(file).match(/import\s*\{[^}]*\}\s*from\s*'[^']*\/panel(?:\/[^']*)?'/g) ?? [];
  return imports.some((line) => new RegExp(`\\b${name}\\b`).test(line));
}

const panelFiles = PANEL_FOLDERS.flatMap(filesIn);

describe('the panel parts are shared (501 AC-3)', () => {
  it('finds the panel components', () => {
    expect(panelFiles.length).toBeGreaterThan(20);
  });

  it.each(Object.keys(RULES) as Exception['rule'][])('no panel component has its own %s', (rule) => {
    const allowed = new Set(EXCEPTIONS.filter((entry) => entry.rule === rule).map((entry) => entry.file));
    const found = panelFiles.filter((file) => !allowed.has(file) && RULES[rule].test(source(file)));
    expect(found).toEqual([]);
  });

  it('every exception has a reason and is still needed', () => {
    for (const entry of EXCEPTIONS) {
      expect(entry.reason.length).toBeGreaterThan(10);
      expect({ entry, matches: RULES[entry.rule].test(source(entry.file)) }).toEqual({ entry, matches: true });
    }
  });

  it('common.tsx no longer holds the folding section', () => {
    expect(source('common.tsx')).not.toMatch(/export function (?:Section|revealSection)\b/);
  });

  it.each([
    ['common.tsx', 'PanelHeader'],
    ['studio/Shell.tsx', 'PanelHeader'],
    ['studio/PhotoPanels.tsx', 'EmptyState'],
    ['studio/VideoPanels.tsx', 'EmptyState'],
    ['studio/ProjectsPanel.tsx', 'ListRow'],
    ['ig/LayerList.tsx', 'ListRow'],
    ['FeatureFinder.tsx', 'revealSection'],
  ])('%s uses %s from components/panel', (file, part) => {
    expect(importsPart(file, part)).toBe(true);
  });

  // The shell's PanelHeader shows the rail item's label, so a panel's own heading repeating it goes (501 T023).
  it.each([
    ['studio/VideoPanels.tsx', 'Add media'],
    ['studio/PhotoPanels.tsx', 'Add photos'],
    ['ig/LayerPanel.tsx', 'Add text'],
    ['ig/LayerList.tsx', 'Layers'],
    ['studio/TransitionPanel.tsx', 'Transitions'],
    ['studio/AudioPanel.tsx', 'Sound'],
    ['ig/MaskPanel.tsx', 'Masks'],
  ])('%s drops its panel title "%s"', (file, title) => {
    expect(source(file)).not.toMatch(new RegExp(`<h3>${title}(?:<| \\{)`));
  });
});
