<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 406 — Roadmap improvements: next actions, task briefs and planning clarity · Tasks

Implement one focused dashboard improvement at a time. Test pure formatting/filter behavior before UI changes, and use the existing Playwright roadmap suite for visible behavior.

## Copyable task briefs

- [x] **T001** — Test-first: add a pure `taskBrief(feature, taskId)` formatter with a 2,000-character limit. Include feature/task identity and full task text, covered criteria, files, proving test, and concise plan context when available; do not truncate required task text or test. Prove unknown tasks, missing optional fields and over-budget required content. · files: `tools/roadmap-dashboard/app/src/lib/taskBrief.ts`, `tools/roadmap-dashboard/app/src/lib/taskBrief.test.ts` · test: npx vitest run tools/roadmap-dashboard/app/src/lib/taskBrief.test.ts
  - **Result (2026-10-11):** Added taskBrief formatter with full task instructions, relevant criteria, files, proving test and bounded feature/plan context. Unknown tasks and required content over 2,000 characters return explicit failures; optional context is omitted rather than required content truncated. Focused tests 5/5; npm run check passed, 44 files / 1,359 tests, lint 0 errors (5 existing warnings).
- [x] **T002** — Add a Copy task brief action to each board task card using its loaded feature data. Announce successful copy and surface clipboard errors accessibly; do not report success when the clipboard rejects the write. · files: `tools/roadmap-dashboard/app/src/components/Board.tsx`, `tools/roadmap-dashboard/app/src/styles/app.css`, `tools/roadmap-dashboard/e2e/road.e2e.ts` · test: npm run test:roadmap (copy success and rejected clipboard write)
  - **Result (2026-10-11):** Added Copy brief to task cards, using the new formatter. Success is announced in the board live region; unknown/overlong briefs and Clipboard API failures are surfaced as accessible errors without a success message. `npm run test:roadmap -- -g 'task briefs'`: 2/2 passed. `npm run check`: typecheck and specs:check passed, lint 0 errors (5 existing warnings), 44 unit files / 1,359 tests passed.

## Roadmap discovery and context

- [x] **T010** — Test-first: extend the roadmap match predicate to filter by phase in addition to its existing title search and status filter; verify independent and combined filters across 1,000 synthetic items. · files: `tools/roadmap-dashboard/app/src/lib/filter.ts`, `tools/roadmap-dashboard/app/src/lib/filter.test.ts` · test: npx vitest run tools/roadmap-dashboard/app/src/lib/filter.test.ts
  - **Result (2026-10-11):** Added optional phase matching to matchItem; focused filter tests passed (4/4), including combined phase/status/query filtering and 1,000-item behavior. Repository check reached Vitest but failed before executing tests: 44/44 suites error with TypeError reading undefined.config, including unrelated files.
- [x] **T011** — Add a phase selector to the existing roadmap filters, preserve phase/search/status in the URL, and display the recorded roadmap update date and historical Pace label. Verify filter clearing, keyboard access, updated labels, and the 360 px layout. · files: `tools/roadmap-dashboard/app/src/components/RoadmapPage.tsx`, `tools/roadmap-dashboard/app/src/components/Activity.tsx`, `tools/roadmap-dashboard/app/src/styles/app.css`, `tools/roadmap-dashboard/e2e/road.e2e.ts` · test: npm run test:roadmap
  - **Result (2026-10-11):** Added a phase selector that combines with search/status and persists/clears filters independently in URL parameters; memoized item-to-phase lookup; displayed roadmap.json's recorded update date and labeled Pace as historical completed-task data, not a forecast. Roadmap E2E 22/22 passed (including keyboard/360 px checks); npm run check passed (44 files, 1,361 tests; lint 0 errors, 5 existing warnings).
- [x] **T020** — Show recorded prerequisites and downstream dependents as links on roadmap stops. Keep completed prerequisites distinct from unfinished prerequisites and do not imply blockers when there are none. · files: `tools/roadmap-dashboard/app/src/components/Road.tsx`, `tools/roadmap-dashboard/app/src/styles/app.css`, `tools/roadmap-dashboard/e2e/road.e2e.ts` · test: npm run test:roadmap (prerequisite and unlock links)
  - **Result (2026-10-11):** Road stops now show linked prerequisite and dependent roadmap entries outside their main card link; prerequisites are labeled complete or unfinished and no waiting label appears when all needs are done. Focused dependency E2E passed (1/1); npm run check passed (44 files, 1,361 tests; lint 0 errors, 5 existing warnings).

## Clarity and verification

- [x] **T030** — Show the feature's outcome summary beside its task progress on the feature detail page, falling back to the first user story only when the summary is empty. · files: `tools/roadmap-dashboard/app/src/components/FeaturePage.tsx`, `tools/roadmap-dashboard/app/src/styles/app.css`, `tools/roadmap-dashboard/e2e/road.e2e.ts` · test: npm run test:roadmap (feature outcome alongside task progress)
  - **Result (2026-10-11):** Feature detail shows the spec summary in an Outcome panel in the header alongside task progress; when the summary is blank, it displays the first user story. Browser checks passed for summary and fallback (1/1); npm run check passed (44 files, 1,361 tests; lint 0 errors, 5 existing warnings).
- [x] **T040** — Verify the roadmap hero distinguishes running, first todo, blocked, and all-complete task states for an in-progress feature. Update the hero only if a state is ambiguous, and run the focused dashboard checks. · files: `tools/roadmap-dashboard/e2e/road.e2e.ts`, `tools/roadmap-dashboard/app/src/components/Hero.tsx` · test: npm run test:roadmap (running, first todo, blocked and no remaining task states)
  - **Result (2026-10-11):** Verified the hero shows all running tasks, the first todo (not a blocked task), recorded blockers when no todo remains, and a full completion state. Clarified the empty Next state as ‘No todo tasks remain.’ Focused hero E2E passed (1/1); roadmap E2E passed (25/25); npm run check passed (44 files, 1,361 tests; lint 0 errors, 5 existing warnings).

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T040 |
| AC-2 | T001, T002 |
| AC-3 | T020 |
| AC-4 | T030 |
| AC-5 | T010, T011 |
| AC-6 | T011 |
