<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 407 — Code structure: a tests folder, coding standards, readable names and JSDoc · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-13; D1–D3 as chosen, D-037; the maintainer asked to approve the spec and the plan together) <!-- Draft | Approved -->

## Approach

Behaviour-neutral throughout: every step is a move, a rename, a split or a type / lint fix, proven by the existing tests, and committed on its own with `npm run check` green. The order follows Q5: tests move first, then the standards and the lint rules (as warnings), then the code folder by folder (each folder's rules become errors when it is done), then the React Compiler and the performance review, with the full Definition of Done at the end (Q9).

**§1 Baselines (AC-9, AC-10).** Before anything moves: the unit test count (1,672), the e2e pass list, the self-test check count and result, `npm run test:mcp`, the export inputs of the 201–206 fixtures (the self-test's video checks compare them), the entry chunk (327 KB), and the timing numbers of the hot paths (§7). Plus a standards report (`scripts/standards-report.mjs`): per folder and rule, the lint findings and the `noUncheckedIndexedAccess` errors, so each task records its numbers going to 0.

**§2 Tests into `tests/` (AC-1–AC-3, Q1, Q2).** `git mv` only (history follows), then import fixes. `tests/unit/<src path>/x.test.ts` for one-module tests; `tests/integration/` for `state/*.test.ts`, `decodePool.test.ts`, `previewSound.test.ts`; `tests/support/` for `timeline.testkit.ts` and the fakes now inside test files (the fake decoder, the recording canvas, the fake audio element), shared instead of copied; `e2e/` → `tests/e2e/`; `src/dev/{selftest,videoChecks,poolChecks,playbackChecks}.ts` → `tests/selftest/`, loaded by `main.tsx` only in development (`import.meta.env.DEV`, as today). Tests import the app through a path alias, `@/` → `src/` (D1), set in `vite.config.ts` and the tsconfigs. Config: Vitest `include` the `tests/{unit,integration}` and `tools/` test globs; Playwright `testDir: 'tests/e2e'`; `tsconfig.tests.json` (referenced from `tsconfig.json`) type-checks `tests/`; `tsconfig.app.json` also includes `tests/selftest` (imported by the app in development). Guards: `scripts/check-structure.mjs` (in `npm run check`) fails on a test or test helper under `src/`, and on `src/` importing `tests/` other than `main.tsx`'s development import; a build-only Vite plugin fails `npm run build` if any chunk holds a module from `tests/` (AC-3).

**§3 The written standards (AC-4).** `specs/coding-standards.md`, each rule with a short good / bad example from this codebase: names (Q3; persisted document fields such as a keyframe's `t` / `v` or a box's `x` / `w` keep their names, since renaming them would change saved projects; code destructures them into descriptive names), JSDoc (what, `@param`, `@returns`, `@throws`; no types in JSDoc, TypeScript has them), SOLID as in Q7, sizes (Q4), cognitive complexity (Q12), React (AC-12: the Rules of React, effects only to sync with outside systems, components small, props interfaces named), types (AC-13: interfaces for object shapes, guards over casts, utility types for real relations, `readonly`), layers and imports, errors (`logError`), performance (no allocation per frame on the drawing and decoding paths; measure first), comments, tests (where, naming, one behaviour per `it`). The constitution's Definition of Done and CLAUDE.md link to it.

**§4 The lint and compiler rules (AC-5, AC-12, AC-13, Q4, Q12, Q13).** `eslint.config.js` gains: `id-length` (min 2; exceptions `_`, `x`, `y`; properties not checked, §3); `eslint-plugin-jsdoc` (`require-jsdoc` for exported functions, arrow functions, classes, interfaces and types; `require-param`, `require-returns`, `no-types`); `max-lines-per-function` 80 for `.ts` and 250 for `.tsx` (components), blank lines and comments not counted; `max-lines` 800 as a warning; `eslint-plugin-sonarjs` (recommended, `cognitive-complexity` 15); `eslint-plugin-react-hooks` `recommended-latest`; typescript-eslint `strictTypeChecked` + `stylisticTypeChecked` with `projectService` (type-aware), `consistent-type-definitions: interface`; the layers with core `no-restricted-imports` per folder (`src/data` imports nothing of the app; `src/engine` not `state` / `components`; `src/state` not `components`). Data files (`src/data/`) and tests are exempt from the size rules. Every new rule starts as a **warning**; a list of finished folders in the config turns them into errors there (§5). tsconfig: `noImplicitReturns` and `noImplicitOverride` on now (3 errors fixed); `noUncheckedIndexedAccess` tracked per folder by the standards report and turned on for `src/` when its count is 0 (Q13). `eslint-plugin-sonarjs` gets its development-only exception row in `specs/licensing.md` (D-037).

**§5 The clean-up, folder by folder (AC-6–AC-8, AC-12, AC-13).** In this order, each folder one or more tasks, each task one commit with `npm run check` and `npm run build` green: `engine/` (with its gpu subfolder), `state/`, `data/` + `lib/` + `platform/` + `agent/` + `ai/`, `components/` (studio, ig, then the rest), `tests/selftest/`, `electron/` (CommonJS: names, JSDoc, sizes; no type rules). In each: rename one-letter names to what they hold (`clip`, `index`, `context`, `width`, `event`), add JSDoc, fix casts and non-null assertions with guards and better types, fix the React findings, fix `noUncheckedIndexedAccess` errors, and split modules that mix jobs (known: `engine/render.ts`, `engine/timeline.ts` into tracks / sound plan / document gate, `engine/masks.ts`, `engine/layers.ts`, `state/video.ts` into store core and history / clip edits / keyframes / transitions / media and export, `components/studio/Timeline.tsx` into rows / track header / keyframe and cut marks / transport, `VideoWorkspace.tsx` and `PhotoWorkspace.tsx` into their panels, stage and inspector). Importers are updated to the new modules; no barrel files re-exporting old paths (D2). Then the folder's rules become errors. After `components/` and after `tests/selftest/`: the full e2e and self-test (Q9).

**§6 React Compiler (Q11).** After AC-12's rules pass everywhere: `react({ compiler: true })` in `vite.config.ts` with `oxc-transform-react` (MIT, the plugin's built-in, Rust port of the compiler; a development dependency, D3); `logDiagnostics` once to list components it skips, each fixed or noted. Then remove the manual `useMemo` / `useCallback` / `memo` it makes unnecessary (22). Kept only if the e2e, self-test and timing checks show no regression; else turned off with the reason recorded.

**§7 Performance review (AC-10, Q8).** Measured with the existing tools (the pool and playback timing checks, the export timing, `npm run measure:gate`, the print renderer's time per page, the entry and studio chunk sizes): video frame drawing (`renderStack`, `frameStack`, `drawPair`), the decoder pool, the sound mix (`mixWindow`, `gainCurve`), the photo pipeline and the print renderer. Findings in `specs/features/407-code-structure/performance.md`; a change only with ≥ 10 % gain on its path and no loss elsewhere, with before / after numbers.

**§8 Close (AC-9, AC-11).** The full Definition of Done (`npm run check`, `build`, `test:e2e`, `npm test`, `test:mcp`, `check:licenses`), compared with §1's baselines; docs (CLAUDE.md, `specs/testing-strategy.md`, `architecture.md`, `lld.md`, `build.md`, memory); merged into `main`; 207 branches from it.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `tests/` (new: unit, integration, support, e2e, selftest) | new (moves) | §2: every test and test helper, moved with `git mv` |
| `src/**/*.test.ts`, `src/engine/timeline.testkit.ts`, `e2e/`, `src/dev/{selftest,videoChecks,poolChecks,playbackChecks}.ts` | move | §2: into `tests/` |
| `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.tests.json` (new), `playwright.config.ts` | modify / new | §2, §4, §6: alias, test globs, test type-checking, stricter options, the build guard, the React Compiler |
| `scripts/check-structure.mjs`, `scripts/standards-report.mjs` (new), `package.json` | new / modify | §1, §2: guards and the per-folder report; dev dependencies (`eslint-plugin-jsdoc`, `eslint-plugin-sonarjs`, `oxc-transform-react`) |
| `eslint.config.js` | modify | §4: the rules, warnings first, errors per finished folder |
| `specs/coding-standards.md` (new), `specs/constitution.md`, `CLAUDE.md`, `specs/licensing.md` | new / modify | §3, §4: the standards; the Definition of Done; the sonarjs exception |
| `src/**`, `electron/**` | modify (renames, JSDoc, splits, type and React fixes) | §5: the clean-up, folder by folder |
| `src/main.tsx` | modify | §2: the self-test loaded from `tests/selftest/` in development |
| `specs/features/407-code-structure/performance.md` (new) | new | §7: measurements and decisions |
| `specs/testing-strategy.md`, `specs/architecture.md`, `specs/lld.md`, `specs/build.md`, `memory/` | modify | §8: AC-11 |

## Data Structures & Interfaces

```text
tests/
  unit/<mirror of src>/...test.ts       one module, its pure inputs
  integration/state/...test.ts          several modules together: stores, pool + fake decoder, preview sound
  support/                              timeline.testkit.ts, fakeDecoder.ts, recordingCanvas.ts, fakeAudio.ts
  e2e/...e2e.ts, gate.measure.ts        Playwright (from e2e/)
  selftest/selftest.ts, videoChecks.ts, poolChecks.ts, playbackChecks.ts   in-app checks, development builds only
```

```ts
// vite.config.ts / tsconfig paths (D1)
resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }
// tsconfig.*.json: "paths": { "@/*": ["./src/*"] }

// eslint.config.js (shape)
const FINISHED = ['src/engine/**', /* … added per §5 task … */];
// standards rules: 'warn' everywhere, 'error' in FINISHED; size rules off for src/data/** and tests/**
```

```text
scripts/check-structure.mjs   tests or test helpers under src/; src/ importing tests/ (except main.tsx's DEV import)
scripts/standards-report.mjs  per folder × rule: lint findings, noUncheckedIndexedAccess errors (JSON + table)
```

## Techniques

- **Moves before edits**: `git mv` in its own commit, then fixes, so `git log --follow` keeps each file's history.
- **Warnings first, errors per folder**: the rules land as warnings (the existing code doesn't break the build) and become errors folder by folder, so finished folders can't regress while the rest is cleaned.
- **The standards report** gives every task its before / after numbers (one-letter names, missing JSDoc, long functions, cognitive complexity, casts, React findings, unchecked index errors) for its result note.
- **Renames by meaning, not mechanically**: a name says what the value is in that place (`clip`, `stackItem`, `frameIndex`); the editor's rename (TypeScript language service) for exported names so every importer follows; the type checker and the tests catch slips.
- **Persisted names stay**: fields written to saved projects and agent tool schemas keep their names (renaming them is a format change, out of scope); code destructures them into descriptive locals.
- **Splits by responsibility**: a split moves whole functions with their JSDoc into a module named for its job; no logic changes in the same commit.
- **Type-aware lint cost** is measured (`projectService`, ESLint cache); if `npm run lint` gets much slower, the type-aware rules run in `npm run check` only on changed files plus a full run in the close.

## Test Approach

| AC | Proof | How |
| --- | --- | --- |
| AC-1 | check | `check-structure.mjs` in `npm run check` (fails on a test under `src/`; a planted file proves it) |
| AC-2 | check | the same counts as §1's baseline: 1,672 unit + integration tests, the e2e list; single-test commands in CLAUDE.md tried |
| AC-3 | check | the build plugin fails on a `tests/` module (proved by importing one on purpose, then removing it) |
| AC-4 | review | `specs/coding-standards.md` read through; linked from the constitution and CLAUDE.md |
| AC-5 | check | `npm run lint`: 0 errors with every rule an error for `src/` and `electron/` |
| AC-6, AC-7, AC-8 | check + review | the standards report at 0 for names, JSDoc, function length and cognitive complexity; the 19 long files reviewed, the split ones listed |
| AC-9 | unit + e2e + self-test + MCP | the full suite against §1's baselines after `components/`, after `tests/selftest/`, and at the close; identical fixture export inputs; entry chunk ≤ 327 KB |
| AC-10 | timing + review | `performance.md` with before / after numbers |
| AC-11 | review | docs and memory updated; relative links resolve |
| AC-12 | check | `react-hooks` `recommended-latest` as errors: 0 findings (27 at the start) |
| AC-13 | check | `strictTypeChecked` + `stylisticTypeChecked`: 0 errors; casts and `!` counted down in the report; `noUncheckedIndexedAccess` on |

## Risks & Mitigations

- **Renames or splits change behaviour by mistake** (thousands of edits). Mitigation: the type checker, 1,672 unit tests and lint after every task; the full e2e and self-test after `components/` and `tests/selftest/` and at the close; small commits, one folder each, easy to bisect.
- **Saved projects or agent tools change shape** if a persisted field is renamed. Mitigation: fields in documents (`toDocument`, `mergeProject`, `mergeLayers`, `mergeDesign`) and agent tool schemas keep their names (`id-length` doesn’t check properties); the document tests’ byte-identical round trips and the MCP test catch a slip.
- **Type-aware lint is slow** on ~50,000 lines. Mitigation: measured when the rules land (§4); ESLint cache; if too slow, type-aware rules on changed files in `npm run check` and a full run at the close.
- **A licence problem with the new development tools.** `eslint-plugin-sonarjs` is LGPL-3.0: approved as development-only (D-037), recorded in `specs/licensing.md`, never shipped; `oxc-transform-react` and `eslint-plugin-jsdoc` are MIT / BSD-3; versions pinned; `npm run check:licenses` unaffected (they aren’t shipped). Typosquats avoided (`eslint-plugin-cognitive-complexity` is a security placeholder).
- **The React Compiler changes rendering** (Q11). Mitigation: it comes last, after the rules pass; diagnostics reviewed; e2e, self-test and timing compared; turned off with the reason if anything regresses.
- **Size of the work** (~3–5 days, Phase 2 waits). Mitigation: tasks per folder, each mergeable on its own; the branch is merged into `main` when 407 closes, 207 starts from it.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec approved 2026-10-13 (Q1–Q13, D-037). |
| II. Test-Gated Delivery | ✅ | Behaviour-neutral; every task green on `npm run check` + build; the full suite after the large folders and at the close (Q9). |
| III. Simplicity and Small Dependencies | ✅ | Development dependencies only (jsdoc, sonarjs, oxc-transform-react); splits by job, no new abstractions for their own sake (Q7). |
| IV. Memory Is Maintained | ✅ | D-037; the standards in `specs/coding-standards.md`; progress per task. |
| V. Free and Open Source, Always | ✅ | Unchanged. |
| VI. On the User's Device, No Backend | ✅ | Unchanged. |
| VII. Permissive Licences Only | ✅ | One approved development-only exception (sonarjs, LGPL-3.0), recorded; nothing shipped changes. |
| VIII. What You See Is What You Get | ✅ | Preview and export code paths unchanged in behaviour; fixture export inputs compared. |
| IX. Secure Desktop Shell | ✅ | `electron/` gets names, JSDoc and sizes only; IPC validation unchanged. |
| X. Budgets and Accessibility | ✅ | Entry chunk ≤ 327 KB; no timing regressions (AC-10); e2e axe checks unchanged. |
| XI. Agents Use the Same Code | ✅ | Agent tool names and schemas unchanged (MCP test). |

## Decisions for the maintainer (accepted 2026-10-13 with the plan)

- **D1 — How tests import the app.** _Chosen:_ a path alias, `@/` → `src/` (`import { valueAt } from '@/engine/keyframes'`), set in Vite and the tsconfigs, for tests only at first. _Alternative:_ relative paths (`../../../src/engine/keyframes`), which break whenever a test or module moves.
- **D2 — After a split.** _Chosen:_ importers are updated to the new modules; no barrel files that re-export the old path. _Alternative:_ keep the old file as a re-export (fewer import changes, but two ways to import the same thing and a module that does nothing).
- **D3 — React Compiler wiring.** _Chosen:_ the Vite React plugin's built-in `compiler` option with `oxc-transform-react` (MIT, no Babel in the build). _Alternative:_ the Babel route (`@rolldown/plugin-babel`, `@babel/core`, `babel-plugin-react-compiler`): the reference implementation, but three more development dependencies and a slower build.
