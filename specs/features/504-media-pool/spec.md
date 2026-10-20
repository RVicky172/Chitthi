<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 504 — Media pool for Reels and YouTube

**Status:** Implemented
**Roadmap phase:** Phase UI — Studio design and UX (release 3.0.0) · **Created:** 2026-10-20

## Summary

In Reels and YouTube videos the Media panel is only an import box: once a clip is on the timeline there is no list of the project's files, so to reuse a clip, see what was imported or add another file the user goes back through the file dialog. 504 adds a **media pool**: the Media panel lists every file in the project (videos, photos, sounds and voice recordings) as thumbnails with name, length and how many times it is used; the user adds a file to the timeline by dragging it, double-clicking it or pressing its add button (at the playhead or at the end), imports more by dropping files anywhere in the pool, filters by kind and searches by name, and removes unused files. The pool is saved with the project (408).

## User Stories

- **US-1:** As a video editor, I want to import my clips once and then pick from them, so that I can build the timeline without reopening the file dialog.
- **US-2:** As a creator, I want to see which files are used and which are not, so that I can tidy the project.
- **US-3:** As a keyboard user, I want to add a pool item to the timeline without dragging.

## Acceptance Criteria

### Pool

- [x] **AC-1:** Importing files adds them to the project's media pool without putting them on the timeline unless the import came from the timeline's or the stage's add button (which also places them, as today). The pool holds every file the project references, including recordings (209), and is saved and reopened with the project (408). _(unit)_
- [x] **AC-2:** Each item shows a thumbnail (first frame, the photo, or a waveform for sound), name, length for video and sound, kind, and a use count; filters All / Video / Photo / Sound / Recordings and a name search narrow the list. _(unit)_

### Adding

- [x] **AC-3:** An item is added to the timeline by drag and drop onto a track, by double-click or Enter (at the playhead on the matching track), or by its add button; video and photos go to the main track, sound to a sound track of its kind; one undo step each. _(unit)_

### Tidying

- [x] **AC-4:** Remove takes an unused item out of the project (one undo step); a used item asks first and lists where it is used. **Find file…** (408) works from the pool for missing files. _(unit)_

### Fit

- [ ] **AC-5:** Dragging a pool item onto the timeline places it where dropped; the pool scrolls with 200 items without delay (deferred to 590). _(e2e)_

## Non-Functional Requirements

- **Performance:** no new work on the preview or export path; the entry chunk stays ≤ 350 KB; panels open in under 100 ms.
- **Accessibility:** every control works from the keyboard with a visible focus ring and is announced; axe passes; text contrast ≥ 4.5:1 in the light and dark themes.
- **Compatibility:** web and desktop alike; phones (≤ 640 px) and laptops (1280 × 720) as well as wide screens; every saved project opens unchanged.
- **Free and open source:** no new dependency unless cleared in `specs/licensing.md` first.
- **Performance:** thumbnails are made once per file and cached (the 208 waveform cache for sound); the pool renders 200 items without dropping preview frames.

## Out of Scope

- Folders or bins inside the pool.
- A shared pool across projects (the photo library stays separate).
- The Instagram photos mode (it has its photo strip).

## Open Questions

- **Q1** _(resolved)_ Does importing still put files straight on the timeline? _Answer (accepted 2026-10-20):_ from the pool, no (files land in the pool); from the empty stage's **Add videos or photos** button, yes, as today, so the first steps stay one click.
- **Q2** _(resolved)_ Pool in the left panel or a tab in the dock beside the timeline? _Answer (accepted 2026-10-20):_ the left panel (Media tool), following 501's rule "left: add and browse"; it stays open while editing.

## Changelog

- 2026-10-20 — Created: draft spec with 5 acceptance criteria and 2 open questions with proposed answers (Phase UI, D-063).
- 2026-10-20 — Every proposed answer accepted by the maintainer; Approved.
- 2026-10-20 — Plan D1–D5: option A chosen by the maintainer (D-069); plan Approved; tasks written (T010–T091).
