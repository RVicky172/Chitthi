<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 404 — Roadmap data (JSON) and a roadmap dashboard on localhost

**Status:** Implemented
**Roadmap phase:** Other features (400+) · **Created:** 2026-10-09 · **Owner:** RVicky172

## Summary

Each feature's spec, plan and tasks are written as one JSON object, `feature.json`, from the moment the feature is
created: `/spec-new` writes its spec part, `/spec-plan` its plan part, `/spec-tasks` its tasks part. `spec.md`,
`plan.md`, `tasks.md` and `roadmap.md` are generated from the JSON and never edited, so there is one source and no
import or sync step for anyone to remember; a hook and the dashboard regenerate the Markdown the moment the JSON
changes. Tasks have a real lifecycle (to do, in progress, blocked, done). On top of this, `npm run roadmap` serves a
dashboard in the Chitthi look, built in React and TypeScript: the current phase first, the others below, and for each
feature a kanban board of its tasks that can be changed by dragging a card.

(Numbering: 402 and 403 were the software factory, removed on 2026-10-09 by D-024.)

## User Stories

- **US-1:** As the maintainer, I want everything about a spec (spec, plan, tasks) in one JSON object that the commands write as they go, so that tracking needs no extra steps.
- **US-2:** As the maintainer, I want the Markdown documents to follow the JSON by themselves, so that they can never disagree.
- **US-3:** As the maintainer, I want to see where the project stands at a glance, the current phase first, in a page that looks like Chitthi.
- **US-4:** As the maintainer, I want each feature's tasks on a kanban board (to do, in progress, blocked, done) that I can change by dragging, so that I can track and steer the work.
- **US-5:** As a keyboard or screen reader user, I want to do all of that without a mouse.
- **US-6:** As the maintainer, I want the dashboard as a React and TypeScript project with clear folders, so that it stays easy to change.

## Acceptance Criteria

### Data: one JSON per feature

- [x] **AC-1:** `feature.json` (schema 2, `specs/schema/feature.schema.json`) holds the whole feature: header (id, title, work item, status, owner, dates, branch); `spec` (summary, user stories, criteria with their group, questions, the other sections as Markdown, changelog); `plan` (status, sections, and as data: files, risks, constitution check); `tasks` (intro, section order, tasks with `status` = `todo | in-progress | blocked | done`, blocked reason, started / done dates, commits, result, the criteria each covers, files, test, `[P]` / 👤). Collections are `{ order, byId }`. _(unit: schema on the repo and fixtures)_
- [x] **AC-2:** `spec.md`, `plan.md`, `tasks.md` (with its AC coverage table) and `roadmap.md` are generated from the JSON, each with a "generated" note at the top. The same JSON always gives the same bytes. _(unit)_
- [x] **AC-3:** The 6 existing features (000, 001, 201, 202, 401, 404) are migrated: every word of their old Markdown is in the new JSON (checked by a script), every done state, date and Result note is kept, and 202's T001 becomes `blocked` with its reason (the manual check). _(scripted check, recorded in tasks.md)_
- [x] **AC-4:** Nobody runs a sync step: the CLI regenerates the Markdown after each change; a Claude Code hook regenerates it as soon as `feature.json` or `roadmap.json` is written or edited, and refuses edits to the generated Markdown with a message naming the JSON to edit; `npm run roadmap` regenerates it within 3 s of a hand edit to the JSON. _(unit: hook script; integration: dashboard)_
- [x] **AC-5:** CLI (`npm run specs -- …`): `new <NNN> <name> "<title>" [--phase]` (folder, `feature.json` with a spec skeleton, roadmap 📝, generated `spec.md`), `status`, `start`, `block <feature> <T…> --reason "<why>"`, `done` (`--commit`, `--result`, `--date`), `undone`, `sync`, `check`. Unknown ids or states → message and exit 1; atomic writes. _(unit + integration)_
- [x] **AC-6:** `npm run specs:check` (in `npm run check`) fails, naming file and entry, on a schema error, a folder / id mismatch, a broken `needs` or `covers` link, a roadmap status that doesn't fit the feature status, or a generated file that differs from what the JSON gives. _(unit: one case per rule)_
- [x] **AC-7:** The workflow uses it: `specs/workflow.md`, `/spec-new` (writes `spec`), `/spec-plan` (writes `plan`), `/spec-tasks` (writes `tasks`), `/spec-implement` (`start` → `done`, `block` when it needs the user), `/spec-verify`, `CLAUDE.md`, and the templates. _(manual check)_

### Dashboard

- [x] **AC-8:** The dashboard is a React 19 + TypeScript app in `tools/roadmap-dashboard/` (Vite, the repo's existing packages, no new one), checked by `npm run typecheck` and `npm run lint`. `npm run roadmap` builds it and serves it on `http://localhost:5180` (`--port`, `--no-open` as before, `--dev` for hot reload while working on it), bound to `127.0.0.1`; a busy port gives a message and exit 1. _(integration; typecheck)_
- [x] **AC-9:** It looks like Chitthi: the app's graphite colours, the marigold highlight and the airmail stripe, Schibsted Grotesk headings, Geist text and Instrument Serif display type, light and dark from the system. The only host besides localhost is Google Fonts. _(manual: screenshots; CSP)_
- [x] **AC-10:** The roadmap page shows the **current phase** first (`currentPhase` in roadmap.json, else the first phase with an item in progress, else the first not finished): its goal, its progress and its items as cards (status, task progress, next task, what each waits on). The other phases follow below, folded, each with its progress. Also: totals, search and status filter (kept in the URL), the backlog, the "Now" panel from `memory/`, and any check problems. _(manual + e2e script)_
- [x] **AC-11:** A feature page shows a **kanban board** with the columns To do, In progress, Blocked and Done; each card shows id, text, flags, the criteria it covers, its files, and its blocked reason or done date. Dragging a card to another column, or choosing a column in the card's "Move to" menu (keyboard), changes the task's status through the same library as the CLI (blocking asks for a reason); the board shows the change within 1 s and the JSON and Markdown agree. Tabs **Spec** (criteria with the tasks that cover them, questions), **Plan** and **Documents** (the generated Markdown) complete the page; the URL names feature and tab. _(e2e script)_
- [x] **AC-12:** Changes from outside (CLI, hook, an editor) appear within 3 s without a reload, keeping the page, tab and scroll. _(integration)_
- [x] **AC-13:** The only write is `POST /api/features/<id>/tasks/<task>` with a JSON body `{ status, reason? }`; it is refused unless the request comes from the dashboard's own origin on localhost; the server writes nothing else and nothing outside `specs/`. Every other path is 404, every other method 405. _(integration)_
- [x] **AC-14:** Accessibility: every action works with the keyboard (moving cards included), focus is visible, status is text and not only colour, axe reports no serious or critical issue at 1280 and 360 px in light and dark, and there is no sideways scroll at 360 px. _(scripted axe run, recorded in tasks.md)_

### Packaging and upkeep

- [x] **AC-15:** Not shipped: nothing of `tools/` ends up in `dist/`, the desktop app or the Docker image; no npm package is added. _(build; `package.json` diff)_
- [x] **AC-16:** Upgradeable: `tools/specs-index/` (data library, generators, CLI, hook) and `tools/roadmap-dashboard/` (server, React app) each have a README (layout, data model, API, how to add a field, a column or a tab); pure logic is unit-tested with small hand-written fixtures; a schema change bumps `schema`. _(manual; unit)_

## Non-Functional Requirements

- Performance: `npm run specs:check` under 1 s; `npm run roadmap` ready in under 5 s (it builds first); a card move
  shows within 1 s.
- Formatting: JSON written with two spaces and stable key order, so diffs stay small.
- Security: server on `127.0.0.1`; Host and Origin checked on the write route; strict CSP (self, Google Fonts).
- Compatibility: Node ≥ 22.18 for the tools (as `docs:specs`), current Chrome, Edge, Firefox; Windows and macOS.
- Licences: no new library (Constitution VII).

## Out of Scope

- Editing spec or plan prose from the dashboard: that is what the `/spec-*` commands do.
- Live git data in the dashboard (branch and commits are what the JSON records).
- Running tests or agents from the dashboard.
- A roadmap-level board of features (the roadmap page shows statuses; the board is per feature).

## Open Questions

- **Q1** _(resolved)_ Port and browser? _Answer (accepted 2026-10-09):_ port 5180; open the browser, `--no-open` skips.
- **Q2** _(resolved)_ How does the page notice changes? _Answer (accepted 2026-10-09):_ it asks for a cheap version every 2 s.
- **Q3** _(resolved)_ Read-only dashboard? _Answer (2026-10-09, revised):_ tasks can be moved between columns from the board; everything else stays read-only.
- **Q4** _(resolved)_ "Now" panel from `memory/`? _Answer (accepted 2026-10-09):_ yes.
- **Q5** _(resolved)_ Vision text for items with no spec? _Answer (accepted 2026-10-09):_ no.
- **Q6** _(resolved)_ Git information? _Answer (2026-10-09):_ the JSON records each feature's branch and each task's commits; nothing runs `git` live.
- **Q7** _(resolved)_ Command names? _Answer (accepted 2026-10-09):_ `npm run roadmap`; data: `npm run specs`, `specs:sync`, `specs:check`.
- **Q8** _(resolved)_ Source of truth? _Answer (2026-10-09, revised):_ the JSON, for everything: spec, plan and tasks are written as JSON and the Markdown is generated (no import step).
- **Q9** _(resolved)_ Layout? _Answer (2026-10-09):_ `specs/roadmap.json` plus `feature.json` per folder, `order` + `byId` collections.
- **Q10** _(resolved)_ What else to link and track? _Answer (2026-10-09):_ task ↔ criterion links, dependencies between items, dates, branch and commits.
- **Q11** _(resolved)_ Existing features? _Answer (2026-10-09):_ migrated; tests use small fixtures.
- **Q12** _(resolved)_ Task states for the board? _Answer (2026-10-09):_ To do, In progress, Blocked (with a reason), Done.
- **Q13** _(resolved)_ Fonts? _Answer (2026-10-09):_ as the app: Geist and Instrument Serif from Google Fonts, Schibsted Grotesk from the app's own file.
- **Q14** _(resolved)_ Technology? _Answer (2026-10-09):_ React + TypeScript (maintainer's request).

## Changelog

- 2026-10-09 — Created (maintainer's request: a localhost dashboard to track the roadmap and tasks, started by a script).
- 2026-10-09 — Q1–Q7 accepted; approved: Spec / Plan / Tasks tabs, own folder.
- 2026-10-09 — Reworked before any code: tracking data in JSON, no copied fixtures (Q8–Q11).
- 2026-10-09 — `import` added at T015; implemented and verified (first version: Markdown as source, JSON for tracking, plain HTML page).
- 2026-10-09 — Reopened before commit at the maintainer's request ("look very boring", "loop … is very long"): JSON first for spec, plan and tasks with generated Markdown (Q8 revised), task lifecycle and a kanban board (Q12), dragging cards (Q3 revised), Chitthi theme (Q13), React + TypeScript (Q14). ACs rewritten (AC-1–AC-16).
- 2026-10-09 — AC-10: the current phase can be named in roadmap.json (`currentPhase`): Baseline still has 001 in progress (deferred hardware checks), so the first phase in progress would be the wrong one.
