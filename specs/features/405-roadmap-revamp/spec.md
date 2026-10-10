<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 405 — Roadmap dashboard revamp: a scrollable road, motion and live task progress

**Status:** In Progress
**Roadmap phase:** Other features (400+) · **Created:** 2026-10-10

## Summary

The roadmap dashboard (`npm run roadmap`, feature 404) shows the right facts but reads as a static report: a dark tile grid for the current phase, folded lists for the rest, and no sense of movement or of what is happening right now. This feature turns the roadmap page into a **road**: one winding route that runs through the phases in order, each roadmap item a stop on it, with the road behind the current position drawn as travelled, a "you are here" marker at the feature being built and the road ahead faint. Scrolling travels along it: the route draws itself, stops reveal their progress as they come into view, and a route rail shows where you are. The work in progress is the hero: the active feature, its running task, its next task, its blocked tasks as roadblocks, and today's finished tasks, all live (a task finished from the CLI lights up on the road within seconds). Motion is there to show progress and change, never as decoration that hides facts: everything is readable without it, and `prefers-reduced-motion` gets the same page standing still. It stays a local development tool in the Chitthi look, built from the data 404 already records (statuses, task dates, sections, criteria), with no new library and nothing shipped in the app.

## User Stories

- **US-1:** As the maintainer, I want the roadmap as a road I travel by scrolling, from what is done to what is ahead, so that I feel where the project stands instead of reading a table.
- **US-2:** As the maintainer, I want the feature and task being worked on right now highlighted, with what comes next and what is blocked, so that I see the current work at a glance.
- **US-3:** As the maintainer, I want progress to move when work moves (a task finished from the CLI or the board lights up on the road), so that the dashboard feels alive while I work.
- **US-4:** As the maintainer, I want to see the pace of the work (what finished today, tasks per day), so that I can tell whether a feature is moving or stuck.
- **US-5:** As a keyboard, screen reader or reduced-motion user, I want every fact on the road in a plain reading order without needing the motion, so that the revamp costs me nothing.
- **US-6:** As the maintainer, I want today's links, search, filters and boards to keep working, so that the revamp doesn't break how I already use the dashboard.

## Acceptance Criteria

### The road

- [ ] **AC-1:** The roadmap page shows one continuous road through every phase of `roadmap.json` in its `order` (Baseline, Phase 2, Phase 3, Other features today), each roadmap item a stop on it in the phase's item order: every item (26 in today's roadmap), including the ones without a spec yet (⬜). Each stop shows its id, title and status as text, and for features with tasks their task progress (done / total). _(unit (road layout from a fixture roadmap); manual screenshot)_
- [ ] **AC-2:** The road is drawn in three states: **travelled** up to the current stop, **current** at the active feature (the "you are here" marker), **ahead** after it. Done, in progress, blocked, approved, drafted and not started stops each look different and carry the status as text, not only colour. The current stop is `currentPhase`'s first item in progress (as 404's AC-10), else the first item not done. _(unit (stop states for 6 fixture roadmaps: none started, mid-phase, blocked item, all done, `currentPhase` set, a phase with no items))_
- [ ] **AC-3:** Each phase is a region of the road with its title, goal, exit criteria and progress (items done / total and tasks done / total); the region of the current phase is open, the others show a one-line summary that opens on demand. _(unit; manual)_
- [ ] **AC-4:** A route rail stays on screen while the road scrolls: one mark per phase and one per stop, the current position, and the part of the road in view; choosing a mark scrolls there (by keyboard too). At 360 px wide the rail folds into a compact bar. _(e2e (rail marks = phases + stops; activating one scrolls that stop into view))_
- [ ] **AC-5:** The page opens scrolled to the current stop, with a "Back to now" control that returns there from anywhere on the road; a link to a stop (`#/?at=203`) opens at that stop. _(e2e)_

### Now: the work in progress

- [ ] **AC-6:** The current stop is the hero: it shows the active feature's title, status, task progress as a ring, its sections as segments (each segment's done / total), the running task(s) (status in progress: id, text, section, started date), the next task to do, and its blocked tasks with their reasons. A feature with no task in progress says so and shows the next task instead. _(unit (hero model from fixtures: one running task, two running, none running, blocked tasks, all done); manual)_
- [ ] **AC-7:** Blocked tasks anywhere on the roadmap appear as roadblocks on their stop (count and, on focus or hover, each reason); when any task is blocked they are also listed in one place near the hero, each linking to its board filtered to that task. _(unit; e2e (link opens the board with the task))_
- [ ] **AC-8:** Every stop with a spec links to its feature page (board tab) as today; items without a spec are not links. _(e2e)_

### Motion and live changes

- [ ] **AC-9:** Scrolling draws the road progressively (the travelled line follows the scroll position) and each stop's progress (bar or ring, counts) animates from 0 to its value the first time it comes into view; with the page standing still nothing animates except the "you are here" marker's slow pulse. _(manual (recording at 1280 px); e2e (a stop's progress element reaches its final value after scrolling into view))_
- [ ] **AC-10:** A change that arrives while the page is open (404's 2 s version poll) is shown where it happened: a task that became done, in progress or blocked highlights its stop and the hero for 2 s and is announced once to screen readers ("204 T030 done"); a feature that changed status moves its marker along the road. Nothing highlights on the first load. _(unit (diff of two project snapshots gives the list of changes); e2e (`npm run specs -- done` on a fixture copy: highlight within 3 s, live region text))_
- [ ] **AC-11:** With `prefers-reduced-motion: reduce` the road is drawn complete, progress shows its final values, the marker doesn't pulse and live changes are shown by a static highlight and the announcement, with no movement. _(e2e (reduced-motion emulation: `document.getAnimations()` empty after scrolling the road))_
- [ ] **AC-12:** Motion stays smooth: scrolling the whole road at 1280 × 800 on the development machine has no frame longer than 50 ms and a median frame under 17 ms; the page is interactive within 1 s of load with today's roadmap. _(scripted measurement in Chromium (performance trace), numbers recorded in tasks)_

### Pace and activity

- [ ] **AC-13:** An activity strip shows the tasks finished today (from `doneOn`: feature, task id, text, linking to the board) and the tasks finished per day over the last 14 days as a small bar chart with its numbers available as text; days with nothing finished show as zero. _(unit (per-day counts from fixture tasks, including days with none and tasks without dates))_
- [ ] **AC-14:** Each feature stop shows how long it has been moving: started date, days since started, and for done features the days it took (from `dates`); a feature in progress with no task finished in the last 7 days is marked "quiet". _(unit)_

### Keeping what works

- [ ] **AC-15:** Everything the roadmap page shows today stays reachable: totals, search and status filter (kept in the URL), the check's problems, the Now panel from `memory/` and the backlog. Search and filters dim the stops that don't match and the rail shows the matches; existing URLs (`#/`, `#/?q=…&status=…`, `#/feature/NNN/<tab>`) open what they open today. _(e2e (each URL from 404's tests still opens its view))_
- [ ] **AC-16:** Accessibility: the road is decoration over a plain list in reading order (phases as headings, stops as list items with their facts as text); every control works by keyboard with visible focus; axe reports no serious or critical issue at 1280 and 360 px in light and dark; no sideways scroll at 360 px. _(scripted axe run at 1280 and 360 px, light and dark, recorded in tasks)_
- [ ] **AC-17:** Still a local tool: nothing of it in `dist/`, the desktop app or the Docker image; no npm package added; fonts and colours from the dashboard's `theme.css` tokens only (the Chitthi look of 404's AC-9, marigold only on the dark stage); `npm run roadmap` ready in under 5 s as before. _(build; `package.json` diff; manual)_

## Non-Functional Requirements

- Performance: AC-12 (no frame over 50 ms while scrolling the whole road, median under 17 ms, interactive within
  1 s); `npm run roadmap` ready in under 5 s; a live change shown within 3 s (404's AC-12).
- Accessibility: WCAG 2.2 AA in light and dark (Constitution X); the road is `aria-hidden` decoration over a plain
  list; status is text; reduced motion respected (AC-11); live changes announced once (AC-10).
- Responsive: 1920 px down to 360 px with no sideways scroll; the route rail folds at 360 px (AC-4).
- Security: unchanged from 404 (127.0.0.1, Host / Origin checks, CSP `'self'` plus Google Fonts; no new host).
- Compatibility: current Chrome, Edge, Firefox and Safari, the same behaviour in each (no browser-specific path).
- Licences and size: no new library, model, font or asset beyond the dashboard's own (Constitution III, VII).

## Out of Scope

- AI-generated or pre-rendered video, 3D scenes or WebGL for the road (Q2).
- New data: no new task fields or effort estimates; the road is built from what 404 records (statuses, dates,
  sections, criteria, needs). Q7's optional phase `release` field is the one possible exception.
- Editing specs, plans or roadmap items from the dashboard (unchanged from 404: only task status moves).
- Forecasts, burndown predictions or velocity targets.
- Sound, confetti or celebration beyond AC-10's highlight.
- Shipping any of it in the app, the desktop app or the Docker image.

## Open Questions

- **Q1** _(resolved)_ Which way does the road run? _Answer (accepted 2026-10-10):_ top to bottom, winding left and right across the page as you scroll down (Baseline at the top, Phase 3 and Other at the bottom), because the page already scrolls vertically and a vertical road keeps working at 360 px; a horizontal road would need sideways scrolling, which AC-16 forbids at 360 px.
- **Q2** _(resolved)_ An AI-rendered scroll film (the `/scroll-world` skill: Higgsfield / Monid video clips scrubbed by scroll)? _Answer (accepted 2026-10-10):_ no. The roadmap changes every time a task is ticked, so pre-rendered clips would be stale at once and every re-render costs money; the road is drawn from the data in SVG and CSS in the Chitthi look. A short decorative clip could be a later idea, not part of this feature.
- **Q3** _(resolved)_ Where does the page open? _Answer (accepted 2026-10-10):_ scrolled to the "you are here" stop (AC-5), with the travelled road above it and the road ahead below; "Back to now" returns there.
- **Q4** _(resolved)_ Which items are stops? _Answer (accepted 2026-10-10):_ every item of every phase, including items without a spec (⬜, faint, not links); the backlog stays off the road in its own panel at the end.
- **Q5** _(resolved)_ How loud is a live change? _Answer (accepted 2026-10-10):_ a 2 s highlight of the stop and the hero (an airmail-stripe sweep in the Chitthi look), one screen-reader announcement, no sound, no confetti; nothing on first load.
- **Q6** _(resolved)_ Pace: which numbers? _Answer (accepted 2026-10-10):_ tasks finished today, tasks per day over 14 days, days since a feature started, and "quiet" after 7 days without a finished task (AC-13, AC-14). No estimates or forecasts: the data has no effort sizes.
- **Q7** _(resolved)_ Release milestones on the road (3.0.0 at the end of Phase 2, 3.1.0 after Phase 3)? _Answer (accepted 2026-10-10):_ yes, as a milestone at the end of each phase region, read from an optional `release` field on a phase in `roadmap.json` (added through `tools/specs-index`); phases without it show none. Alternative: parse "(release 3.0.0)" from the phase title (no data change, more fragile).
- **Q8** _(resolved)_ Does the feature page (board) change too? _Answer (accepted 2026-10-10):_ lightly: its header gets the same section segments and progress ring as the hero, and a card that moves (by drag, menu or a live change) animates to its new column; the board's columns and behaviour stay as 404 built them.
- **Q9** _(resolved)_ A motion library (Motion, GSAP)? _Answer (accepted 2026-10-10):_ none (Constitution III, AC-17): CSS transitions, the Web Animations API, SVG stroke drawing and `IntersectionObserver`; the drawn road follows the scroll through a passive, frame-batched scroll listener in every browser (revised 2026-10-10 at T030: a CSS scroll timeline is linear in page scroll and can't follow the road's own shape, so its tip would drift from the stops in view; T001 measured the listener at 16.7 ms a frame, also with the CPU slowed 4x).
- **Q10** _(resolved)_ Number 405? _Answer (accepted 2026-10-10):_ yes; 402 and 403 stay retired (the removed software factory, D-024).

## Changelog

- 2026-10-10 — Created (maintainer's request: the roadmap "look very stagnent and boring"; a scrollable road with animations and the current task progress highlighted).
- 2026-10-10 — Q1–Q10 resolved (all proposed answers accepted by the maintainer); Approved.
- 2026-10-10 — Plan drafted (D1–D4 for the maintainer).
- 2026-10-10 — Plan approved (D1–D4 as recommended, D-029).
- 2026-10-10 — Tasks written (T001–T092); In Progress.
- 2026-10-10 — Q9 revised at T030: the drawn road follows the scroll through one listener in every browser, not CSS scroll timelines (they are linear in page scroll and drift from the road; T001 measured the listener well within AC-12).
