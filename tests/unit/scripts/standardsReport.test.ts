import { describe, expect, it } from 'vitest';
import {
  UNCHECKED_INDEX,
  folderOf,
  formatTable,
  groupOf,
  lintFindings,
  summarize,
  uncheckedIndexFindings,
} from '../../../scripts/standards-report.mjs';

/** The repo's folder in the fixtures. */
const ROOT = '/repo';

/** A fixture of ESLint's `--format json` output: standards rules, an old-gate rule and a parse error (no rule). */
const LINT_OUTPUT = [
  {
    filePath: '/repo/src/engine/keyframes.ts',
    messages: [
      { ruleId: 'id-length' },
      { ruleId: 'id-length' },
      { ruleId: 'jsdoc/require-jsdoc' },
      { ruleId: 'prefer-const' },
    ],
  },
  {
    filePath: '/repo/src/engine/gpu/blur.ts',
    messages: [{ ruleId: 'sonarjs/cognitive-complexity' }, { ruleId: null }],
  },
  { filePath: '/repo/src/components/studio/Timeline.tsx', messages: [{ ruleId: 'react-hooks/exhaustive-deps' }] },
  { filePath: '/repo/src/state/video.ts', messages: [] },
];

/** A fixture of `tsc --pretty false` output: two errors (one with continuation lines) and a summary line. */
const COMPILER_OUTPUT = [
  "src/agent/photoTools.ts(218,19): error TS2345: Argument of type '(Mask | undefined)[]' is not assignable.",
  "  Type 'Mask | undefined' is not assignable to type 'Mask'.",
  "    Type 'undefined' is not assignable to type 'Mask'.",
  "src/engine/keyframes.ts(12,5): error TS2532: Object is possibly 'undefined'.",
  '',
  'Found 2 errors in 2 files.',
].join('\r\n');

describe('standards report (407 plan §1)', () => {
  it('names a file by its folder, relative to the repo', () => {
    expect(folderOf('/repo/src/engine/gpu/blur.ts', ROOT)).toBe('src/engine/gpu');
    expect(folderOf('src/agent/photoTools.ts', '.')).toBe('src/agent');
    expect(folderOf('/repo/eslint.config.js', ROOT)).toBe('.');
  });

  it('counts only the standards rules in the lint output', () => {
    expect(lintFindings(LINT_OUTPUT, ROOT)).toEqual([
      { folder: 'src/engine', rule: 'id-length' },
      { folder: 'src/engine', rule: 'id-length' },
      { folder: 'src/engine', rule: 'jsdoc/require-jsdoc' },
      { folder: 'src/engine/gpu', rule: 'sonarjs/cognitive-complexity' },
      { folder: 'src/components/studio', rule: 'react-hooks/exhaustive-deps' },
    ]);
  });

  it('counts each compiler error once, not its continuation lines', () => {
    expect(uncheckedIndexFindings(COMPILER_OUTPUT, '.')).toEqual([
      { folder: 'src/agent', rule: UNCHECKED_INDEX },
      { folder: 'src/engine', rule: UNCHECKED_INDEX },
    ]);
  });

  it('sums per folder and rule, folders sorted', () => {
    const report = summarize([...lintFindings(LINT_OUTPUT, ROOT), ...uncheckedIndexFindings(COMPILER_OUTPUT, '.')]);
    expect(report.total).toBe(7);
    expect(report.rules).toEqual({
      'id-length': 2,
      'jsdoc/require-jsdoc': 1,
      'sonarjs/cognitive-complexity': 1,
      'react-hooks/exhaustive-deps': 1,
      [UNCHECKED_INDEX]: 2,
    });
    expect(Object.keys(report.folders)).toEqual(['src/agent', 'src/components/studio', 'src/engine', 'src/engine/gpu']);
    expect(report.folders['src/engine']).toEqual({
      total: 4,
      rules: { 'id-length': 2, 'jsdoc/require-jsdoc': 1, [UNCHECKED_INDEX]: 1 },
    });
  });

  it('keeps only a folder and its subfolders when asked', () => {
    const findings = [...lintFindings(LINT_OUTPUT, ROOT), ...uncheckedIndexFindings(COMPILER_OUTPUT, '.')];
    const report = summarize(findings, 'src/engine/');
    expect(Object.keys(report.folders)).toEqual(['src/engine', 'src/engine/gpu']);
    expect(report.total).toBe(5);
    expect(summarize(findings, 'src/eng').total).toBe(0);
  });

  it('groups rules into one column per standard, in the standards’ order', () => {
    expect(groupOf('id-length')).toBe('names');
    expect(groupOf('jsdoc/require-param')).toBe('jsdoc');
    expect(groupOf('sonarjs/cognitive-complexity')).toBe('complexity');
    expect(groupOf('sonarjs/no-nested-conditional')).toBe('sonar other');
    expect(groupOf(UNCHECKED_INDEX)).toBe('unchecked index');
    const findings = [
      ...lintFindings(LINT_OUTPUT, ROOT),
      { folder: 'src/engine', rule: 'jsdoc/require-param' },
      { folder: 'src/engine/gpu', rule: 'sonarjs/no-nested-conditional' },
    ];
    expect(formatTable(summarize(findings, 'src/engine')).split('\n')).toEqual([
      'folder          names  jsdoc  complexity  sonar other  total',
      'src/engine          2      2           0            0      4',
      'src/engine/gpu      0      0           1            1      2',
      'total               2      2           1            1      6',
    ]);
  });

  it('prints one column per rule when asked, or one line when there is nothing to fix', () => {
    const table = formatTable(summarize(lintFindings(LINT_OUTPUT, ROOT), 'src/engine'), { byRule: true });
    expect(table.split('\n')).toEqual([
      'folder          id-length  jsdoc/require-jsdoc  sonarjs/cognitive-complexity  total',
      'src/engine              2                    1                             0      3',
      'src/engine/gpu          0                    0                             1      1',
      'total                   2                    1                             1      4',
    ]);
    expect(formatTable(summarize([]))).toBe('standards-report: 0 findings.');
  });
});
