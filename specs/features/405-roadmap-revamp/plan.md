<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 405 — Roadmap dashboard revamp: a scrollable road, motion and live task progress · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-10, D1–D4 as recommended, D-029) <!-- Draft | Approved -->

## Approach

What the dashboard is today (read for this plan, `main` at `ecb55df`):

- `RoadmapPage.tsx` renders the current phase as a dark **stage** of tiles (`PhaseStage`), then totals, problems,
  search / status chips (replacing the phases by a Results list while filtering), every phase as a `<details>` fold,
  the Now panel and the backlog. `App.tsx` scrolls to the top and focuses the page's `h1` on every route change.
- `/api/project` (`lib/project.mjs`) gives per feature a summary with `progress` from `tools/specs-index`
  `progress()`: criteria and task counts, open questions and the next task. Task details (sections, running and
  blocked tasks, `startedOn` / `doneOn`) are only in `/api/features/NNN`. `useProject()` polls `/api/version` every
  2 s and reloads the project when it changes. Motion today: a few CSS transitions on bars and the board, and no
  `prefers-reduced-motion` rule.

**§1 Data for the road (`tools/specs-index`, API 3).** `progress(feature)` adds what the road and the hero need,
derived from `feature.json` (no new stored field): `sections` (each task section's title, done, total), `running`
(tasks in progress: id, text, section, startedOn), `blocked` (id, text, reason), `finished` (done tasks with a
`doneOn`: id, text, doneOn) and `statuses` (task id → status, for the live diff). `/api/project` carries it in each
summary; `API_SCHEMA` goes to 3 in `lib/project.mjs` and `types.ts`, so an old page asks for a restart (404's
mechanism). Release milestones (Q7): an optional `release` string on a phase in `specs/schema/roadmap.schema.json`
(additive: today's files stay valid, `schema` stays 1); `roadmap.json` gets `"release": "3.0.0"` on Phase 2 and
`"3.1.0"` on Phase 3; `roadmap.md` shows it in the phase heading.

**§2 The road as pure logic (`app/src/lib/road.ts`, new).** `buildRoad(roadmap, features)` gives the stops in
roadmap order (phase `order`, then each phase's items; AC-1), each with its phase, roadmap status, feature summary,
state `travelled | current | ahead` and kind (done, in progress, blocked when its feature has blocked tasks,
approved, drafted, not started; AC-2), and the phase regions with their progress (items and tasks done / total,
release; AC-3). `currentStop()` is `currentPhase()`'s first item in progress, else the first item not done (404's
rule extended to one stop). `heroModel(stop, summary)` gives the ring, the section segments, running tasks, the next
task and blocked tasks (AC-6); `roadblocks(road)` lists every blocked task with its stop (AC-7).

**§3 Pace and live changes as pure logic.** `app/src/lib/pace.ts` (new): `perDay(features, today, 14)` counts
`finished` per local date (days with none are 0, tasks without `doneOn` are left out; AC-13), `finishedOn(day)` lists
them, and `featureAge(summary, today)` gives days since started, days taken for done features and `quiet` (in
progress with nothing finished in 7 days; AC-14). Dates are local `YYYY-MM-DD`, as the CLI writes them
(`localToday`). `app/src/lib/changes.ts` (new): `diffProjects(prev, next)` compares each feature's `statuses` and
`status`, giving `{ feature, task?, from, to }[]` and one announcement text ("204 T030 done", several joined); empty
for the first load, for features that appeared or vanished, and when the schema is stale (AC-10).

**§4 The road on screen (`components/Road.tsx`, new).** The facts are a plain ordered list: each phase a region with
an `h2`, each stop an `li` with id, title, status text, progress and links (AC-16). On wide screens the stops sit
alternately left and right of a centre line; at ≤ 640 px they form one column with the road on the left edge. The
road itself is one `aria-hidden` SVG behind the list: `Road` measures each stop's anchor point (a
`ResizeObserver` on the list, one measurement per animation frame) and `roadPath(points)` (`app/src/lib/geometry.ts`,
new, pure) builds a smooth path through them (cubic Béziers with Catmull-Rom tangents: T001 found vertical tangents give kinked S-bends), with each anchor near its own column's inner edge so the road swings across the gap (anchors at the centre made a straight line), split at the current stop into
**travelled** (solid) and **ahead** (dashed, faint) parts. A third copy of the travelled part is the **drawn** line:
its `stroke-dashoffset` follows the scroll position (AC-9). Phase regions end with their release milestone (§1).
Items without a spec are faint and not links (AC-8, Q4).

**§5 Now: the hero and blocked tasks (`components/Hero.tsx`, new).** The current stop opens into the dark stage (the
only place marigold appears, as 404): feature title and status, task ring, section segments, running tasks (id,
text, section, started), the next task, blocked tasks with reasons linking to the board filtered to that task, and
its age and quiet mark (AC-6, AC-7, AC-14). A "Blocked" list near the hero shows every roadblock when there are any.
The "you are here" marker on the road pulses slowly (the only animation while the page stands still; AC-9).

**§6 Rail, opening position and filters.** `components/RouteRail.tsx` (new): a sticky rail with one mark per phase
and stop, the current position, and the stretch in view (from an `IntersectionObserver` on the stops); marks are
links (`#/?at=203`) that scroll the stop into view and move focus to it; ≤ 640 px it folds into a bottom bar with the
phase in view and "Back to now" (AC-4). Opening: `App.tsx` no longer scrolls the roadmap to the top; `RoadmapPage`
scrolls once, on its first render, to `?at=` or the current stop (instant, centred) and offers "Back to now" (AC-5);
later data refreshes keep the scroll (404's AC-12). Search and status filter stay in the URL; non-matching stops are
dimmed (`aria-hidden` stays off: they're still listed, with "not matching" in their accessible name), the rail shows
only matches, and the count says "n of 26 items" (AC-15). Totals, problems, Now and backlog stay, below the road.

**§7 Motion (`app/src/lib/motion.ts`, new).** `useReducedMotion()` (the media query, live); `useReveal(ref)`: the
first time an element enters the view (`IntersectionObserver`), its bar or ring animates from 0 to its value with the
Web Animations API and its count counts up (≤ 600 ms); `useScrollDraw(path)`: where the browser supports CSS
scroll-driven animations (`animation-timeline: scroll()`), the drawn line is a CSS animation; elsewhere a passive
scroll listener sets `--drawn` once per animation frame. Live changes: `useLiveChanges(project)` keeps the previous
project, runs `diffProjects`, marks the changed stops and the hero for 2 s (an airmail-stripe sweep: a gradient moved
with `transform`, no layout) and writes the announcement into one polite live region. With reduced motion the road is
drawn complete, values show at once, the marker is still and changes get a static outline for 2 s plus the
announcement (AC-11). Only `transform`, `opacity` and `stroke-dashoffset` are animated (AC-12).

**§8 Feature page, lightly (Q8).** `FeaturePage.tsx`'s header gets the hero's ring and section segments (shared
`Ring` and `Segments` in `bits.tsx`); `Board.tsx` animates a card that changed column (drag, menu or live change)
from its old position to its new one (FLIP with the Web Animations API, skipped with reduced motion). Columns and
behaviour stay as 404 built them.

**§9 Tests at the end, light per task.** Pure logic (§1–§3, `roadPath`) is unit-tested first, in Vitest with small
fixtures (fast, in `npm run check`). Each UI task is checked by `npm run check` and a look in `npm run roadmap --
--dev`. One committed browser script at the end, `tools/roadmap-dashboard/e2e/road.e2e.ts` with its own config
(`playwright.roadmap.config.ts`, as `playwright.measure.config.ts`; `npm run test:roadmap`), runs the dashboard on a
temporary copy of `specs/` and `memory/` (`server.mjs --root <copy> --static <build> --port 0 --no-open`) for the
e2e, axe, reduced-motion, live-change and frame-timing checks; it isn't part of `npm run check` or CI.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `tools/specs-index/lib/store.mjs` | modify | §1 `progress()`: sections, running, blocked, finished, statuses |
| `tools/roadmap-dashboard/test/project.test.mjs`, `tools/specs-index/test/fixtures/mini/` | modify | §1 the summary's new `progress` fields on the mini fixture (tasks with sections, dates, a blocked reason) |
| `specs/schema/roadmap.schema.json`, `specs/roadmap.json`, `tools/specs-index/lib/render/` (roadmap) | modify | §1 optional phase `release` (Q7); 3.0.0 and 3.1.0; shown in `roadmap.md` |
| `tools/roadmap-dashboard/lib/project.mjs`, `app/src/types.ts` | modify | §1 API 3, `Progress` and `Phase.release` types |
| `tools/roadmap-dashboard/app/src/lib/road.ts`, `road.test.ts` | new | §2 stops, states, regions, hero model, roadblocks |
| `tools/roadmap-dashboard/app/src/lib/pace.ts`, `pace.test.ts` | new | §3 per-day counts, finished today, feature age, quiet |
| `tools/roadmap-dashboard/app/src/lib/changes.ts`, `changes.test.ts` | new | §3 live diff and announcement |
| `tools/roadmap-dashboard/app/src/lib/geometry.ts`, `geometry.test.ts` | new | §4 road path through stop points, split at the current stop |
| `tools/roadmap-dashboard/app/src/lib/motion.ts` | new | §7 reduced motion, reveal, scroll drawing, live changes |
| `tools/roadmap-dashboard/app/src/components/Road.tsx` | new | §4 regions, stops, SVG road, milestones |
| `tools/roadmap-dashboard/app/src/components/Hero.tsx` | new | §5 the current stop on the dark stage, blocked list |
| `tools/roadmap-dashboard/app/src/components/RouteRail.tsx` | new | §6 rail and the 360 px bar, Back to now |
| `tools/roadmap-dashboard/app/src/components/Activity.tsx` | new | §3 / AC-13 today and 14-day chart (numbers as text) |
| `tools/roadmap-dashboard/app/src/components/RoadmapPage.tsx` | modify | §6 composes road, hero, rail, activity; filters dim; totals, problems, Now, backlog kept |
| `tools/roadmap-dashboard/app/src/App.tsx`, `route.ts` | modify | §6 open at the current stop / `?at=`; no scroll-to-top for the roadmap |
| `tools/roadmap-dashboard/app/src/components/bits.tsx`, `FeaturePage.tsx`, `Board.tsx` | modify | §8 shared Ring / Segments, feature header, card move animation |
| `tools/roadmap-dashboard/app/src/styles/app.css` | modify | §4–§8 road, hero, rail, activity, highlight sweep, reduced motion (tokens only) |
| `tools/roadmap-dashboard/e2e/road.e2e.ts`, `playwright.roadmap.config.ts`, `package.json` (`test:roadmap`) | new | §9 browser checks: e2e, axe, reduced motion, live change, frame timing |
| `tools/roadmap-dashboard/README.md` | modify | the road, motion rules, API 3, the browser script |

## Data Structures & Interfaces

```ts
// tools/specs-index/lib/store.mjs: progress(feature) gains (types in app/src/types.ts)
interface Progress {
  criteria: { done: number; total: number };
  tasks: { done: number; total: number; byStatus: Record<TaskStatus, number> };
  openQuestions: number;
  next: { id: string; text: string; status: TaskStatus } | null;
  sections: { title: string; done: number; total: number }[];          // in tasks.sections order
  running: { id: string; text: string; section: string; startedOn: string | null }[];
  blocked: { id: string; text: string; reason: string | null }[];
  finished: { id: string; text: string; doneOn: string }[];            // done tasks with a doneOn
  statuses: Record<string, TaskStatus>;                                // task id → status (live diff)
}
interface Phase { /* … */ release?: string | null }                    // roadmap.schema.json, optional (Q7)
export const API_SCHEMA = 3;

// app/src/lib/road.ts
type StopState = 'travelled' | 'current' | 'ahead';
type StopKind = 'done' | 'in-progress' | 'blocked' | 'approved' | 'drafted' | 'not-started';
interface Stop { id: string; phase: string; item: RoadmapItem; feature?: FeatureSummary; state: StopState; kind: StopKind; index: number }
interface Region { phase: string; title: string; goal?: string | null; exit?: string | null; release?: string | null;
                   items: { done: number; total: number }; tasks: { done: number; total: number }; stops: Stop[] }
export function buildRoad(roadmap: Roadmap, features: Record<string, FeatureSummary>): { regions: Region[]; stops: Stop[]; current: Stop | null };
export function heroModel(stop: Stop): { ring: { done: number; total: number }; segments: Progress['sections'];
  running: Progress['running']; next: Progress['next']; blocked: Progress['blocked'] } | null;
export function roadblocks(stops: Stop[]): { stop: Stop; task: Progress['blocked'][number] }[];

// app/src/lib/pace.ts
export function perDay(features: Record<string, FeatureSummary>, today: string, days: number): { day: string; count: number }[];
export function finishedOn(features: Record<string, FeatureSummary>, day: string): { feature: string; id: string; text: string }[];
export function featureAge(f: FeatureSummary, today: string): { started: string | null; days: number | null; took: number | null; quiet: boolean };

// app/src/lib/changes.ts
interface Change { feature: string; task?: string; from: string; to: string }
export function diffProjects(prev: ProjectData | null, next: ProjectData): { changes: Change[]; announce: string };

// app/src/lib/geometry.ts
export function roadPath(points: { x: number; y: number }[]): string;                 // SVG path data
export function splitAt(points: { x: number; y: number }[], index: number): { travelled: string; ahead: string };

// app/src/lib/motion.ts
export function useReducedMotion(): boolean;
export function useReveal<T extends Element>(ref: RefObject<T>, run: (el: T) => Animation | void): void;
export function useScrollDraw(ref: RefObject<SVGPathElement>): void;
export function useLiveChanges(project: ProjectData): { changed: Set<string>; announce: string };  // ids "204", "204/T030"

// app/src/route.ts: #/?at=203 (stop to open at) joins q and status
```

## Techniques

- **Facts in the DOM, the road as decoration**: stops are a real ordered list (reading order, focus, links, axe); the
  SVG road is `aria-hidden` and drawn through the measured stops, so layout stays CSS (alternating columns, one
  column at 360 px) and the road follows it.
- **Pure logic first**: road, hero, pace, diff and geometry are framework-free functions with fixture tests; the
  components only render them.
- **Derived, not stored**: everything new comes from what `feature.json` already records (statuses, dates,
  sections); the one data addition is the optional phase `release` (Q7).
- **Compositor-only motion**: `transform`, `opacity`, `stroke-dashoffset`; no animated layout properties, no filters;
  one measurement and one style write per animation frame.
- **Progressive scroll drawing**: CSS scroll-driven animations where supported, a passive listener with
  `requestAnimationFrame` elsewhere (Firefox today), same result.
- **Reveal once**: `IntersectionObserver` starts each stop's count-up the first time it shows, then disconnects.
- **FLIP** for board cards that change column (first / last positions, inverted transform, played with the Web
  Animations API).
- **One live region**, one message per change set; highlights keyed by stop and task id, cleared after 2 s.
- **Reduced motion as a first-class state**: every motion hook reads `useReducedMotion()` and has a still result.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `road.test.ts`: `buildRoad` on a fixture roadmap (3 phases, 7 items, one without a spec) and on today's `roadmap.json`: stops in phase and item order, 26 today, ids / titles / statuses / task counts | unit |
| AC-2 | `road.test.ts`: states and kinds for 6 fixtures (none started, mid-phase, blocked item, all done, `currentPhase` set, a phase with no items); status text present for every kind | unit |
| AC-3 | `road.test.ts`: region progress (items and tasks done / total, release); e2e: the current region open, others summarised | unit + e2e |
| AC-4 | `road.e2e.ts`: rail marks = phases + stops; activating a mark scrolls that stop into view and focuses it; at 360 px the bar shows the phase in view | e2e |
| AC-5 | `road.e2e.ts`: `#/` opens with the current stop in view; "Back to now" after scrolling to the end returns; `#/?at=203` opens at 203 | e2e |
| AC-6 | `road.test.ts`: `heroModel` for one running task, two, none (next shown), blocked tasks, all done | unit |
| AC-7 | `road.test.ts`: `roadblocks`; e2e: a roadblock's link opens the board filtered to its task | unit + e2e |
| AC-8 | `road.e2e.ts`: stops with a spec link to `#/feature/NNN/board`; items without one have no link | e2e |
| AC-9 | `road.e2e.ts`: a stop's progress reaches its final value after scrolling into view; the drawn line's offset changes with scroll; manual recording at 1280 px | e2e + manual |
| AC-10 | `changes.test.ts`: diffs (task done, started, blocked, feature status, first load, new feature, stale schema) and the announcement text; e2e: `npm run specs -- done` on the temporary copy → stop highlighted and live region text within 3 s | unit + e2e |
| AC-11 | `road.e2e.ts` with `reducedMotion: 'reduce'`: after scrolling the road `document.getAnimations()` is empty, the road is complete, values final | e2e |
| AC-12 | `road.e2e.ts`: a scripted scroll through the whole road at 1280 × 800 with a performance trace: longest frame < 50 ms, median < 17 ms; time to interactive < 1 s; numbers recorded in tasks | scripted measurement |
| AC-13 | `pace.test.ts`: `perDay` over 14 days (gaps, no dates, today at the edge), `finishedOn` | unit |
| AC-14 | `pace.test.ts`: `featureAge` (in progress, done, quiet after 7 days, no dates) | unit |
| AC-15 | `road.e2e.ts`: 404's URLs (`#/`, `#/?q=…&status=…`, `#/feature/202/board`, `/spec`, `/plan`, `/docs`) open their views; filters dim stops and the rail shows matches; totals, problems, Now and backlog present | e2e |
| AC-16 | `road.e2e.ts`: axe (no serious / critical) at 1280 and 360 px in light and dark on the roadmap and a feature page; no sideways scroll at 360 px; keyboard path through rail, stops and hero | scripted axe run |
| AC-17 | `npm run build` (nothing of `tools/` in `dist/`), `package.json` diff (no dependency), `npm run roadmap` ready < 5 s; theme tokens only (a grep for raw colours in `app.css`) | build + manual |

Unit tests: `tools/specs-index/test/` (`progress()` new fields), `app/src/lib/road.test.ts`, `pace.test.ts`,
`changes.test.ts`, `geometry.test.ts` (path through points, split at index, one and two points), all in
`npm run check`. The browser script runs on demand (`npm run test:roadmap`).

## Risks & Mitigations

- **Road geometry from measured DOM** (resizes, fonts loading, folding regions, 360 px) could jitter or lag the layout. → A spike first (T001: 26 stops in `--dev`, resize and fold, frame timing); one `ResizeObserver` measurement per frame; the road is redrawn only when points change.
- **Scroll smoothness** (AC-12) with an SVG path the height of the page and count-ups. → Only compositor properties animate; no filters or shadows on the path; the scroll listener is passive and rAF-batched; measured by the browser script, and the spike measures it before the UI is built on it.
- **Firefox lacks CSS scroll-driven animations.** → The listener fallback gives the same drawn line (§7); the browser script runs Chromium, and the fallback is checked by forcing it in the same run.
- **Live highlights on noise** (a server restart, an edit to an unrelated file, a feature added). → `diffProjects` compares task statuses and feature status only, ignores first load, new or vanished features and a stale schema (unit cases).
- **Opening at the current stop fights 404's scroll behaviour** (App scrolls to top; data refreshes must keep the scroll). → The roadmap positions itself once on first render; refreshes don't scroll; the e2e checks both.
- **API change breaks an open old page.** → `API_SCHEMA` 3: an old page shows 404's "restart" notice instead of wrong data.
- **Accessibility regressions** from a visual-first redesign (decorative SVG, dimmed stops, live region chatter). → Facts stay in a plain list; dimmed stops keep their text; one announcement per change set; axe at 1280 and 360 px light and dark in the browser script.
- **Time spent on tooling over product** (the maintainer's preference). → Unit tests only for the pure logic; one browser script at the end, on demand, not in `npm run check` or CI.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | spec approved 2026-10-10, Q1–Q10 accepted |
| II. Test-gated delivery | ✅ | pure logic test-first (unit); UI checked by `npm run check` per task and one browser script at the end (every AC has a test, §9) |
| III. Simplicity and small dependencies | ✅ | no library: CSS, Web Animations API, SVG, IntersectionObserver (Q9) |
| IV. Memory is maintained | ✅ | decisions (API 3, phase `release`) to `decisions.md`; gotchas to `learnings.md` |
| V. Free and open source | ✅ | development tool, nothing paid or locked |
| VI. On the device, no backend | ✅ | local server on 127.0.0.1 as 404; no new host |
| VII. Permissive licences | ✅ | nothing new; fonts as 404 |
| VIII. WYSIWYG, one code path | ➖ | not the app's rendering; the road reads the same data as the CLI |
| IX. Secure desktop shell | ➖ | no Electron change; server security unchanged from 404 |
| X. Budgets and accessibility | ✅ | app entry chunk untouched (tools only); WCAG 2.2 AA, reduced motion, 360 px (AC-11, AC-16) |
| XI. Agents use the same code | ➖ | no agent-facing operation; the data goes through `tools/specs-index` as the CLI |

## Decisions for the maintainer (accepted 2026-10-10: D1–D4 as recommended)

- **D1** — Release milestones come from a new optional `release` field on a phase in `roadmap.json`, without
  bumping the roadmap's `schema` (the field is additive: every existing file stays valid, old readers ignore it).
  Alternative: bump `schema` to 2 as 404's AC-16 rule says for shape changes. Recommended: no bump.
- **D2** — The browser checks are a committed script (`npm run test:roadmap`, own Playwright config, on demand,
  not in `npm run check` or CI) instead of 404's throwaway scratch run, so the ACs can be re-checked later.
  Recommended.
- **D3** — The hero is the current stop opening in place on the road (the dark stage moves along the road as the
  work moves), rather than a fixed panel at the top. With the page opening at the current stop (AC-5), it is the
  first thing seen either way. Recommended.
- **D4** — While filtering, stops are dimmed on the road (AC-15) and today's separate Results list goes away.
  Recommended (it is what AC-15 says; noted because it removes a view).
