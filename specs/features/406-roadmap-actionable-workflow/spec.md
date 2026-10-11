<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 406 — Roadmap improvements: next actions, task briefs and planning clarity

**Status:** Implemented
**Roadmap phase:** Other features (400+) · **Created:** 2026-10-11

## Summary

The roadmap dashboard already shows project progress, but contributors still have to search feature boards and reread specs to find the next useful task or give an AI agent enough context to start. Make the roadmap actionable: surface the next task and its blockers, copy a concise task brief, show dependencies and user outcomes, and help people find work while making update freshness and estimate uncertainty clear. Use only project data already recorded unless the maintainer explicitly approves adding metadata.

## User Stories

- **US-1:** As a maintainer, I want the roadmap to identify the next actionable task and explain blockers, so that I can begin work without searching through multiple feature boards.
- **US-2:** As a maintainer using AI agents, I want to copy a compact, self-contained brief for a task, so that an agent receives the relevant instructions without rereading unrelated project context.
- **US-3:** As a contributor, I want to understand what a feature unlocks and what user outcome it delivers, so that I can prioritize work by its value and dependencies.
- **US-4:** As a contributor, I want to search and filter roadmap work, so that I can quickly find relevant features and tasks as the roadmap grows.
- **US-5:** As a maintainer, I want to see when roadmap data was updated and distinguish measured facts from uncertain estimates, so that progress indicators do not imply unsupported certainty.

## Acceptance Criteria

### Actionable work

- [x] **AC-1:** For the current in-progress feature, the roadmap distinguishes every running task from the first remaining todo task in task order; when there is no todo task, it shows the recorded blockers or says no task remains. It never presents a blocked task as the next todo task. _(unit + e2e)_
- [x] **AC-2:** A contributor can copy a task brief containing the task ID and text, its feature, relevant acceptance criteria and plan context, listed files, and proving test when those fields exist. The brief is copied with one action, excludes unrelated feature history, and reports copy failures accessibly. _(unit + e2e)_

### Planning clarity

- [x] **AC-3:** Each roadmap stop with recorded prerequisites or downstream dependents exposes links to those roadmap entries. An unfinished prerequisite is identified as such; a feature without unfinished prerequisites is not shown as waiting. _(unit + e2e)_
- [x] **AC-4:** A feature detail view shows its outcome description alongside task progress, using the feature summary or first user story when available, without changing the underlying feature specification. _(e2e)_

### Discovery

- [x] **AC-5:** The existing roadmap title search and status filter are extended with a phase filter; each filter can be cleared independently and together they restore or narrow the same set of stops. Controls work by keyboard and fit a 360 CSS-pixel viewport without horizontal page scrolling. _(unit + e2e)_

### Trust

- [x] **AC-6:** The dashboard shows the update date recorded in roadmap.json and labels the existing pace as historical completed-task data, not a delivery forecast. It does not invent a timestamp, forecast, or confidence value that the source data does not provide. _(unit + e2e)_

## Non-Functional Requirements

- Performance: Roadmap filtering and next-task selection should complete in under 100 ms for 1,000 roadmap tasks on a mid-range laptop.
- Accessibility: All added controls work by keyboard, expose accessible names and status, retain WCAG 2.2 AA contrast, and respect reduced motion.
- Compatibility: Preserve the local roadmap dashboard workflow and work at 360 CSS pixels and wider.
- Privacy: Use only repository roadmap/spec data; add no analytics, network calls, account, or backend.

## Out of Scope

- Automatically assigning tasks or agents, editing feature specs from the dashboard, estimating delivery dates from historical data, and adding roadmap analytics.
- Adding task-area or platform metadata before its source of truth is agreed.

## Open Questions

- **Q1** _(resolved)_ How should the next task be chosen when there are several eligible tasks or task-level dependencies are not explicitly recorded? Proposed: use the active feature first, then its task order; never infer task dependencies beyond recorded blockers and feature dependencies.
- **Q2** _(resolved)_ Should roadmap search and filters include only metadata already present, or should this feature add tags for work area and platform? Proposed: ship title search plus phase/status filters first; defer new tags until there is a maintained source of truth.
- **Q3** _(resolved)_ What should the task brief include when a task has no listed files, test, plan section, or acceptance criteria, and should the brief have a strict length budget? Proposed: include available fields only, state which context is missing, and keep generated brief text under 2,000 characters without truncating the task instruction or proving test.

## Changelog

- 2026-10-11 — Created draft from the requested roadmap improvements: next actions, copyable task briefs, dependencies, user outcomes, discovery filters, and freshness/estimate clarity.
- 2026-10-11 — Maintainer accepted the proposed defaults for Q1–Q3; questions closed for planning.
