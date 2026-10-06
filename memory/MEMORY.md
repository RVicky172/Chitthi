# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-06)

- **Phase:** Baseline. App at 2.8.0 + unreleased editor Phases 0–1 (12/12 items, on branch
  `feat/editor-phase-1-continued`). Spec-driven development set up on 2026-10-06 (D-001); engineering docs moved
  `docs/` → `specs/`, editor plans → `specs/vision/` (D-002).
- **Features:** `000-baseline` ✔️ (baseline `e549542`; Known gaps G1–G9, G6–G8 since fixed). `001-phase1-gate-release`
  ⏸️: everything runnable here is done (G6–G8 fixes, CI at the release, `npm run measure:gate`, Windows RAW check,
  docs; T091's local gates green). Deferred to the roadmap backlog by the maintainer: laptop gate (T022, T023), Mac
  RAW (T030, T033), then the release T040–T047. 2.10.0 is not tagged until they pass.
- **Active:** `201-track-model` 🚧 In Progress (T001–T003, T010–T013 done: baseline, frozen 2.x reference, the model, `mergeLayers`), branch `feat/201-track-model`.
- **Next step:** `/spec-implement 201` from T014 (project document and `mergeProject`, tests first).
- **CI:** only at a release (D-006): `desktop-release.yml` runs `ci.yml` first; one dry run per release allowed.
  CodeQL still scans PRs.
- **Blockers:** none (001 waits on the maintainer's hardware, by choice)

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
