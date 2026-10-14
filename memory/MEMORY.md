# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-14)

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
- **203:** `203-compositing-pip` ✔️ Implemented 2026-10-12, merged into `main` (`3e98fc4`, not
  pushed): overlay tracks on the timeline, the clip box on the stage and in the inspector, preview and export draw the
  same stack. AC-1–3, 5, 8, 10, 12–14 wait for 290 (D-033). Plan D1–D3, D-031. **204** merged into `main` and pushed
  (2026-10-11). Tasks run one at a time in the main session, no agent batches (maintainer's choice).
- **Testing (D-033, 2026-10-12):** unit tests only while a phase is built; e2e, self-test, timing and manual checks are written and run in the phase's test pass (`290` for Phase 2), which ends in the release (3.0.0).
- **205:** `205-keyframes` ✔️ Implemented 2026-10-13, merged into `main` and pushed (`5d7640f`): keyframes for the
  clip box, clip volume and layers; inspector diamonds, stage auto-key, timeline lane, K / Alt + [ / ]. AC-6, 7, 9,
  10 (self-test), 11, 13 wait for 290 (D-033). Entry 327 KB.
- **206:** `206-transitions` ✔️ Implemented 2026-10-13 on `feat/206-transitions`: Cross-dissolve, Dip, Wipe, Slide,
  Zoom on the 2D canvas (D-035; D-036), centred on the cut with handles, sound cross-fades, panel + inspector +
  timeline cuts; AC-6 (self-test), 8–10, 12–14 wait for 290. Entry 327 KB.
- **Branches:** a finished feature merges into `main` (`--no-ff`); the next feature branches from `main`; a release is
  a tag on `main`.
- **206 merged** into `main` and pushed (`797bbf2`, 2026-10-13).
- **407:** `407-code-structure` 🚧 tasks T001–T092 (38; heavy checks inside 407, Q9); spec and plan Approved 2026-10-13 on `spec/407-code-structure` (from `main`;
  D-037): tests into `tests/{unit,integration,support,e2e,selftest}`, `specs/coding-standards.md`, ESLint (names,
  JSDoc, function length, sonarjs cognitive complexity, React `recommended-latest`, strictTypeChecked, layers), folder
  by folder; React Compiler last. Baseline: 34 % one-letter names, 333 / 880 exports without JSDoc, 103 functions > 80
  lines, 27 React findings, 379 `as`, 177 `!`.
- **407 progress (2026-10-14):** T001–T036 done except T020 (standards doc, waits for review): tests moved, lint
  rules in, `src/engine/**` fully clean and in `FINISHED` (`afbb134`). Print-file builders load on export (D-042);
  entry 311 KB. Behaviour of each clean-up is checked against frozen copies by scratch harnesses (learnings).
- **Next (roadmap):** `/spec-implement 407` from T040 (split `state/video.ts`) on `feat/407-code-structure`; then 207
  (speed) from `main`; 290 collects the deferred checks.
- **CI:** only at a release (D-006): `desktop-release.yml` runs `ci.yml` first; one dry run per release allowed;
  CodeQL still scans PRs. `gh` is installed and signed in (`C:\Program Files\GitHub CLI\gh.exe`).
- **Blockers:** none (001's checks wait on the maintainer's hardware, by choice)

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
