# 401 — AI models on this device: see and delete downloaded models · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

## Tests first

- [x] **T010** — Failing unit tests: `modelRow` for each state; `modelState` / `deleteModel` with stubbed OPFS,
      `fetch`, `Worker` and canvas (stored → deleted → none; bundled refused; refused while a search runs; the worker
      ended when it held the model). · files: `src/ai/segment/segment.test.ts` · test: fails

## Core

- [x] **T020** — `modelRow`, `modelState`, `deleteModel` (replacing `forgetModel`), the `busy` count. · files:
      `src/ai/segment/models.ts`, `src/ai/segment/index.ts` · test: T010
  - **Result T010 + T020 (2026-10-07):** 6 tests first (all failed: functions missing), then `modelRow(state)` in
    `models.ts` (the plan's `m` argument dropped: the text depends on the state only) and `modelState` /
    `deleteModel` in `index.ts` (`forgetModel`, never called, removed); `run()` counts searches in `busy`, downloads
    included. The tests stub OPFS, canvas, `Worker` and `fetch` (Vitest runs in Node). `npm run check` 971.
    Break-tests: no busy guard → 1 failed; no worker shutdown → 1 failed; restored.

## UI

- [x] **T030** — The Settings section with rows, Delete buttons and the status line; e2e in `instagram.e2e.ts`
      (sparse 176 MB OPFS file, Delete, reload, other data kept, sky mask asks again, axe, 360 px). · files:
      `src/components/ai/AiSettings.tsx`, `e2e/instagram.e2e.ts` · test: the new e2e test
  - **Result (2026-10-07):** `ModelsOnDevice` in `AiSettings.tsx` (a `<details>` like "Keys and services"; the
    segmenter loaded with `import()` when it opens), rows with title, size, status and "Delete the sky model", a
    polite status line; `.aimodels` styles. e2e (desktop, and phone at 360 px): a sparse 176 MB `skyseg.onnx` put into
    OPFS shows "On this device"; Delete → "The sky model was deleted: 176 MB freed.", "Not downloaded", the file gone,
    a `localStorage` value kept; still gone after a reload; the next sky mask shows "Download the sky model"; axe
    clean; no sideways scroll. 2 passed; `instagram.e2e.ts` 31 passed / 1 skipped. Entry chunk 327 KB (unchanged).
    AC-3's "works after the download" is P1.8's unchanged download path (not repeated: it needs the real 176 MB file).

## Verify

- [x] **T090** — Docs (AC-7): `docs/AI.md`, `src/data/docs.ts`, `CHANGELOG.md` Unreleased.
  - **Result (2026-10-07):** `docs/AI.md` (where the model lives: OPFS `models/skyseg.onnx`, the desktop app's data
    folder; no folder to open; the Settings section), the in-app docs' AI-masks paragraph, CHANGELOG Added. Docs e2e
    4 passed.
- [x] **T091** — Definition-of-Done gates (`check`, `build`, `test:e2e`, `test`, `test:mcp`, `check:licenses`).
  - **Result (2026-10-07):** `check` 971 (0 lint errors, the 5 known warnings); `build` entry 327 KB of 350;
    `check:licenses` 168 packages; `test:e2e` 76 passed / 10 skipped (phone runs of desktop-only tests) / 0 failed /
    0 flaky; `npm test` 6,124 / 0 (timing 11.0 ms / 2.69 s fastest); `test:mcp` passed. The working tree also held
    202's engine work (T010–T018), so these runs cover it too.
- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), roadmap 401 → ✔️, `memory/progress.md`,
      `memory/MEMORY.md`.

## AC coverage

| AC   | Tasks            |
| ---- | ---------------- |
| AC-1 | T010, T020, T030 |
| AC-2 | T010, T020, T030 |
| AC-3 | T030             |
| AC-4 | T010, T020       |
| AC-5 | T010, T020       |
| AC-6 | T030             |
| AC-7 | T090             |
