<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 290 — Phase 2 test pass and 3.0.0 release

**Status:** Draft
**Roadmap phase:** Phase 2 — Multi-track timeline (release 3.0.0) · **Created:** 2026-10-12

## Summary

The end of Phase 2 (D-033): during the phase, features are built with unit tests only (`npm run check`, plus `npm run build` when a feature is finished). Here, once 201–212 are built, the e2e, self-test, timing and manual checks deferred by each feature are written and run, every Definition-of-Done gate passes, the acceptance criteria those checks prove are ticked in their features, and 3.0.0 is released.

## Deferred checks collected from the phase

Each Phase 2 feature lists here the checks it defers (D-033), with their text as planned; the tasks are written when 290 is planned.

- **203 T035** — AC-12 timing (§13, `src/dev/playbackChecks.ts`, `CHITTHI_TEST_ONLY=pooltiming`): main + 2 overlay 1080p30 videos playing at once in a Reel and a YouTube project, 300 frames, median and p95 frame time (≤ 33 ms median on desktop); a project without overlays within 5 % of `main` (fastest of 3, run back to back). If the bar fails, lower the limit by Q2's rule and record it in the spec. · files: src/dev/playbackChecks.ts · test: `CHITTHI_TEST_ONLY=pooltiming npm test`: the numbers recorded here
- **203 T051** — Failing e2e (`e2e/tracks.e2e.ts`, new): add, rename, move up / down and delete (confirmation when it has clips) an overlay track, each one undo step; the limit disables Add track with the reason; the overlay header's Hide (not drawn), Mute (silent: the mute test's sound log), Lock (timeline and stage edits refused) and height; add files at the playhead and by dropping on a row and above the top row; drag a clip between rows and with "Move to track…"; an edit over the videos-at-once limit refused with its message; keyboard only; axe on the timeline; 360 px with no sideways scroll. · files: e2e/tracks.e2e.ts · test: `npx playwright test e2e/tracks.e2e.ts`: fails
- **203 T053** — Failing e2e (`e2e/overlays.e2e.ts`, new): a selected overlay clip's box on the stage: drag moves, a corner resizes keeping the aspect, the handle rotates; snapping to centre lines and edges within 8 px, off with the Snap switch and with Alt; the inspector's presets and number fields (X, Y, size, rotation, opacity, corner radius); arrows 1 % and Shift 10 % with the stage focused; a drag is one undo step; the announcement text; a locked track shows no box and disabled fields; axe on the inspector; reduced motion (no animated outline). · files: e2e/overlays.e2e.ts · test: `npx playwright test e2e/overlays.e2e.ts`: fails
- **203 T060** — Manual checks in Chrome (`npm run dev`) and the desktop app: B-roll over a talking clip and a corner face-cam play smoothly and export as previewed; the Chrome AC-12 figure (main + 1 overlay, `?selftest&only=pooltiming`); the AC-13 export in Chrome (web). · files: none · test: the maintainer's results recorded here
- **Every Phase 2 feature** — the full Definition of Done: `npm run test:e2e`, `npm test`, `npm run test:mcp`, `npm run check:licenses`, the docs gates; the ACs proven by these checks ticked in each feature.
- **Release** — `specs/release.md`: version 3.0.0, CHANGELOG, tag.

## User Stories

_None yet._

## Acceptance Criteria

_None yet._

## Non-Functional Requirements

- Performance: …
- Accessibility / security / compatibility: …

## Out of Scope

- …

## Open Questions

_None yet._

## Changelog

- 2026-10-12 — Created.
