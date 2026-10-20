<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 503 — Folding panel sections: one open at a time

**Status:** Implemented
**Roadmap phase:** Phase UI — Studio design and UX (release 3.0.0) · **Created:** 2026-10-20

## Summary

Panels in the media studio show every section open, one under another (the Audio panel: Sound, Record voice, Sound tracks, each track …), so the user scrolls to find a control and long panels feel endless. 503 puts the sections of every studio panel and inspector into **folding sections** (accordions) where **only one is open at a time**: opening one closes the others; the open one is remembered per panel; the title row shows a short summary when closed (e.g. "Music · 2 tracks"). The print studio uses the same part (501).

## User Stories

- **US-1:** As a creator, I want to see the list of what a panel offers at a glance and open the one I need, instead of scrolling past everything.
- **US-2:** As a returning user, I want the section I used last to be open when I come back to a panel.
- **US-3:** As a keyboard user, I want to move between sections and open them with the keyboard.

## Acceptance Criteria

### Behaviour

- [x] **AC-1:** The folding section part opens one section per group at a time: opening a section closes the others in its group; a closed section shows its title and an optional one-line summary; a group can allow none open. Unit-tested on the open-state logic. _(unit)_
- [x] **AC-2:** The open section is remembered per panel and mode (local, per viewer) and restored when the panel opens again; a section whose content becomes needed (e.g. selecting a sound clip opens the Sound section of the inspector) opens itself. _(unit)_

### Coverage

- [x] **AC-3:** Every media-studio panel and inspector with more than one section uses the folding section part: Media, Text, Elements, Draw, Transitions, Audio, Layers, the photo editor's Light / Colour / Detail / Masks …, the clip, layer and sound inspectors; and the print studio's steps. A unit test lists panels with more than one section that don't. _(unit)_

### Accessibility

- [x] **AC-4:** Each section title is a button with `aria-expanded` and `aria-controls`; Enter and Space toggle it; the panel's sections are reachable with Tab in order. _(unit)_

### Fit

- [ ] **AC-5:** At 1280 × 720 no media-studio panel needs to scroll with its default section open, except lists (media, layers, sounds) which scroll inside their section (deferred to 590). _(e2e)_

## Non-Functional Requirements

- **Performance:** no new work on the preview or export path; the entry chunk stays ≤ 350 KB; panels open in under 100 ms.
- **Accessibility:** every control works from the keyboard with a visible focus ring and is announced; axe passes; text contrast ≥ 4.5:1 in the light and dark themes.
- **Compatibility:** web and desktop alike; phones (≤ 640 px) and laptops (1280 × 720) as well as wide screens; every saved project opens unchanged.
- **Free and open source:** no new dependency unless cleared in `specs/licensing.md` first.

## Out of Scope

- Changing what controls a section contains (other features).

## Open Questions

- **Q1** _(resolved)_ Print studio too? _Answer (accepted 2026-10-20):_ yes, one open at a time in the print studio's steps as well, keeping Collapse all; Expand all is removed. Alternative: keep Expand all in the print studio only.
- **Q2** _(resolved)_ Can the user pin a second section open? _Answer (accepted 2026-10-20):_ no, for simplicity; revisit after 590's manual check.

## Changelog

- 2026-10-20 — Created: draft spec with 5 acceptance criteria and 2 open questions with proposed answers (Phase UI, D-063).
- 2026-10-20 — Every proposed answer accepted by the maintainer; Approved.
- 2026-10-20 — Plan D1–D4: option A chosen by the maintainer (D-068); plan Approved; tasks written (T010–T091).
