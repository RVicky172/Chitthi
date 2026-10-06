# 000 — Baseline · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
This feature writes no app code, so there are no failing-test-first pairs: the "tests" are the gate runs and the
check scripts, and each task's Result note is the evidence for its ACs.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

Decisions taken at plan approval (2026-10-06): clone at `D:\CodeBase\chitthi-000`, deleted after verify; 3 runs per
non-deterministic suite; link checker is a throwaway scratchpad script; `src/assests/` is deleted if nothing
references it.

## Setup

- [ ] **T001** — Commit the approved spec and plan (`docs(000): baseline spec and plan`) so the clone contains them;
      record the full commit hash (§1). · files: `specs/features/000-baseline/*` · test: `git log -1` shows the commit
- [ ] **T002** — Clean clone (§2): `git clone --branch feat/editor-phase-1-continued D:\CodeBase\Chitthi
      D:\CodeBase\chitthi-000`; `npm ci`; `npx playwright install chromium`; `npm run fetch:libraw`; unset
      `ELECTRON_RUN_AS_NODE`. Note any setup step that isn't in `specs/build.md`. · files: none (outside the repo) ·
      test: each command exits 0

## Gates (on the clean clone, in CI order, sequential)

- [ ] **T010** — `npm run check`: record typecheck result, ESLint errors and warnings (≤ 5 known react-hooks),
      Vitest file and test counts. · test: exit 0 (AC-4)
- [ ] **T011** — `npm run check:licenses`. · test: exit 0 (AC-9, first half)
- [ ] **T012** — `npm run build`: record the entry chunk size and the `check-bundle.mjs` verdict (no AI or shader
      code). · test: exit 0, entry ≤ 350 KB (AC-5)
- [ ] **T013** — `npm test` × 3: record pass/fail and check count per run, list any check that failed in any run.
      · test: 0 failures in all 3 runs (AC-7)
- [ ] **T014** — `npm run test:mcp` × 3, incl. the DNG developed by LibRaw. · test: pass in all 3 runs (AC-8)
- [ ] **T015** — `npm run test:e2e` × 3, desktop and phone projects: record test counts, axe and console-error
      failures. A network failure is retried once and recorded, not counted as flaky. · test: pass in all 3 runs (AC-6)
- [ ] **T016** — Link to the latest CI run on the branch (`gh run list --branch feat/editor-phase-1-continued`) and
      its result, as the second platform data point (Q3). · test: none (information only)

## Docs against code (in the working repo; [P] with the gate tasks, which run in the clone)

- [ ] **T020** [P] — Shipped packages (§8): list `dependencies` and `BUNDLED` (`scripts/check-licenses.mjs`); grep
      each in `THIRD_PARTY_NOTICES.md` and `specs/tech-stack.md`; add any missing entry. · files:
      `THIRD_PARTY_NOTICES.md`, `specs/tech-stack.md` · test: every package found in both (AC-9, second half)
- [ ] **T021** [P] — Module map (§6): scratch script lists every directory and top-level file under `src/` and
      `electron/` against `specs/lld.md` §1 and `specs/architecture.md` §4, and every path those docs name against
      the disk. Fix the docs (incl. `App.tsx`: screens are home, studio, sizes, paper, instagram, docs). · files:
      `specs/lld.md`, `specs/architecture.md` · test: script reports nothing undocumented or missing (AC-10)
- [ ] **T022** [P] — `src/assests/`: grep `src/`, `scripts/`, `public/`, `electron/`, `vite.config.*`, `index.html`
      and `e2e/` for `assests`; if nothing, `git rm -r src/assests` and add a decision (D-006) in
      `memory/decisions.md`; if something, list it under Known gaps instead. Re-run `npm run check` and
      `npm run build` here. · files: `src/assests/`, `memory/decisions.md` · test: grep empty; check and build exit 0
- [ ] **T023** [P] — CHANGELOG coverage (§7): map each Done item P0.1–P0.9 (P0.8 skipped, "Not needed") and
      P1.1–P1.12 to its Unreleased line; add missing lines. Put the mapping table in the Result note. · files:
      `CHANGELOG.md` · test: every item mapped (AC-11)
- [ ] **T024** [P] — Version (§9, Q5): Phase 0's Release in `specs/vision/editor-implementation.md` → "2.10.0 (with
      Phase 1; 2.9.0 was never tagged)". · files: `specs/vision/editor-implementation.md` · test: manual read

## Inventory

- [ ] **T030** — Write `## Baseline inventory` in `spec.md` (§4): baseline hash and version, a table of capability
      areas (area · what it does · detailed doc), built from the `App.tsx` routes and the README feature list.
      · files: `spec.md` · test: every route and README feature area appears (AC-1)
- [ ] **T031** — Numbers (§4): parity tolerances and frame times from `editor-implementation.md` (linked to their
      rows), self-test check count (T013), entry chunk size (T012), agent-tool count (grep `src/agent/tools.ts` and
      `photoTools.ts`) compared with README and `docs/MCP.md`. Set the self-test count in
      `specs/testing-strategy.md` and `CLAUDE.md` to the measured one. · files: `spec.md`,
      `specs/testing-strategy.md`, `CLAUDE.md` · test: counts agree everywhere (AC-3)
- [ ] **T032** — Link check (§5): throwaway scratch script checks relative links and `#anchors` (GitHub slugs) in
      `spec.md`, `specs/**/*.md` and `docs/**/*.md`; fix broken ones. · files: any Markdown with a broken link ·
      test: 0 broken links in the inventory (AC-2) and in `specs/` and `docs/`

## Verify

- [ ] **T090** — If T022 or any fix changed the tree after T001, commit, update the hash in the inventory, and re-run
      on the clone (`git pull`) the gates the change could affect (at least `npm run check` and `npm run build`).
      · test: those gates exit 0
- [ ] **T091** — Write `## Known gaps` in `spec.md` (§10): every gate failure, flaky test, unfixed mismatch and unmet
      Definition-of-Done item from T002–T032, each with its owner. Starts with: video clips have no agent tools →
      `212`; macOS gates not run → `001`; Firefox/Safari not tested → backlog. · files: `spec.md` · test: every
      entry names an owner (AC-12)
- [ ] **T092** — Tick the proven ACs in `spec.md` (Status `Implemented`), roadmap 000 → ✔️, `memory/progress.md`
      entry, `memory/MEMORY.md` Current State → next is `001`; learnings for anything that cost > 10 minutes.
      Delete `D:\CodeBase\chitthi-000`. · files: `spec.md`, `specs/roadmap.md`, `memory/*`

No `specs/architecture.md` task beyond T021: this feature establishes no new structure.

## AC coverage

| AC    | Tasks            |
| ----- | ---------------- |
| AC-1  | T030             |
| AC-2  | T032             |
| AC-3  | T031             |
| AC-4  | T002, T010, T090 |
| AC-5  | T012, T090       |
| AC-6  | T015             |
| AC-7  | T013             |
| AC-8  | T014             |
| AC-9  | T011, T020       |
| AC-10 | T021             |
| AC-11 | T023             |
| AC-12 | T091             |
