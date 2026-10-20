<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 507 — README, docs and screenshots for the new design

**Status:** Approved
**Roadmap phase:** Phase UI — Studio design and UX (release 3.0.0) · **Created:** 2026-10-20

## Summary

The README's screenshots show the media studio before Phase 2 and before this redesign, and the README and docs don't describe the timeline features added since 2.10.0 (tracks, edit tools, picture-in-picture, keyframes, transitions, speed, audio tracks, voice-over, saved projects). 507 retakes every screenshot with a script so they can be taken again at each release, updates the README's feature list and pictures, and updates `docs/MEDIA-STUDIO.md`, `docs/DESIGN.md` and the in-app docs (`src/data/docs.ts`) to the new design.

## User Stories

- **US-1:** As someone finding Chitthi on GitHub, I want screenshots and a feature list that show what the app does today.
- **US-2:** As a maintainer, I want screenshots made by a script, so that they stay current with one command.

## Acceptance Criteria

### Screenshots

- [ ] **AC-1:** `npm run screenshots` opens the production build with sample projects (no photos of people, per the sample-photo rule) and writes every README and docs screenshot as WebP to `docs/screenshots/`, in the light theme and, for the phone shot, the dark theme; it runs on web without the desktop app. _(manual)_

### README

- [ ] **AC-2:** The README lists the features of the photo, Reel and YouTube modes as of this phase (multi-track timeline, edit tools, picture-in-picture, keyframes, transitions, speed, audio tracks and ducking, voice-over, saved projects, the media pool) with new screenshots, each with alt text that describes it; no screenshot is older than this phase. _(manual)_

### Docs

- [ ] **AC-3:** `docs/MEDIA-STUDIO.md`, `docs/DESIGN.md` and the in-app docs describe the new layout, folding panels, media pool, Recordings and Layers; every link checks out. _(manual)_

## Non-Functional Requirements

- **Licences:** sample media used in screenshots is cleared in `specs/licensing.md` and credited.
- **Size:** each screenshot ≤ 300 KB.

## Out of Scope

- A product video or website.

## Open Questions

- **Q1** _(resolved)_ Scripted screenshots? _Answer (accepted 2026-10-20):_ yes, a Playwright script (`scripts/screenshots.mjs`, Playwright is already a devDependency) with sample projects in `tests/support/`.

## Changelog

- 2026-10-20 — Created: draft spec with 3 acceptance criteria and 1 open questions with proposed answers (Phase UI, D-063).
- 2026-10-20 — Every proposed answer accepted by the maintainer; Approved.
