<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 406 — Roadmap improvements: next actions, task briefs and planning clarity · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved. Build on existing roadmap behavior rather than reimplementing the road, hero, dependency detail links, story tab, or title/status search from 405.

## Approach

§1 — Next-work clarity: retain the current hero's in-progress and first-todo task model, but make its no-todo state explicit and keep blocked work visibly separate. Add a pure helper/test only if the current progress model cannot prove that behavior.

§2 — Copyable agent briefs: add a pure formatter for a selected task using the already-loaded FeatureData: feature name/ID, task ID and full text, covered acceptance criteria, files and proving test when present, plus a short plan header/context. Keep the output within 2,000 characters without truncating task text or test; if the required fields cannot fit, report a clear copy failure. Add a one-action copy control to each board task card and an accessible success/error live message.

§3 — Dependencies and user outcomes: retain feature-page prerequisite/unlock links and show the same recorded relationships on roadmap stops. On feature detail, surface the feature summary (or first user story if the summary is empty) beside task progress.

§4 — Discovery and trust: extend the existing search/status filter with phase selection, preserving independent filters in the URL and the current dimmed-stop behavior. Show `roadmap.updated` and label Pace as recent historical activity, not a forecast. Add responsive and accessible browser coverage; no new metadata, dependency, network call or backend.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| tools/roadmap-dashboard/app/src/lib/taskBrief.ts | new | Format a bounded, task-specific agent brief using existing feature data. |
| tools/roadmap-dashboard/app/src/lib/taskBrief.test.ts | new | Prove brief contents, missing fields and length boundary. |
| tools/roadmap-dashboard/app/src/lib/filter.ts | modify | Add phase matching to the existing pure search/status predicate. |
| tools/roadmap-dashboard/app/src/lib/filter.test.ts | modify | Cover phase and combined filter behavior. |
| tools/roadmap-dashboard/app/src/lib/roadmap.ts | modify | Expose readiness/relationship helpers only if existing helpers do not cover stop-level presentation. |
| tools/roadmap-dashboard/app/src/components/RoadmapPage.tsx | modify | Add phase filter control, update-date disclosure, and truthful Pace label. |
| tools/roadmap-dashboard/app/src/components/Road.tsx | modify | Expose recorded prerequisite and unlock links on road stops. |
| tools/roadmap-dashboard/app/src/components/FeaturePage.tsx | modify | Show the outcome summary beside feature task progress. |
| tools/roadmap-dashboard/app/src/components/Board.tsx | modify | Add a one-action copy-brief control for task cards with accessible feedback. |
| tools/roadmap-dashboard/app/src/styles/app.css | modify | Style new controls and outcome/relationship text responsively using existing theme tokens. |
| tools/roadmap-dashboard/e2e/road.e2e.ts | modify | Verify roadmap and board UI behavior, accessibility and narrow viewport. |

## Data Structures & Interfaces

- Extend the roadmap filter input with an optional `phase` key; pass each stop's phase ID into the existing `matchItem` predicate.
- Add a pure `taskBrief(feature, taskId)` formatter that resolves the task, covered criterion texts, files, test and bounded plan context from a `Feature` object. Return a string or a typed failure for an unknown task / required content exceeding the 2,000-character budget.
- Do not change the dashboard API schema: all required task data is available from the existing feature endpoint and the board already loads it.

## Techniques

- Preserve the URL-driven filter pattern (`q`, `status`, plus `phase`) and update it when a new roadmap hash is opened in the same tab.
- Use the browser Clipboard API from a user-initiated button; announce success/failure through the board's existing `role=status` region and do not silently swallow a rejection.
- Render dependency relationships as links using the existing roadmap dependency helpers and render markdown through the existing safe `Md` component.
- Keep all filtering and brief construction pure and local; add no package or service.

## Test Approach

| AC | Test file | Type |
| --- | --- | --- |
| AC-1 | `tools/roadmap-dashboard/e2e/road.e2e.ts` | e2e: running, next todo, blocked and no remaining task states |
| AC-2 | `tools/roadmap-dashboard/app/src/lib/taskBrief.test.ts`; `tools/roadmap-dashboard/e2e/road.e2e.ts` | unit + e2e: exact fields, missing optional fields, 2,000-character boundary, clipboard action and failure announcement |
| AC-3 | `tools/roadmap-dashboard/app/src/lib/roadmap.test.ts`; `tools/roadmap-dashboard/e2e/road.e2e.ts` | unit + e2e: prerequisite/dependent links and non-blocking when no unfinished prerequisite exists |
| AC-4 | `tools/roadmap-dashboard/e2e/road.e2e.ts` | e2e: summary/story appears next to progress |
| AC-5 | `tools/roadmap-dashboard/app/src/lib/filter.test.ts`; `tools/roadmap-dashboard/e2e/road.e2e.ts` | unit + e2e: phase/status/search combination, clearing filters, URL updates, keyboard and 360 px layout |
| AC-6 | `tools/roadmap-dashboard/e2e/road.e2e.ts` | e2e: recorded update date and historical Pace label; no forecast shown |

Run `npx vitest run tools/roadmap-dashboard/app/src/lib/taskBrief.test.ts tools/roadmap-dashboard/app/src/lib/filter.test.ts tools/roadmap-dashboard/app/src/lib/roadmap.test.ts`, then `npm run test:roadmap`.

## Risks & Mitigations

| File | Change | Purpose |
| --- | --- | --- |
| tools/roadmap-dashboard/app/src/lib/taskBrief.ts | new | Format a bounded, task-specific agent brief using existing feature data. |
| tools/roadmap-dashboard/app/src/lib/taskBrief.test.ts | new | Prove brief contents, missing fields and length boundary. |
| tools/roadmap-dashboard/app/src/lib/filter.ts | modify | Add phase matching to the existing pure search/status predicate. |
| tools/roadmap-dashboard/app/src/lib/filter.test.ts | modify | Cover phase and combined filter behavior. |
| tools/roadmap-dashboard/app/src/lib/roadmap.ts | modify | Expose readiness/relationship helpers only if existing helpers do not cover stop-level presentation. |
| tools/roadmap-dashboard/app/src/components/RoadmapPage.tsx | modify | Add phase filter control, update-date disclosure, and truthful Pace label. |
| tools/roadmap-dashboard/app/src/components/Road.tsx | modify | Expose recorded prerequisite and unlock links on road stops. |
| tools/roadmap-dashboard/app/src/components/FeaturePage.tsx | modify | Show the outcome summary beside feature task progress. |
| tools/roadmap-dashboard/app/src/components/Board.tsx | modify | Add a one-action copy-brief control for task cards with accessible feedback. |
| tools/roadmap-dashboard/app/src/styles/app.css | modify | Style new controls and outcome/relationship text responsively using existing theme tokens. |
| tools/roadmap-dashboard/e2e/road.e2e.ts | modify | Verify roadmap and board UI behavior, accessibility and narrow viewport. |

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | The maintainer accepted the Q1–Q3 defaults; this approved spec and plan precede implementation. |
| II. Test-Gated Delivery | ✅ | Pure formatter and filter behavior get unit tests; dashboard interactions get Playwright coverage. |
| III. Simplicity and Small Dependencies | ✅ | Use existing React, Clipboard API, and dashboard helpers; add no dependencies. |
| IV. Memory Is Maintained | ✅ | Update progress and current state during verification. |
| V. Free and Open Source, Always | ✅ | No paid capability or restriction is introduced. |
| VI. On the User's Device, No Backend | ✅ | All dashboard behavior stays local and reads existing repository data. |
| VII. Permissive Licences Only | ✅ | No library, model, binary, font or asset is added. |
| VIII. What You See Is What You Get | ✅ | Not applicable to this development dashboard; no product renderer changes. |
| IX. Secure Desktop Shell | ✅ | No Electron IPC or desktop shell changes. |
| X. Budgets and Accessibility | ✅ | Dashboard remains development-only; added controls are keyboard-accessible, responsive and covered by axe checks. |
| XI. Agents Use the Same Code | ✅ | This is a development dashboard feature, not a user-facing studio feature or new agent tool. |
