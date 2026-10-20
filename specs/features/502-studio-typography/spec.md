<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 502 — Typography: bold only for headings

**Status:** Approved
**Roadmap phase:** Phase UI — Studio design and UX (release 3.0.0) · **Created:** 2026-10-20

## Summary

Most text in the studios is bold or semi-bold (labels, buttons, hints, list items, section titles), so nothing stands out and the panels look heavy. 502 applies 501's type scale: **only headings are bold** (panel titles and section titles in the heading font); labels, buttons and list items are regular or medium; hints and descriptions are regular and muted. It covers the print studio, the photo & video studio, dialogs and the timeline, in both themes.

## User Stories

- **US-1:** As a user, I want headings to stand out and the rest of the text to be calm, so that I can scan a panel quickly.
- **US-2:** As a user of the dark theme, I want the same hierarchy there, without thin text that is hard to read.

## Acceptance Criteria

### Weights

- [ ] **AC-1:** Only the heading selectors listed in `docs/DESIGN.md` (panel titles, section titles, dialog titles, the stage's empty-state title) use a weight above 500; labels, buttons, tabs, list items and timeline text use 400 or 500; hints use 400. A unit test reads every stylesheet under `src/styles/` and fails on a `font-weight` above 500 outside the allowed selectors. _(unit)_
- [ ] **AC-2:** Inline `<b>`/`<strong>` in panel text is used only for a value the user must notice (a limit, a count); a unit test lists the components that still use them and the list matches the design document. _(unit)_

### Fonts

- [ ] **AC-3:** The font files loaded cover the weights used (400, 500 for body; the heading weight) and no others, so no weight is synthesised by the browser; checked against the `@font-face` rules. _(unit)_

### Look

- [ ] **AC-4:** The maintainer compares before/after screenshots of each studio in both themes and approves them (deferred to 590). _(manual)_

## Non-Functional Requirements

- **Performance:** no new work on the preview or export path; the entry chunk stays ≤ 350 KB; panels open in under 100 ms.
- **Accessibility:** every control works from the keyboard with a visible focus ring and is announced; axe passes; text contrast ≥ 4.5:1 in the light and dark themes.
- **Compatibility:** web and desktop alike; phones (≤ 640 px) and laptops (1280 × 720) as well as wide screens; every saved project opens unchanged.
- **Free and open source:** no new dependency unless cleared in `specs/licensing.md` first.

## Out of Scope

- Font choice: Geist (body) and Schibsted Grotesk (headings) stay.
- The landing page.

## Open Questions

- **Q1** _(resolved)_ Heading weight? _Answer (accepted 2026-10-20):_ 600 for panel and section titles, 700 only for the stage's empty-state title and dialog titles. Labels and buttons 500, body and hints 400.
- **Q2** _(resolved)_ Do section titles stay in capitals (as in the print studio's FREE PHOTOS FROM PEXELS)? _Answer (accepted 2026-10-20):_ no: sentence case at 600, which reads better and matches the media studio.

## Changelog

- 2026-10-20 — Created: draft spec with 4 acceptance criteria and 2 open questions with proposed answers (Phase UI, D-063).
- 2026-10-20 — Every proposed answer accepted by the maintainer; Approved.
