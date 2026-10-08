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
- **Factory (D-011):** `402-software-factory` 🚧 on `feat/402-software-factory`: verified 2026-10-08 except AC-16
  (T063 ⏸️ in the roadmap backlog); AC-11 amended to ≥ 2 unattended tasks (D-018). T091 all gates green (run
  `2026-10-08T15-03-52Z-402-T091.json`); 17 / 18 ACs; spec In Progress, T092 open; §3.6 F1–F5, F7 ✔️. Maintainer:
  a CHANGELOG 402 line or not, delete local `feat/996-drill-a`,
  `feat/997-drill-b`, `feat/998-stop-drill` + stashes; then T092. 203 / 204 Draft specs on `spec/203-204` (T062).
- **After 402 (roadmap):** 202 T030; answer 203 / 204's questions; 204, 205, 207, 210, 211 need only 201.
- **CI:** only at a release (D-006): `desktop-release.yml` runs `ci.yml` first; one dry run per release allowed;
  CodeQL still scans PRs. `gh` is installed and signed in (`C:\Program Files\GitHub CLI\gh.exe`).
- **Blockers:** none (001's checks wait on the maintainer's hardware, by choice)

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
