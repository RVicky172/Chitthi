# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-07)

- **Phase:** Editor Phase 2 (multi-track timeline) started: 1 of 12 items done (201). App at 2.8.0 + unreleased
  editor Phases 0–1 and 201. Spec-driven development set up on 2026-10-06 (D-001); engineering docs in `specs/`,
  editor plans in `specs/vision/` (D-002).
- **Features:** `000-baseline` ✔️ (baseline `e549542`; Known gaps G1–G9, G6–G8 since fixed). `001-phase1-gate-release`
  ⏸️: everything runnable here is done (G6–G8 fixes, CI at the release, `npm run measure:gate`, Windows RAW check,
  docs; T091's local gates green). Deferred to the roadmap backlog by the maintainer: laptop gate (T022, T023), Mac
  RAW (T030, T033), then the release T040–T047. 2.10.0 is not tagged until they pass.
- **Done:** `201-track-model` ✔️ Implemented 2026-10-07 (all 12 ACs, every gate green), on branch
  `feat/201-track-model`, **not committed yet** (commit only when the maintainer asks).
- **Next step:** `/spec-new 202` (P2.2 edit operations: ripple, roll, slip, slide, magnetic main track, snapping):
  it replaces the store's one `pack` rule. Optional small item: Ctrl+D / Alt+arrow in the video editor (not in 2.x).
- **CI:** only at a release (D-006): `desktop-release.yml` runs `ci.yml` first; one dry run per release allowed.
  CodeQL still scans PRs.
- **Blockers:** none (001 waits on the maintainer's hardware, by choice)

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
