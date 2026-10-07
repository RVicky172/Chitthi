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
- **Done:** `201-track-model` ✔️ Implemented 2026-10-07, committed (`a3adea2`) and pushed on
  `feat/201-track-model` (not merged to `main`; D-007 committed separately, `452fec2`).
- **Active:** `202-edit-operations` 🚧 In Progress: spec, plan (D-009), tasks written 2026-10-07; T010–T021 done
  (gaps in the model; `engine/edits.ts`: every operation + snapping, D-010; `magnetic` in the document; the store's
  Magnetic, tool, Snap and edit actions); T001 spike
  waits on 2 manual checks by the maintainer (see its note: Alt + ← in Chrome; Alt held through a drag in the
  Windows desktop app). Branch `feat/202-edit-operations`, nothing committed for 202 yet.
- **Next step:** `/spec-implement 202` from T030 (e2e for the tools, then the UI). T001's answers are needed before
  T032 / T033. Optional: Ctrl+D in the video editor.
- **Also done:** `401-ai-models-on-device` ✔️ 2026-10-07 (Settings › AI › AI models on this device; uncommitted).
- **CI:** only at a release (D-006): `desktop-release.yml` runs `ci.yml` first; one dry run per release allowed.
  CodeQL still scans PRs.
- **Blockers:** none (001 waits on the maintainer's hardware, by choice)

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
