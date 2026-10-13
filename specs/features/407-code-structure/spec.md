<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 407 — Code structure: a tests folder, coding standards, readable names and JSDoc

**Status:** Approved
**Roadmap phase:** Other features (400+) · **Created:** 2026-10-13

## Summary

The code works, but it is harder to read and change than it should be. Unit tests sit beside the code in `src/` (30 files), so tests and code are mixed when browsing; there are no written coding standards; 34 % of the names declared in `src/` are one letter (5,593 of 16,459), 38 % of exported functions have no JSDoc (333 of 880), 19 files are over 600 lines (the largest 1,443) and 103 functions over 80 lines. 407 moves every test into a top-level `tests/` folder (unit, integration, e2e), writes the standards down (naming, JSDoc, SOLID as applied here, sizes, performance), makes ESLint enforce what it can, and brings the existing code up to them without changing what the app does. (Tests beside the code never reached the build: Vite bundles only what the app imports, and the Docker image and the desktop app ship only `dist/`; 407 keeps that proven by a check.) It comes before 207 so Phase 2’s remaining features are written to the standards from the start.

## User Stories

- **US-1:** As the maintainer, I want all tests in one `tests/` folder, split into unit, integration and e2e, so that code and tests don’t mix and I can find any test quickly.
- **US-2:** As a contributor (or an agent), I want written coding standards that the linter checks, so that new code is consistent without anyone having to remember the rules.
- **US-3:** As someone reading the code, I want descriptive names and a JSDoc on every exported function, so that I understand a function without reading its body.
- **US-4:** As the maintainer, I want large files split into modules that each do one job, so that a change touches one small place and is easy to review.
- **US-5:** As a user, I want none of this to change how the app looks, behaves or performs, except where it gets faster.

## Acceptance Criteria

### Tests in one place

- [ ] **AC-1:** Every test lives under `tests/`: `tests/unit/` (one module, mirroring `src/`’s paths, e.g. `tests/unit/engine/keyframes.test.ts`), `tests/integration/` (several modules together: the stores, the decoder pool with its fake decoder, the preview sound), `tests/e2e/` (the Playwright tests, from `e2e/`) and `tests/support/` (shared fixtures and fakes, e.g. `timeline.testkit.ts`) (Q1). A check (in `npm run check`) fails if a `*.test.ts` or test helper appears under `src/`. _(check)_
- [ ] **AC-2:** After the move the same tests run and pass: `npm run test:unit` runs the same 1,672 unit and integration tests (more if 407 adds any), `npm run test:e2e` the same e2e tests; `npm run check`, the editor’s test explorer and single-test commands (documented in CLAUDE.md) work with the new paths. _(check)_
- [ ] **AC-3:** No test code reaches what is shipped: `scripts/check-bundle.mjs` (in `npm run build`) fails if any built file contains a module from `tests/` or test-only code (Vitest, the fakes); the Docker image and the desktop package keep shipping only `dist/` and the listed Electron files. _(check)_

### Written standards

- [ ] **AC-4:** `specs/coding-standards.md` says how code is written here, with a short example of each rule: names (descriptive; the one-letter exceptions of Q3), JSDoc (every exported function, class, React component and type: what it does, its parameters, what it returns, what it throws), SOLID as it applies to this codebase (Q7: one job per module, layers that only depend downwards, small interfaces), sizes (Q4), React (hooks, component size, props), performance (no allocation per frame in the drawing and decoding paths; measure before optimizing), errors (`logError`), comments, and tests (where they go, how they are named). The constitution’s Definition of Done and CLAUDE.md point to it. _(review)_
- [ ] **AC-5:** ESLint enforces the rules it can: name length (Q3’s exceptions only), JSDoc on exports (`eslint-plugin-jsdoc`, BSD-3-Clause, a development dependency only), function length and cognitive complexity (Q4, Q12), the React rules (AC-12), the type rules (AC-13), and the layers’ import direction (`data` → `engine` → `state` → `components`; `engine` never imports `state` or `components`). At the end of 407 `npm run lint` has 0 errors with every rule on as an error for `src/` and `electron/`. _(check)_

### The existing code brought up to the standards

- [ ] **AC-6:** No one-letter names are left in `src/` and `electron/` outside Q3’s exceptions (5,593 in `src/` on 2026-10-13), as the lint rule reports. _(check)_
- [ ] **AC-7:** Every exported function, class, React component and type in `src/` and `electron/` has a JSDoc (333 exported functions without one on 2026-10-13), as the lint rule reports. _(check)_
- [ ] **AC-8:** Modules that do more than one job are split by responsibility, each with one job and a short header saying what it is for: at least the 19 files over 600 lines on 2026-10-13 are reviewed and the mixed ones split (e.g. `engine/render.ts`, `state/video.ts`, `components/studio/Timeline.tsx`); every function meets Q4’s length and cognitive-complexity limits (103 functions over 80 lines on 2026-10-13). A file’s length alone is a review signal, not a rule (Q4); data files are exempt. _(check + review)_

### Nothing changes for users

- [ ] **AC-9:** Behaviour is unchanged: every unit, integration and e2e test, the self-test (~6,100 checks: every product × size × layout, print packs, agent tools) and the MCP test pass before and after; the 201–206 video fixtures export identical inputs and pixel-identical frames; the entry chunk is no larger than before (327 KB). These run at the end of 407 itself, not in 290 (Q9). _(unit + e2e + self-test + MCP (407))_

### Optimized code

- [ ] **AC-10:** A performance review of the hot paths (video frame drawing `renderStack` / `frameStack`, the decoder pool, the sound mix, the photo pipeline, the print renderer) is recorded in `specs/features/407-code-structure/` with measurements; a change is made only where it measures at least 10 % faster (Q8), with before / after numbers; no timing check gets slower. _(timing + review)_

### Docs

- [ ] **AC-11:** CLAUDE.md (commands, single tests, the layers), `specs/testing-strategy.md` (the new layout and what is unit / integration / e2e), `specs/architecture.md` and `specs/lld.md` (module paths after the splits), `specs/build.md` (scripts) and `memory/` describe the new structure; relative links resolve. _(review)_

### React

- [ ] **AC-12:** The code follows the current React rules: every rule of `eslint-plugin-react-hooks` v7’s `recommended-latest` preset (the Rules of React that the React Compiler relies on: purity, immutability, refs, set-state in effects and render, static components, memoization) is an error and passes (27 findings in 16 files on 2026-10-13, today switched off); effects are used only to sync with things outside React (106 `useEffect` today, each one checked). Whether the React Compiler is then turned on is Q11. _(check)_

### Types

- [ ] **AC-13:** Types do the checking, not casts: typescript-eslint’s type-aware `strictTypeChecked` and `stylisticTypeChecked` presets pass; type assertions (`as`, 379 today, 13 of them `as unknown as`) and non-null assertions (`!`, 177 today) are replaced by narrowing, type guards or better types, and the few left carry a comment saying why; object shapes are named `interface`s (121 functions take inline object types today), with utility types (`Pick`, `Omit`, `Partial`, `Readonly` …) where they express a real relation instead of copies; `readonly` where data isn’t changed. Q13 decides which stricter compiler options come in 407. _(check)_

## Non-Functional Requirements

- **Behaviour-neutral:** no change to what the app shows, saves, exports or how fast it is (except measured speed-ups, AC-10); every test green after every task (AC-9).
- **Reviewable:** one folder per task and commit; moves (`git mv`) separate from edits, so history follows the files.
- **Performance budgets kept:** code splitting stays as it is (screens and dialogs lazy-loaded, AI, Mediabunny and other heavy code behind dynamic `import()`; the entry chunk budget of 350 KB checked by `npm run build`, 327 KB today); splits must not pull code into the entry chunk.
- **Dependencies:** development only (`eslint-plugin-jsdoc` BSD-3-Clause; `babel-plugin-react-compiler` MIT if Q11; `eslint-plugin-sonarjs` LGPL-3.0 only with Q12’s exception), each in `scripts/check-licenses.mjs` as not shipped; nothing new in the shipped app.
- **Free and open source:** unchanged.

## Out of Scope

- New features or behaviour changes; UI changes.
- `scripts/` and `tools/` clean-up (408, Q6).
- A different test framework (Vitest and Playwright stay).
- Rewrites for style alone: a module is split or renamed to meet a standard, not redesigned.

## Open Questions

- **Q1** _(resolved)_ The `tests/` layout? _Answer (accepted 2026-10-13):_ `tests/unit/` mirrors `src/` (one test file per module it tests); `tests/integration/` holds tests that drive several modules together (today: `state/*.test.ts`, `decodePool.test.ts` with its fake decoder, `previewSound.test.ts`); `tests/e2e/` takes `e2e/`; `tests/support/` the shared fixtures and fakes (`timeline.testkit.ts`, the fake decoder, the recording canvas). The roadmap dashboard’s own tests stay with that tool (`tools/`, a separate app) until Q6’s follow-up.
- **Q2** _(resolved)_ The in-app self-test (`src/dev/selftest.ts`, `videoChecks.ts`, `poolChecks.ts`, `playbackChecks.ts`, ~5,000 lines) runs inside the Electron app, in the page. Where does it go? _Answer (accepted 2026-10-13):_ `tests/selftest/`, loaded by `main.tsx` only in development builds (as today, behind `import.meta.env.DEV`), with AC-3’s check proving it never reaches the production build. `src/dev/showcase` and `printSamples` (development pages, not tests) stay in `src/dev/`.
- **Q3** _(resolved)_ Which one-letter names, if any, are allowed? _Answer (accepted 2026-10-13):_ only `_` for a value that is deliberately unused, and `x` / `y` for a point’s coordinates (they are the axes’ real names); everything else is descriptive: `index` not `i`, `clip` not `c`, `context` not `ctx` or `x`, `width` / `height` not `W` / `H`, `error` not `e`, `event` not `e`. The lint rule (`id-length` with these exceptions) applies to variables, parameters, functions and properties we declare.
- **Q4** _(resolved)_ Size limits: is a 500-line file limit needed? _Answer (accepted 2026-10-13):_ no hard file limit. Line count is only a proxy; what keeps code maintainable is one job per module (AC-8, Q7), short functions and low cognitive complexity. So: functions at most 80 lines and cognitive complexity at most 15 (errors); React components at most 250 lines (error); a file over 800 lines is a lint **warning** that asks for a review (split if it mixes jobs, keep if it is one cohesive job, e.g. one renderer). Data-only files (`src/data/`, `docs.ts`) and tests are exempt.
- **Q5** _(resolved)_ All at once or step by step? _Answer (accepted 2026-10-13):_ step by step, one folder per task, each its own commit with every test green, in this order: the tests move first (smallest risk, AC-1–AC-3), then the standards and lint rules as warnings (AC-4, AC-5), then `engine/`, `state/`, `agent/` + `ai/` + `lib/` + `platform/`, `components/`, `dev/` → `tests/selftest/`, `electron/`; each folder’s rules become errors when it is done. Estimated at 3–5 working days of tasks; Phase 2 work (207) waits for it.
- **Q6** _(resolved)_ Scope: what is cleaned up? _Answer (accepted 2026-10-13):_ the shipped code: `src/` and `electron/`. The development tools (`scripts/`, `tools/specs-index`, `tools/roadmap-dashboard`) follow the same standards for new code but are cleaned up later in their own feature (408), so 407 stays reviewable.
- **Q7** _(resolved)_ What does SOLID mean here, concretely? _Answer (accepted 2026-10-13):_ **S**: one job per module (e.g. `state/video.ts` becomes the store core and history, clip edits, keyframe actions, transition actions and export; `render.ts` and `Timeline.tsx` split the same way). **O**: products, sizes, layouts, kinds stay data-driven (add a table entry, not a branch), as `src/data/` already does. **L**: few classes here; where an interface has several implementations (frame sources, AI providers, file sinks) each honours it fully. **I**: small props and options interfaces, not one large shared one. **D**: layers depend downwards only (`data` → `engine` → `state` → `components`), enforced by lint; platform differences behind `platform/` and `lib/`. No class hierarchies added for their own sake.
- **Q8** _(resolved)_ How is “optimized” judged? _Answer (accepted 2026-10-13):_ by measurement, not by eye: the existing timing checks (preview frame time, export speed, the pool’s decode timings, the print renderer’s time per page) before and after; a change goes in only with at least 10 % gain on its path and no loss elsewhere. Readability changes (renames, splits) must not slow anything (checked by the same timings).
- **Q9** _(resolved)_ Heavy tests (D-033 puts them in a phase’s test pass)? _Answer (accepted 2026-10-13):_ 407 is not a phase feature and touches every file, so it runs the full Definition of Done itself at its end (e2e, self-test, MCP, licences, build) and after each large folder (components, dev), not deferred to 290.
- **Q10** _(resolved)_ Order with Phase 2? _Answer (accepted 2026-10-13):_ 407 first (branched from `main`, merged into `main` when done), then 207 branched from the updated `main`, written to the standards from its first line.
- **Q11** _(resolved)_ The React Compiler? _Answer (accepted 2026-10-13):_ yes, after AC-12, as the last step of 407: `babel-plugin-react-compiler` 1.0 (MIT, a build-time development dependency, nothing new shipped) through the Vite React plugin, for the whole app; then remove the manual `useMemo` / `useCallback` / `memo` it makes unnecessary (22 today). It is worth less here than in most apps (the heavy work is canvas drawing and decoding, outside React, and screens are already lazy-loaded), so it goes in only if the e2e and timing checks show no regression; the gain is mostly simpler components. If the plugin can’t be wired into this Vite version, it waits and AC-12 still applies.
- **Q12** _(resolved)_ Cognitive complexity (as SonarQube measures it)? The usual ESLint rule is in `eslint-plugin-sonarjs`, which is LGPL-3.0-only; our licence policy allows weak copyleft only with an approved exception (`specs/licensing.md`). (`eslint-plugin-cognitive-complexity` on npm is a security placeholder for a removed malicious package: never install it.) _Answer (accepted 2026-10-13):_ approve an exception for `eslint-plugin-sonarjs` as a **development-only lint tool**: never shipped, never bundled, not modified, so LGPL’s obligations (which apply when distributing it) don’t arise; recorded in `specs/licensing.md` and `memory/decisions.md`. It also brings Sonar’s other maintainability rules (duplicate strings, identical branches, nested ternaries). _Alternative:_ ESLint’s built-in `complexity` (cyclomatic, MIT) only, and SonarQube for IDE in the editor. The maintainer chose `eslint-plugin-sonarjs` (2026-10-13).
- **Q13** _(resolved)_ Stricter TypeScript compiler options? `noUncheckedIndexedAccess` (an array or record read may be undefined) catches real bugs but reports 1,400 errors today; `noImplicitReturns` and `noImplicitOverride` report 3. _Answer (accepted 2026-10-13):_ turn on `noImplicitReturns` and `noImplicitOverride` in 407; `noUncheckedIndexedAccess` folder by folder with the clean-up (it touches the same lines), on for the whole of `src/` by 407’s end. `exactOptionalPropertyTypes` waits (it changes how optional fields are written across the document gates).

## Changelog

- 2026-10-13 — Created: draft spec with 11 acceptance criteria and 10 open questions with proposed answers (the maintainer asked for a tests folder, coding standards, SOLID, JSDoc and no one-letter names before 207).
- 2026-10-13 — Second pass: no hard file-length limit (Q4: function length and cognitive complexity instead); AC-12 React rules, AC-13 types; Q11 React Compiler, Q12 cognitive complexity (sonarjs is LGPL), Q13 stricter compiler options; measured baselines.
- 2026-10-13 — Q1–Q13 accepted as proposed (Q12: `eslint-plugin-sonarjs` under a development-only LGPL exception; Q13 as proposed, D-037); Approved.
- 2026-10-13 — Plan written and approved with the spec (§1–§8, D1–D3, D-037).
