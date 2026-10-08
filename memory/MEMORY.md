# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-08)

- **Released:** **2.10.0** (2026-10-06, tag `v2.10.0` on `main` `1f3b2bc`): editor Phases 0–1. GitHub Release has the
  Windows installer, macOS x64 and arm64 DMGs and update manifests; unsigned. Merged into `feat/402-software-factory`
  on 2026-10-08 (branch D-007 renumbered D-017; `main`'s D-007 is the release decision).
- **Phase:** Editor Phase 2 (multi-track timeline): 201 done; 201 and 202 are on their own branches, not yet merged
  with `main` (merge `main` into them before continuing). Spec-driven development since 2026-10-06 (D-001).
- **Features:** `000-baseline` ✔️. `001-phase1-gate-release` 🚧: released (T040–T043); open: post-release checks on
  the maintainer's hardware — T044 / T045 clean installs, T046 update from 2.8.0, T047 web redeploy if hosted, and
  the Phase 1 gate (T022, T023: `npm run measure:gate` on a mid-range laptop) and Mac RAW (T030, T033) per D-007.
- **Done:** `201-track-model` ✔️ Implemented 2026-10-07 (`a3adea2`, branch `feat/201-track-model`; D-017 `452fec2`).
  `401-ai-models-on-device` ✔️ 2026-10-07 (`21478bd`).
- **202:** `202-edit-operations` 🚧: T010–T021 done (`10d946f`, branch `feat/202-edit-operations`); next T030. T001
  waits on 2 manual checks by the maintainer (Alt + ← in Chrome; Alt held through a drag in the desktop app).
- **Factory (D-011):** `402-software-factory` 🚧 on `feat/402-software-factory` (pushed): T001–T090 done except
  T062 / T063 (👤: `/spec-batch` and two worktree lines); constitution 1.1.0, XII (D-016). First real runs: T060 and
  T070 by the loop, toast seen; stops drilled on a throwaway `feat/998-stop-drill` (local). Next: T062, T063, then
  `/spec-verify 402` (T091, T092).
- **CI:** only at a release (D-006): `desktop-release.yml` runs `ci.yml` first; one dry run per release allowed;
  CodeQL still scans PRs. `gh` is installed and signed in (`C:\Program Files\GitHub CLI\gh.exe`).
- **Blockers:** none (001's checks wait on the maintainer's hardware, by choice)

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
