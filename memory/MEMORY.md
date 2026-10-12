# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-11)

- **Released:** **2.10.0** (2026-10-06, tag `v2.10.0` on `main` `1f3b2bc`): editor Phases 0–1. GitHub Release has the
  Windows installer, macOS x64 and arm64 DMGs and update manifests; unsigned.
- **`main` (2026-10-10):** has 201, 401, 404, 202 and 405 (`e27d04a`, not pushed yet); releasable. The software
  factory (402, 403) was removed on 2026-10-09 (D-024): plain spec-driven workflow, `/spec-*` commands run inline.
- **Phase:** Editor Phase 2 (multi-track timeline): 201 and 202 done (on `main`), 204 done (on `main`); 203 in progress. Spec-driven development since 2026-10-06 (D-001).
- **Features:** `000-baseline` ✔️. `001-phase1-gate-release` 🚧: released (T040–T043); open: post-release checks on
  the maintainer's hardware — T044 / T045 clean installs, T046 update from 2.8.0, T047 web redeploy if hosted, and
  the Phase 1 gate (T022, T023: `npm run measure:gate` on a mid-range laptop) and Mac RAW (T030, T033) per D-007.
- **Done:** `201-track-model` ✔️ Implemented 2026-10-07 (`a3adea2`, branch `feat/201-track-model`; D-017 `452fec2`).
  `401-ai-models-on-device` ✔️ 2026-10-07 (`21478bd`).
- **202:** `202-edit-operations` ✔️ Implemented 2026-10-09, merged to `main` (`ecb55df`, pushed):
  edit tools (Roll, Slip, Slide), Magnetic and gaps, Snap, keys, live region; every DoD gate green.
- **404 roadmap data + dashboard:** ✔️ 2026-10-09 (`962d348`, on `main`). Features are
  JSON first (D-026): `specs/features/NNN-*/feature.json` holds spec, plan and tasks; the `.md` files are generated
  (hook refuses hand edits). `npm run specs -- start|block|done …`; `npm run roadmap` = dashboard with kanban boards.
- **Process:** test-first spec-driven workflow (constitution as before 402; D-023 build-first reverted by D-024).
- **Drafts → Approved:** `203-compositing-pip` and `204-decoder-pool`: all 24 proposed answers accepted by the
  maintainer on 2026-10-09; branch `spec/203-204`. Build 204 first: 203's visible-video limit (its Q6) comes from 204's
  measurements.
- **204:** `204-decoder-pool` ✔️ Implemented 2026-10-11, merged into `main` and pushed: the decoder pool (`engine/decodePool.ts`, `engine/frameSource.ts`) for preview and export, preview sound
  (`previewSound.ts`), the can't-export fallback note, `videosAtOnce` web 3 / desktop 5 (1 without VideoDecoder); every
  DoD gate green; maintainer's manual checks (T060) passed in Chrome and the desktop app.
- **405 ✔️ Implemented 2026-10-10**, merged into `main`: the roadmap dashboard as a scrollable road (stops, you-are-here hero, rail, Pace, live changes, reduced motion, airmail theme); `npm run test:roadmap` 17 / 17.
- **406 ✔️ Implemented 2026-10-11:** roadmap-actionable-workflow; AC-1–AC-6 proven, all tasks done; README/changelog updated. DoD gates pass; production e2e 84 passed / 16 skipped serially.
- **203:** `203-compositing-pip` 🚧: plan approved 2026-10-11 (D1–D3, D-031; Q6 = web 3 / desktop 5), tasks
  T001–T092; branch `feat/203-compositing-pip`. **204** merged into `main` and pushed
  (2026-10-11, with Dependabot #23–#27). Done to 2026-10-12: T001–T021, T030, T031 (stage draws stacks), T040, T050.
  From 2026-10-12 tasks run one at a time in the main session, no agent batches (maintainer's choice).
- **Next (roadmap):** 203 T032/T033 (export draws stacks), then T034, T035, T051–T054.
- **CI:** only at a release (D-006): `desktop-release.yml` runs `ci.yml` first; one dry run per release allowed;
  CodeQL still scans PRs. `gh` is installed and signed in (`C:\Program Files\GitHub CLI\gh.exe`).
- **Blockers:** none (001's checks wait on the maintainer's hardware, by choice)

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
