# 202 — Edit operations: ripple, roll, slip, slide, magnetic main track, snapping (P2.2)

**Status:** In Progress <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 2 — Multi-track timeline · **Created:** 2026-10-07 · **Owner:** RVicky172

## Summary

Since `201` the video editor's project is made of tracks with clips at a start time, but every edit still behaves as
in 2.x: the video track is always packed end to end, so deleting or trimming a clip pulls everything after it along
(a "ripple"), and there is no way to change a cut without changing the video's length. This feature adds the edit
tools of desktop editors (Premiere, Final Cut, Resolve, CapCut): a **magnetic** main track that can be switched off
to leave gaps, **ripple** and non-ripple delete and trim, **roll** (move a cut between two clips), **slip** (change
which part of a video clip plays without moving it) and **slide** (move a clip between its neighbours), with
**snapping** that can be turned off. Each tool works the same with the mouse and the keyboard, is one undo step,
respects locked tracks, and plays and exports exactly as the timeline shows, gaps included.

## User Stories

- **US-1:** As a video creator, I want to tighten a cut without changing the length of my video (roll), so that the
  edit stays in time with my music.
- **US-2:** As a video creator, I want to choose which part of a video clip plays without moving it (slip), so that I
  keep my timing while picking the best moment.
- **US-3:** As a video creator, I want to switch off the magnetic track and leave a gap or place a clip at a time, so
  that I can line a clip up with a beat or a title.
- **US-4:** As a keyboard or screen reader user, I want every edit tool reachable without a mouse, so that I can edit
  as well as anyone.
- **US-5:** As a contributor building `203`–`212`, I want each edit as one tested operation on the project, so that
  new tracks, keyframes and agent tools (`212`) reuse them rather than reimplement them.

## Acceptance Criteria

### The magnetic main track

- [ ] **AC-1:** The timeline has a **Magnetic** switch, on by default. While it is on, every edit behaves exactly as
      in `201` (and 2.x): the video track has no gaps, and delete, trim, split, duplicate and reorder give the same
      clips, starts and lengths as today. All existing video e2e tests pass unchanged. _(unit + e2e)_
- [ ] **AC-2:** With Magnetic off: deleting a clip leaves a gap of its length (lift); trimming a clip's end leaves or
      fills a gap after it without moving later clips; trimming its start moves only that clip's start; dragging a
      clip places it at the time it is dropped (snapped, AC-9). Clips never overlap on a track: a drop that would
      overlap is placed at the nearest free spot where it fits, or refused with a message if there is none (Q2).
      _(unit + e2e)_
- [ ] **AC-3:** Switching Magnetic back on closes every gap on the video track in one undo step (clips keep their
      order). A gap can also be selected and deleted on its own (closing it), with Magnetic on or off. _(unit + e2e)_
- [ ] **AC-4:** Gaps play and export as black frames, with the layers on top and silence from the video track (the
      music keeps playing), for exactly the gap's length to the frame: a fixture with a 1.5 s gap at 30 fps exports
      45 black frames in its place. _(unit + self-test)_

### Edit tools

- [ ] **AC-5:** **Ripple delete and ripple trim**: removing a clip or shortening / lengthening it moves every later
      clip on the track by the same amount, with Magnetic on or off (a ripple is explicit with Magnetic off: Q3).
      Lengthening is limited by the source (video) or 60 s (photo), and by the project's length limit
      (`limitsFor()`: refused with the existing message). _(unit + e2e)_
- [ ] **AC-6:** **Roll**: moving the cut between two adjacent clips lengthens one and shortens the other by the same
      amount; no other clip moves and the video's length is unchanged. It stops where either clip would go under
      0.3 s or a video would run past its source. _(unit + e2e)_
- [ ] **AC-7:** **Slip**: on a video clip, shifting which part of the source plays (in and out together) keeps its
      start and length; it stops at the source's ends. On a photo, slip is refused with a message (a photo has no
      source time). _(unit + e2e)_
- [ ] **AC-8:** **Slide**: moving a clip between its neighbours keeps its own content and length and changes the
      previous clip's end and the next clip's start by the same amount, so nothing else moves and the length is
      unchanged; it stops where a neighbour would go under 0.3 s or past its source. _(unit + e2e)_
- [ ] **AC-9:** **Snapping**, on by default with a switch: drags and trims snap to clip edges, gap edges, layer
      edges, the playhead, 0 and the end within 8 px at the current zoom (as today); with snapping off, or while Q4's
      modifier is held, times follow the pointer to the frame. _(unit + e2e)_

### For everyone

- [ ] **AC-10:** Each tool is reachable by mouse (a tool picker: Select, Roll, Slip, Slide, with its shortcut in the
      tooltip) and by keyboard alone (Q5's keys: with a clip selected, nudge by one frame or one second with the
      chosen tool; ripple trim start / end to the playhead), and each change is announced to screen readers (the
      clip and its new times). axe reports no serious or critical issue; 360 px wide still works with no sideways
      scroll. _(e2e + axe)_
- [ ] **AC-11:** Every operation is one undo step (a drag is one step however long), refuses on a locked track with
      the reason (as in `201`), never leaves a clip shorter than 0.3 s, out of its source, overlapping another clip on
      its track, or a project over its length limit. For every operation, 1,000 seeded random edits on the 2.x
      fixtures leave a project that `mergeProject` accepts unchanged. _(unit)_
- [ ] **AC-12:** Every operation runs on a 500-clip project in under 2 ms (median of 100, unit timing), so drags stay
      smooth at 60 fps. _(unit timing)_

### Docs

- [ ] **AC-13:** `docs/MEDIA-STUDIO.md` (the tools, Magnetic, snapping, keys), `specs/lld.md` (the operations) and
      `CHANGELOG.md` describe the change; the in-app docs list the keys. _(manual check)_

## Non-Functional Requirements

- Performance: AC-12; preview and export speed of a project without gaps stays within 5% of `201` (the self-test's
  timing check).
- Accessibility: AC-10 (WCAG 2.2 AA, keyboard, screen reader, 360 px).
- Compatibility: web and desktop alike; per-platform limits unchanged.
- Security: operations only produce projects the `201` validator accepts (Constitution VIII).

## Out of Scope

- New tracks, overlay clips and picture-in-picture (`203`); edits across several tracks at once (ripple affects the
  track edited, plus Q6).
- Moving timed layers onto tracks (`201` Q2, decided in `203`).
- Keyframes, transitions, speed (`205`–`207`); markers and in / out ranges (`210`).
- Agent tools for these operations (`212`; Q7).
- Saving projects (`201` Q1).

## Open Questions

- **Q1** _(resolved)_ Is Magnetic per project (kept when switching Reel ↔ YouTube, undoable) or an editor
  setting remembered between sessions? _Answer (accepted 2026-10-07):_ per project, part of the project document (version stays 1, a
  new optional field defaulting to on) and not an undo step; switching it on is (AC-3 closes gaps).
- **Q2** _(resolved)_ With Magnetic off, what happens when a clip is dropped onto another clip? _Answer (accepted 2026-10-07):_
  no overwrite in 202: it goes to the nearest free spot where it fits (before or after), else it is refused with
  "No room here: make a gap first or switch Magnetic on". Overwrite and insert edits (Premiere's) can come later.
- **Q3** _(resolved)_ With Magnetic off, how does the user ask for a ripple? _Answer (accepted 2026-10-07):_ the Select tool
  never ripples with Magnetic off; **Shift + Delete** is ripple delete and **Shift-drag** of an edge is ripple trim
  (as Final Cut / Premiere), shown in the tooltips and the docs. With Magnetic on, every delete and trim ripples, as
  today.
- **Q4** _(resolved)_ A modifier to drag without snapping? _Answer (accepted 2026-10-07):_ hold **Alt** while dragging
  (Premiere / Resolve style: Alt bypasses snapping); plus the Snap switch. (Shift is taken by Q3.)
- **Q5** _(resolved)_ Keyboard keys. _Answer (accepted 2026-10-07):_ tools **V** Select, **R** Roll, **Y** Slip, **U** Slide
  (Premiere's letters, R for roll as N is less known); with a clip selected, **Alt + ← / →** nudges by one frame with
  the current tool (Select: moves the clip with Magnetic off, or reorders it with Magnetic on: the keyboard
  reorder 2.x never had), **Shift + Alt + ← / →** by one second; **Q / W** ripple-trim the clip's
  start / end to the playhead; **Shift + Delete** ripple delete. The keys work when the timeline has focus; S, Space,
  Delete and arrows keep today's meaning.
- **Q6** _(resolved)_ Should a ripple on the video track also move the timed layers (titles, stickers) and
  the music after the edit point? _Answer (accepted 2026-10-07):_ no, as today: layers and music keep their own times (they aren't on
  tracks yet, `201` Q2). Revisit in `203` when layers move onto tracks; the docs say so.
- **Q7** _(resolved)_ Constitution XI (agent tools). _Answer (accepted 2026-10-07):_ as in `201` Q7, no tools here; the
  operations are pure functions on the project so `212` exposes them directly. The gap stays recorded.
- **Q8** _(resolved)_ Does slip apply to the music too? _Answer (accepted 2026-10-07):_ the music's start offset already works
  like a slip (drag the music bar, `201`); 202 brings it under the Slip tool's keys for consistency, no new
  behaviour.

## Changelog

- 2026-10-07 — Created.
- 2026-10-07 — Q1–Q8 resolved (all proposals accepted); Approved.
- 2026-10-07 — Plan approved (D1–D4 as recommended, D-009), tasks written; In Progress.
