# 000 — Baseline

**Status:** In Progress <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** Baseline · **Created:** 2026-10-06 · **Owner:** RVicky172

## Summary

Chitthi Studio already exists: version 2.8.0 plus the unreleased editor Phases 0–1 (GPU render graph P0.1–P0.9 and
the advanced photo editor P1.1–P1.12) on branch `feat/editor-phase-1-continued`. Spec-driven development started on
2026-10-06 (D-001), after all of that was built. This feature records what exists as the starting point every later
spec builds on, and proves that the Definition of Done in `specs/constitution.md` holds for it today, so that a
failure seen while working on `001`, `201` … is known to be new rather than inherited. It adds no user-facing
behaviour.

## User Stories

- **US-1:** As a contributor (person or AI agent) starting a new feature, I want one page that says what the app does
  today and where each part is described, so that I don't re-specify or break existing behaviour.
- **US-2:** As a contributor, I want every Definition-of-Done gate known to pass on a clean clone of the baseline, so
  that a red gate during later work points at my change.
- **US-3:** As the maintainer, I want the engineering docs (`specs/architecture.md`, `specs/lld.md`,
  `specs/tech-stack.md`, `specs/testing-strategy.md`) and product docs (`docs/`) checked against the code, so that
  specs written from them start from the truth.
- **US-4:** As the maintainer, I want the baseline's known gaps written down (not fixed silently), so that each one
  becomes a bug fix or a later feature on purpose.

## Acceptance Criteria

### Inventory (what exists)

- [ ] **AC-1:** The spec's **Baseline inventory** section lists every capability area below, each with one line on
      what it does and a link to the doc that describes it in detail: print studio (4 products, sizes, layouts,
      themes, print packs with bleed), photo studio (batch, layers, the Phase 1 editor: light, colour, curve, mixer,
      detail, presets, LUTs, masks incl. AI masks, RAW, WebP/AVIF/16-bit TIFF export), video studio (Reels / Shorts,
      YouTube, MP4 export), desktop app (Windows, macOS; storage, RAW, updates), MCP server and Claude Code plugin,
      AI with the user's key, Pexels search, in-app docs. No area of the app's top-level routes (`home`, `studio`,
      `sizes`, `paper`, `instagram`, `docs`) is missing. _(manual review)_
- [ ] **AC-2:** Every link in the inventory resolves to an existing file and heading. _(manual check, or a link
      checker run recorded in the Result note)_
- [ ] **AC-3:** The inventory records the baseline's measured numbers already in
      `specs/vision/editor-implementation.md` (GPU vs Canvas 2D parity: worst 2 levels for colour edits, 3 with detail
      effects; frame times per 1080 × 1350 frame) and the count of agent tools registered in `src/agent/`
      (`tools.ts` and `photoTools.ts`), matching the count stated in `docs/MCP.md` and the README.
      _(manual check against the code)_

### Gates (Definition of Done on a clean clone)

On a fresh clone of the baseline commit, after `npm ci` (and `npx playwright install chromium`,
`npm run fetch:libraw`), on Windows 11:

- [ ] **AC-4:** `npm run check` exits 0: typecheck clean, ESLint 0 errors and no more than the 5 known react-hooks
      warnings, every Vitest test passing. _(gate run, output summary in the Result note)_
- [ ] **AC-5:** `npm run build` exits 0 with the entry chunk ≤ 350 KB and no AI or shader code in it; the entry chunk's
      size is recorded. _(gate run)_
- [ ] **AC-6:** `npm run test:e2e` passes on both the desktop and phone projects with 0 axe violations and 0 console
      errors (CSP included). _(gate run)_
- [ ] **AC-7:** `npm test` (Electron self-test) reports 0 failures; the total check count is recorded (expected
      about 6,000). _(gate run)_
- [ ] **AC-8:** `npm run test:mcp` passes, including developing the DNG with LibRaw. _(gate run)_
- [ ] **AC-9:** `npm run check:licenses` exits 0, and every shipped package (`dependencies` in `package.json` and
      the bundled devDependencies in `BUNDLED` in `scripts/check-licenses.mjs`) appears in `THIRD_PARTY_NOTICES.md`
      and in `specs/tech-stack.md`. _(gate run + manual check)_

### Docs match the code

- [ ] **AC-10:** `specs/architecture.md` and `specs/lld.md` name every directory under `src/` and `electron/`, and
      every module they name exists. Mismatches are fixed in the docs (not the code). _(manual check)_
- [ ] **AC-11:** `CHANGELOG.md`'s **Unreleased** section covers every Phase 0–1 work item marked Done in
      `specs/vision/editor-implementation.md`. _(manual check)_

### Known gaps

- [ ] **AC-12:** A **Known gaps** section lists every gate failure, flaky test (a test that failed at least once in
      3 runs of its suite), doc mismatch that wasn't fixed, and Definition-of-Done item the baseline doesn't meet
      (e.g. a user-facing feature without an agent tool — video clips get theirs in P2.12). Each gap names where it
      will be handled: a bug fix logged in `memory/progress.md`, feature `001`, a `2xx`/`3xx`/`4xx` feature, or the
      roadmap backlog. _(manual review)_

## Non-Functional Requirements

- Performance: none new. The baseline's existing budgets (`docs/PERFORMANCE.md`, the 350 KB entry chunk) are
  recorded, not changed.
- Accessibility / security / compatibility: none new; AC-6 records that today's axe and CSP checks pass.

## Out of Scope

- New features or behaviour changes of any kind.
- The Phase 1 gate measurement on a mid-range laptop in Chrome, the first macOS build with Intel LibRaw, and the
  2.10.0 release — all feature `001`.
- Retroactive spec / plan / tasks folders for Phases 0–1 (D-003: they stay recorded in `specs/vision/`).
- Merging `feat/editor-phase-1-continued` into `main` (see Q2).
- Firefox / Safari test projects (roadmap backlog).

## Open Questions

- **Q1** _(resolved)_ If a gate fails on the clean clone, does `000` fix it, or only record it?
  _Answer:_ small fixes (a broken link, a stale doc, a flaky wait) are done inside `000` as bug fixes logged in
  `memory/progress.md`; anything larger is recorded under Known gaps and handed to `001` or a later feature.
- **Q2** _(resolved)_ Which commit is "the baseline": the tip of `feat/editor-phase-1-continued`, or `main`
  after that branch is merged? _Answer:_ the branch tip at the time `000` is verified; its hash is recorded in the
  spec. The merge to `main` happens with `001`'s release.
- **Q3** _(resolved)_ Which platforms must the gates pass on for `000`? _Answer:_ Windows 11 (the
  development machine) for all gates, plus the existing GitHub CI workflow for what it already runs. macOS is
  checked in `001` with the first macOS build.
- **Q4** _(resolved)_ How detailed should the inventory be? _Answer:_ one line per capability area plus a
  link to the existing doc (`docs/MEDIA-STUDIO.md`, `docs/SPECIFICATIONS.md`, `docs/MCP.md`, …); the existing docs
  stay the detailed record, and this spec does not copy them.
- **Q5** _(resolved)_ What version does the baseline carry? `package.json` says 2.8.0; the editor plan names
  a 2.9.0 (Phase 0) that was never tagged and 2.10.0 for Phase 1. _Answer:_ the baseline is "2.8.0 + Unreleased";
  no 2.9.0 is tagged, and 2.10.0 (in `001`) ships Phases 0 and 1 together. The editor plan's Release column is
  corrected to say so.

## Changelog

- 2026-10-06 — Created.
- 2026-10-06 — Q1–Q5 resolved (all proposals accepted); Approved.
- 2026-10-06 — AC-3: tools are registered in both `tools.ts` and `photoTools.ts`. AC-9: "runtime dependency" means
  every shipped package, incl. bundled devDependencies (only 3 are in `dependencies`). Found while planning.
- 2026-10-06 — Plan approved, tasks written; In Progress.
