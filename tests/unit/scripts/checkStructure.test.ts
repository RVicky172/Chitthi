import { describe, expect, it } from 'vitest';
import { structureProblems } from '../../../scripts/check-structure.mjs';

/**
 * A source file as the check reads it.
 * @param path its path
 * @param text its text
 * @returns the file
 */
const file = (path: string, text = '') => ({ path, text });

describe('structureProblems: tests stay out of src/ (407 AC-1)', () => {
  it('finds nothing in a clean tree', () => {
    expect(
      structureProblems([
        file('src/engine/keyframes.ts', "import { valueAt } from './valueAt';"),
        file('src/main.tsx'),
      ]),
    ).toEqual([]);
  });

  it('reports a test file or a test helper under src/', () => {
    expect(
      structureProblems([
        file('src/engine/keyframes.test.ts'),
        file('src/components/Card.spec.tsx'),
        file('src/engine/timeline.testkit.ts'),
      ]),
    ).toEqual([
      'src/engine/keyframes.test.ts: a test file in src/ (tests go in tests/unit, tests/integration or tests/e2e)',
      'src/components/Card.spec.tsx: a test file in src/ (tests go in tests/unit, tests/integration or tests/e2e)',
      'src/engine/timeline.testkit.ts: a test helper in src/ (it goes in tests/support)',
    ]);
  });

  it('reports app code importing tests/, except main.tsx loading the self-test in development', () => {
    expect(
      structureProblems([
        file('src/main.tsx', "if (import.meta.env.DEV) void import('../tests/selftest/selftest');"),
        file('src/engine/stack.ts', "import { fakeDecoder } from '../../tests/support/fakeDecoder';"),
        file('src/state/video.ts', "const kit = await import('../../tests/support/timeline.testkit');"),
      ]),
    ).toEqual([
      "src/engine/stack.ts: imports '../../tests/support/fakeDecoder' (app code must not import tests/)",
      "src/state/video.ts: imports '../../tests/support/timeline.testkit' (app code must not import tests/)",
    ]);
  });

  it('allows the self-test import only in main.tsx', () => {
    expect(structureProblems([file('src/App.tsx', "void import('../tests/selftest/selftest');")])).toEqual([
      "src/App.tsx: imports '../tests/selftest/selftest' (app code must not import tests/)",
    ]);
  });
});
