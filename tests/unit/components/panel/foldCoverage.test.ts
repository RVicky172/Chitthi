import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * 503 AC-3: every studio panel and inspector with more than one section folds them with FoldSection, one open at a
 * time. A section title of a panel's own (an <h3>) means a section that does not fold; the few kept on purpose are
 * listed with the reason.
 */

const COMPONENTS = path.join('src', 'components');
/** The folders whose panels and inspectors must fold their sections. */
const PANEL_FOLDERS = ['studio', 'ig', 'panes'];

/** A section title kept on purpose, with the reason. */
interface Exception {
  /** The file, relative to src/components, with forward slashes. */
  file: string;
  /** The title's text as written in the source (tags and spaces collapsed); '*' for every title in the file. */
  heading: string;
  reason: string;
}
const EXCEPTIONS: readonly Exception[] = Object.freeze<Exception[]>([
  { file: 'studio/PhotoExport.tsx', heading: '*', reason: 'the export dialog, not a panel: its few settings stay in view' },
  { file: 'studio/VideoExport.tsx', heading: '*', reason: 'the export dialog, not a panel: its few settings stay in view' },
  { file: 'studio/ClipInspector.tsx', heading: 'Project', reason: 'the project inspector has one section, which stays plain' },
  { file: 'studio/TransitionPanel.tsx', heading: 'Cut', reason: 'the inspector of a cut without a transition has one section' },
  {
    file: 'studio/TransitionPanel.tsx',
    heading: '{TRANSITION_NAMES[transition.kind]}',
    reason: 'the transition inspector has one section, titled with its kind',
  },
  { file: 'ig/LayerPanel.tsx', heading: 'Brush', reason: 'the Draw panel has one titled section, the brush' },
  { file: 'ig/MaskPanel.tsx', heading: '{mask.name}', reason: 'the mask inspector has one section, titled with the mask' },
]);

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
 * The section titles a component writes itself.
 * @param file its path relative to src/components
 * @returns each <h3>'s text, tags removed and spaces collapsed
 */
function headingsIn(file: string): string[] {
  // Each '<h3' up to its '</h3>', past the opening tag's '>'.
  return source(file)
    .split(/<h3(?=[\s>])/)
    .slice(1)
    .map((rest) => {
      const inner = rest.slice(rest.indexOf('>') + 1, rest.indexOf('</h3>'));
      // Tags inside the title (a label, a component) removed: the text after each '<…>'.
      const text = inner
        .split('<')
        .map((part, index) => (index === 0 ? part : part.slice(part.indexOf('>') + 1)))
        .join(' ');
      return text.replace(/\s+/g, ' ').trim();
    });
}

/**
 * Whether a title is kept on purpose.
 * @param file the component
 * @param heading the title
 * @returns true when an exception names it
 */
const excused = (file: string, heading: string) =>
  EXCEPTIONS.some((entry) => entry.file === file && (entry.heading === '*' || entry.heading === heading));

const panelFiles = PANEL_FOLDERS.flatMap(filesIn);

describe('studio panels fold their sections (503 AC-3)', () => {
  it('finds the panel components', () => {
    expect(panelFiles.length).toBeGreaterThan(20);
  });

  it('no panel or inspector titles a section of its own', () => {
    const found = panelFiles.flatMap((file) => headingsIn(file).filter((heading) => !excused(file, heading)).map((heading) => `${file}: ${heading}`));
    expect(found).toEqual([]);
  });

  it('every exception has a reason and is still needed', () => {
    for (const entry of EXCEPTIONS) {
      expect(entry.reason.length).toBeGreaterThan(10);
      const headings = headingsIn(entry.file);
      const needed = entry.heading === '*' ? headings.length > 0 : headings.includes(entry.heading);
      expect({ entry, needed }).toEqual({ entry, needed: true });
    }
  });

  it('the shell puts its panel and its inspector in a FoldGroup each', () => {
    const shell = source('studio/Shell.tsx');
    expect(shell).toMatch(/<FoldGroup[^>]*id=\{[^}]*\}[^>]*>\s*\{panel\}/);
    expect(shell).toMatch(/<FoldGroup[^>]*id=\{[^}]*\}[^>]*>\s*\{inspector\}/);
  });

  it('a print step is one FoldGroup with Collapse all and no Expand all (Q1)', () => {
    const common = source('common.tsx');
    expect(common).toMatch(/<FoldGroup id=\{group\}>/);
    expect(common).toContain('Collapse all');
    expect(common).not.toContain('Expand all');
  });
});
