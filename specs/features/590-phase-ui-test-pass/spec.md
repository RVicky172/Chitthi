<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 590 — Phase UI test pass

**Status:** Approved
**Roadmap phase:** Phase UI — Studio design and UX (release 3.0.0) · **Created:** 2026-10-20

## Summary

The test pass for Phase UI (D-033): the e2e tests, axe checks and manual checks deferred by 501–507 are written and run here, with every Definition-of-Done gate, before 290 releases 3.0.0 (501 Q4).

## User Stories

- **US-1:** As the maintainer, I want the redesign checked as a whole before it ships.

## Acceptance Criteria

### Deferred checks

- [ ] **AC-1:** Every deferred e2e check of 501–507 is written in `tests/e2e/` and passes on the desktop and phone projects, with axe passing on each studio panel. _(e2e)_
- [ ] **AC-2:** The maintainer's manual checks of 501–507 pass (before/after screenshots in both themes, the Audio panel with 8 tracks and 20 takes, 1280 × 720). _(manual)_

### Gates

- [ ] **AC-3:** Every Definition-of-Done gate passes: `npm run check`, `npm run test:e2e`, `npm run build`, `npm test`, `npm run test:mcp`, `npm run check:licenses`. _(manual)_

## Non-Functional Requirements

- As each feature's.

## Out of Scope

- The release itself (290).

## Deferred checks collected from the phase

- 501 AC-5: left rail and panel widths match across studios.
- 501 AC-6: the rail expands and shrinks (button, Ctrl + \) in both studios, the stage re-fits, no animation under reduced motion.
- 502 AC-4: before/after screenshots approved.
- 503 AC-5: panels fit at 1280 × 720.
- 504 AC-5: drag from pool; 200 items.
- 505 AC-4: Audio panel with 8 tracks, 20 takes.
- 506 AC-2: Layers panel fits with 40 long-named layers.
- 506 AC-4: drag a layer row to a new place with a mouse and with touch (from its thumbnail); a click without a move still selects; swiping the names scrolls the list on a phone.

## Open Questions

_None yet._

## Changelog

- 2026-10-20 — Created: draft spec with 3 acceptance criteria and 0 open questions with proposed answers (Phase UI, D-063).
- 2026-10-20 — Approved by the maintainer.
