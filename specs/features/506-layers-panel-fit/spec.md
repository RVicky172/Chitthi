<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 506 — Layers panel: no overflow or cut-off items

**Status:** Approved
**Roadmap phase:** Phase UI — Studio design and UX (release 3.0.0) · **Created:** 2026-10-20

## Summary

The Layers panel overflows: rows with long names, nested controls (visibility, lock, order, delete) or many layers are cut off at the panel's edge or push the panel sideways, and on narrower windows some controls can't be reached. 506 makes the layer list fit: rows have a fixed layout (thumbnail, name that shortens with an ellipsis and shows in full on hover and to screen readers, then always-visible controls), the list scrolls only vertically inside its section, and the layer properties move to the inspector so the panel holds the list only.

## User Stories

- **US-1:** As a creator with many layers, I want to see and reach every layer and its controls without anything being cut off.
- **US-2:** As a user on a laptop, I want the Layers panel to work at 1280 × 720 and on a phone.

## Acceptance Criteria

### Fit

- [ ] **AC-1:** A layer row lays out as thumbnail · name · controls with the name shrinking first; controls never wrap or leave the row; the list has no horizontal scroll. Proven by a unit test on the row's class contract plus 590's e2e check. _(unit)_
- [ ] **AC-2:** With 40 layers with 80-character names, at 1280 × 720, 1440 × 900 and 390 × 844, no element of the Layers panel is wider than the panel and every control can be clicked (deferred to 590). _(e2e)_

### Structure

- [ ] **AC-3:** The Layers panel shows the list only; the selected layer's properties are in the inspector (in folding sections, 503), in the photo, Reel and YouTube modes alike. _(unit)_

### Accessibility

- [ ] **AC-4:** Each row is reachable with the keyboard; its full name is its accessible name; reorder works with Alt + ↑/↓ as well as dragging. _(unit)_

## Non-Functional Requirements

- **Performance:** no new work on the preview or export path; the entry chunk stays ≤ 350 KB; panels open in under 100 ms.
- **Accessibility:** every control works from the keyboard with a visible focus ring and is announced; axe passes; text contrast ≥ 4.5:1 in the light and dark themes.
- **Compatibility:** web and desktop alike; phones (≤ 640 px) and laptops (1280 × 720) as well as wide screens; every saved project opens unchanged.
- **Free and open source:** no new dependency unless cleared in `specs/licensing.md` first.

## Out of Scope

- Layer groups.

## Open Questions

- **Q1** _(resolved)_ Is a quick fix wanted before the phase? _Answer (accepted 2026-10-20):_ no; the overflow is fixed here, early in the phase (it needs only 501's row part).

## Changelog

- 2026-10-20 — Created: draft spec with 4 acceptance criteria and 1 open questions with proposed answers (Phase UI, D-063).
- 2026-10-20 — Every proposed answer accepted by the maintainer; Approved.
