<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 505 — Sound panel: recordings and voice listed for choosing

**Status:** Approved
**Roadmap phase:** Phase UI — Studio design and UX (release 3.0.0) · **Created:** 2026-10-20

## Summary

The Audio panel mixes adding sound, recording voice and track settings in one long scroll, and recorded takes appear only as clips on the timeline: there is no list of recordings with their details, so finding, comparing or reusing a take means scanning the timeline. 505 restructures the sound side: the Audio panel gets folding sections (503) **Add sound**, **Record voice**, **Recordings** and **Tracks**; **Recordings** lists every voice take with name, length, date and time recorded, microphone, the track and time it sits at, and whether it is used; the user plays a take, renames it, selects it on the timeline, adds it again or deletes unused takes. Music, voice and effects are shown apart everywhere (pool filter, track colours, inspector).

## User Stories

- **US-1:** As a narrator, I want to see all my takes with their details, so that I can pick the best one.
- **US-2:** As a creator, I want music, voice and effects kept apart, so that I can find and adjust each kind.
- **US-3:** As a user, I want the Audio panel to show one thing at a time instead of a long scroll.

## Acceptance Criteria

### Recordings

- [ ] **AC-1:** The Recordings section lists every take of the project, newest first, with name, length, recorded date and time, microphone name, track and timeline position (or "Not used"); selecting a row selects and reveals its clip on the timeline; play previews it alone; rename changes the clip and pool name (one undo step); delete removes an unused take (a used one asks first). _(unit)_

### Separation

- [ ] **AC-2:** Sound is labelled by kind (Music, Voice, Effects) in the pool, the Audio panel, the track headers and the sound inspector, each with its own colour token from 501; takes are Voice. _(unit)_

### Structure

- [ ] **AC-3:** The Audio panel has the sections Add sound, Record voice, Recordings and Tracks as folding sections (503); opening Record voice opens the microphone and closing the section closes it (209 AC-7 still holds). _(unit)_

### Look

- [ ] **AC-4:** The maintainer checks the Audio panel with 8 tracks and 20 takes at 1280 × 720 (deferred to 590). _(manual)_

## Non-Functional Requirements

- **Performance:** no new work on the preview or export path; the entry chunk stays ≤ 350 KB; panels open in under 100 ms.
- **Accessibility:** every control works from the keyboard with a visible focus ring and is announced; axe passes; text contrast ≥ 4.5:1 in the light and dark themes.
- **Compatibility:** web and desktop alike; phones (≤ 640 px) and laptops (1280 × 720) as well as wide screens; every saved project opens unchanged.
- **Free and open source:** no new dependency unless cleared in `specs/licensing.md` first.
- **Privacy:** recording details (microphone name) stay in the project on the device.

## Out of Scope

- Comparing takes as lanes on one track (take lanes).
- New audio processing.

## Open Questions

- **Q1** _(resolved)_ Store the microphone name and record time with a take? _Answer (accepted 2026-10-20):_ yes, as fields of the take's media entry; older takes show "—".
- **Q2** _(resolved)_ Where is the per-track mixer (volume, solo, ducking)? _Answer (accepted 2026-10-20):_ the Tracks section of the Audio panel and the track header, as now; the sound inspector keeps clip settings only.

## Changelog

- 2026-10-20 — Created: draft spec with 4 acceptance criteria and 2 open questions with proposed answers (Phase UI, D-063).
- 2026-10-20 — Every proposed answer accepted by the maintainer; Approved.
