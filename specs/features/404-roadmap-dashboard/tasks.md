<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 404 — Roadmap data (JSON) and a roadmap dashboard on localhost · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

## First version (Markdown as source)

- [x] **T001** — Folders, wiring and the mini fixture. · files: `tools/**`, `package.json`, `eslint.config.js`, `.dockerignore` · test: `npm run check` green
  - **Result (2026-10-09):** `tools/specs-index/` and `tools/roadmap-dashboard/`; npm scripts; lint blocks; `tools` in `.dockerignore`; hand-written mini fixture.
- [x] **T010** — Schema validator and schemas (tests first). · files: `tools/specs-index/lib/schema.mjs`, `specs/schema/*` · test: `test/schema.test.mjs`
  - **Result (2026-10-09):** validator for the JSON Schema subset the schemas use; green.
- [x] **T012** — Ticks, roadmap.md, sync and check (tests first). · files: `tools/specs-index/lib/*` · test: `test/sync.test.mjs`, `test/check.test.mjs`
  - **Result (2026-10-09):** 29 tests first, then the code; green.
- [x] **T014** — Ops and CLI, `import` (tests first). · files: `tools/specs-index/lib/ops.mjs`, `cli.mjs` · test: `test/ops.test.mjs`, `test/cli.test.mjs`
  - **Result (2026-10-09):** `new`, `import`, `status`, `done`; 54 tests.
- [x] **T020** — Backfill roadmap.json and 6 feature.json files. · files: `specs/**` · test: `npm run specs:check`
  - **Result (2026-10-09):** 25 items, 6 features; roadmap.md generated; nothing lost.
- [x] **T030** — Plain HTML dashboard with tests, checked with axe. · files: `tools/roadmap-dashboard/**` · test: `test/*.test.mjs`
  - **Result (2026-10-09):** 79 tool tests; axe 0 serious at 1280 / 360. Replaced by the rework below at the maintainer's request.

## Data: one JSON per feature

- [x] **T100** — Failing tests: schema 2 on a v2 mini fixture (AC-1), the three generators byte for byte and sync idempotence (AC-2), every check rule on v2 (AC-6). · files: `tools/specs-index/test/fixtures/mini/**`, `test/schema.test.mjs`, `test/render.test.mjs`, `test/check.test.mjs` · test: fails
  - **Result (2026-10-09):** v2 mini fixture written by hand (JSON only); tests for schema 2 (oneOf, groupIntros), the three generators byte for byte, sync (idempotent, CRLF kept, stale generated files removed, hand-written ones left) and 18 check rules; failed first (modules missing).
- [x] **T101** — Schema 2, template, `lib/render/*`, `sync.mjs`, `check.mjs`, `store.mjs`; delete `markdown.mjs`, `parse-md.mjs`. · files: `those` · test: T100
  - **Result (2026-10-09):** schema 2, `lib/render/feature.mjs` + `render/roadmap.mjs`, sync and check rewritten; `markdown.mjs`, `parse-md.mjs` and `import` deleted (nothing reads Markdown any more). 35 tests green on the first run.
- [x] **T102** — Failing tests: `setTaskStatus`, `setCriterion`, `setStatus`, `newFeature` (AC-5); CLI `start`, `block`, `done`, `undone`, `new`, `status` (AC-5); hook Pre / Post (AC-4). · files: `test/ops.test.mjs`, `test/cli.test.mjs`, `test/hook.test.mjs` · test: fails
  - **Result (2026-10-09):** tests for setTaskStatus / setCriterion / setStatus / newFeature, the CLI (start, block, done, undone, status, new) and the hook (Pre refuses generated files, Post regenerates or reports problems, bad input passes); failed first.
- [x] **T103** — `ops.mjs`, `cli.mjs`, `hook.mjs`, `.claude/settings.json`. · files: `those` · test: T102
  - **Result (2026-10-09):** `ops.mjs`, `cli.mjs`, `hook.mjs`; 56 tests green.
- [x] **T104** — Migration (§5): scratch script, word check, 202 T001 blocked; regenerate all Markdown; `npm run check`. · files: `specs/features/*/feature.json`, `*.md` · test: word check passes, `npm run specs:check`
  - **Result (2026-10-09):** scratch migration of the 6 features: word check (every word of the old spec, plan and tasks, HTML comments aside, is in the regenerated Markdown): 0 lost after adding `spec.groupIntros` (000 and 001 have a paragraph under some criteria groups). Counts unchanged (202: 13 criteria, 21 tasks / 11 done; 201: 12 / 12, 21 / 21; 401: 7 / 7, 6 / 6). 202 AC-11's range T012–T015 expanded. 202 T001 is blocked (manual checks). All Markdown regenerated.
- [x] **T105** — Workflow (AC-7): `specs/workflow.md`, `/spec-new`, `/spec-plan`, `/spec-tasks`, `/spec-implement`, `/spec-verify`, `CLAUDE.md`, templates. · files: `those` · test: manual read
  - **Result (2026-10-09):** `/spec-new` (writes `spec` in feature.json), `/spec-plan` (`plan`), `/spec-tasks` (`tasks`), `/spec-implement` (start → done / block), `/spec-verify`; `specs/workflow.md` "One JSON per feature" and stages 1–4; `CLAUDE.md`. The hook was checked live: an Edit of `specs/roadmap.md` in this session was refused with the message naming `specs/roadmap.json`.

## Dashboard: React + TypeScript

- [x] **T110** — App skeleton: `app/` (Vite, React 19, TypeScript), tsconfig reference, lint block, `.gitignore`; server builds and serves it, `--dev`. · files: `tools/roadmap-dashboard/**`, `tsconfig.json`, `eslint.config.js`, `.gitignore` · test: `npm run typecheck`, `npm run lint`
  - **Result (2026-10-09):** `app/` (Vite, React 19, TypeScript; the repo's own packages), `tsconfig.json` in the root references (`types: []` as the root does), lint block, `.build/` git-ignored, `vite-env.d.ts`; the server builds the app on start (0.12–0.2 s) or runs Vite middleware with `--dev`.
- [x] **T111** — Failing tests: `lib/roadmap.ts`, `lib/board.ts`, `lib/filter.ts`, `lib/markdown.ts` (AC-10, AC-11); server: build and serve, API v2, POST move with Origin rules, JSON watcher (AC-4, AC-8, AC-12, AC-13). · files: `app/src/lib/*.test.ts`, `test/server.test.mjs` · test: fails
  - **Result (2026-10-09):** 15 app-lib tests (roadmap, board, filter, Markdown) and server / project tests (built page and CSP, API v2, POST move with Origin / type / size rules, JSON watcher, busy port) written first; failed.
- [x] **T112** — Implement the libs and the server until T111 passes. · files: `those` · test: T111
  - **Result (2026-10-09):** libs and server green (90 tool tests). Two test expectations corrected: `/assets/../index.html` is normalised by fetch, not a traversal.
- [x] **T113** — Theme (AC-9) and the roadmap page (AC-10). · files: `app/src/styles/*`, `app/src/components/Roadmap*` · test: browser check
  - **Result (2026-10-09):** theme from the app's tokens and design.md (Graphite, marigold only on the stage, airmail stripe, Schibsted / Geist / Instrument Serif); roadmap page: current phase on the dark stage (`currentPhase` added to roadmap.json: Baseline still has 001 in progress), stats strip, status chips, folded phases, Now, backlog.
- [x] **T114** — Feature page: board with drag and drop, "Move to" menu, reason dialog; Spec, Plan, Documents tabs (AC-11). · files: `app/src/components/*` · test: browser check
  - **Result (2026-10-09):** feature page: header with ring and counts, tabs Board / Spec / Plan / Documents; board with native drag and drop, Move menu (Escape returns focus), reason dialog (Enter saves). Found in the browser: dragover arrived before React state, so the dragged card is held in a ref; Enter in the reason textarea added a line instead of saving.

## Verify

- [x] **T120** — Browser script: axe at 1280 / 360 light / dark on the roadmap and 202's tabs, drag and keyboard moves, no console errors (AC-11, AC-14). · files: `scratch` · test: 0 serious / critical
  - **Result (2026-10-09):** scratch Playwright + axe run on the real repo and on a temp copy for moves: 7 views at 1280 light and 360 dark: axe 0 serious / critical, 0 px sideways. Drag T030 → In progress and keyboard Move T031 → Blocked with a reason: board, feature.json and tasks.md agree. Console: two real errors fixed (Google Fonts needed in connect-src; a 404 asking for a feature with no folder); the remaining inline-style CSP report comes from axe's own injected script (confirmed: none without axe). Playwright's one-call dragAndDrop doesn't start a native drag here; real mouse steps do.
- [x] **T121** — Docs (AC-16): both READMEs, `specs/build.md`, `specs/architecture.md`. · files: `those` · test: manual read
  - **Result (2026-10-09):** both READMEs rewritten (data, no-sync design, commands, layout, routes, security, upgrading), `specs/build.md`, `specs/architecture.md`.
- [x] **T122** — Gates: `npm run check`, `npm run build`, `npm run check:licenses`; ACs, status, memory. · files: `feature.json`, `memory/*` · test: the gates
  - **Result (2026-10-09):** `npm run check` green (0 lint errors, specs:check valid, 1080 tests), `npm run build` (entry 327 KB of 350, nothing of tools/ in dist/), `npm run check:licenses` green; package.json: scripts only. Not run: test:e2e, npm test, test:mcp (no app code changed).

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T100, T101 |
| AC-2 | T100, T101 |
| AC-3 | T104 |
| AC-4 | T102, T103, T111, T112 |
| AC-5 | T102, T103 |
| AC-6 | T100, T101 |
| AC-7 | T105 |
| AC-8 | T110, T111, T112 |
| AC-9 | T113 |
| AC-10 | T111, T112, T113 |
| AC-11 | T111, T112, T114, T120 |
| AC-12 | T111, T112 |
| AC-13 | T111, T112 |
| AC-14 | T120 |
| AC-15 | T122 |
| AC-16 | T121 |
