# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-06)

- **Phase:** Baseline. App at 2.8.0 + unreleased editor Phases 0–1 (12/12 items, on branch
  `feat/editor-phase-1-continued`). Spec-driven development set up on 2026-10-06 (D-001); engineering docs moved
  `docs/` → `specs/`, editor plans → `specs/vision/` (D-002).
- **Active feature:** `001-phase1-gate-release` (🚧 In Progress: T001–T004 done, G6–G8 fixed). `000-baseline` ✔️ Implemented 2026-10-06 (baseline `e549542`; gates green on a clean
  clone; Known gaps G1–G9 in its spec).
- **Next step:** `001` — Phase 1 gate (masked edits on a mid-range laptop in Chrome), first macOS build with Intel
  LibRaw, release 2.10.0: `/spec-implement 001` from T010 (CI workflows); 👤 tasks need the laptop, the Mac, a clean machine. Bug fixes from 000's Known gaps, before 001's release: npm audit (G6),
  MCP test output folder (G7), `logError` in export failures (G8). Then Phase 2 from `201`.
- **CI:** only for a release tag, never on feature branches (D-006); `ci.yml` triggers not changed yet.
- **Blockers:** none

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
