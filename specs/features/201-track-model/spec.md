# 201 — Track model and migration (P2.1)

**Status:** In Progress <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 2 — Multi-track timeline · **Created:** 2026-10-06 · **Owner:** RVicky172

## Summary

The video editor (Reels / Shorts and YouTube) holds one sequence today: clips one after another, one music file and
text/sticker layers timed over the whole video. Every Phase 2 feature (ripple and roll edits, picture-in-picture,
keyframes, transitions, speed, audio tracks, voice-over) needs clips that sit at a time on a **track** rather than in a
list. This feature changes the editor's project model to tracks, converts today's sequence into it exactly, and gives
the project a versioned, validated document form so later features (and saving projects, Q1) build on one gate. For
users nothing they make looks or sounds different: the same preview, the same exported MP4. What they gain now is
track headers on the timeline (show/hide or mute, lock, height); everything else comes with `202`–`212`.

## User Stories

- **US-1:** As a video creator, I want my Reels and YouTube videos to play and export exactly as before after this
  change, so that the update costs me nothing.
- **US-2:** As a video creator, I want to mute the music, hide the video track and lock a track while I work, so that I
  can check parts of the edit and not move things by accident.
- **US-3:** As a contributor building Phase 2 (`202`–`212`), I want one project model with tracks and absolute clip
  times, validated in one place, so that every new edit tool works on the same shapes and bad data can't break the
  editor.
- **US-4:** As the maintainer, I want the conversion from today's sequence proven by tests for every shape a 2.x
  project can take, so that "every 2.x project opens unchanged" (the Phase 2 exit criterion) holds from the start.

## Acceptance Criteria

### Model

- [ ] **AC-1:** A project is a set of tracks; each track has an id, a kind (**video**, **overlay** or **audio**), a
      name, muted / hidden, locked and a height; each clip belongs to exactly one track and has an absolute start
      (seconds from the start of the video, ≥ 0) and its length as today (photo seconds, or the used part of the source
      video). The model can hold the limits of Q4 (tracks) and today's per-platform clip limits (`limitsFor()`: up to
      20 / 50 / 60 / 500 clips). _(unit)_
- [ ] **AC-2:** Today's sequence converts exactly: the clips become one **video** track, back to back from 0 in their
      order (each start = the sum of the lengths before it, to 1 ms); the music becomes one **audio** track holding
      the song with its offset, volume and fade-out unchanged; timed layers keep their start / end (Q2). With no music,
      the audio track exists and is empty. _(unit)_

### Nothing changes for users

- [ ] **AC-3:** For a set of fixture projects (photo-only Reel, video-only, mixed, with music and an offset, with
      timed layers, with the fade-out, at 9:16, 4:5, 1:1 and 16:9), the preview frame at 10 sample times per project is
      pixel-identical before and after, and the export is made from identical inputs: every frame's clip and time and
      every sound source (start, end, source time, volume, ramps) equal 2.x's exactly. _(unit + self-test)_
- [ ] **AC-4:** Every editing action of today works as before on the video track: add (files and drop), remove,
      reorder (drag and Alt+arrow), duplicate, split at the playhead, trim, photo duration, motion, fade, clip volume,
      music add / remove / offset / volume, timed layers, switching Reel ↔ YouTube, undo / redo with the same steps.
      All existing video e2e tests pass unchanged. _(e2e)_
- [ ] **AC-5:** Speed: preview frame time and export time of a 60-clip 1080p YouTube fixture are within 5% of 2.x on the
      same machine: the fastest of 3 runs, compared with the slowest of the 2.x baseline sessions' fastest runs.
      _(self-test timing)_

### Project document and validator

- [ ] **AC-6:** The project has a document form (JSON) with a version number: **1** for this model; a document
      without a version is read as today's sequence shape and converted (AC-2). One validator reads any document:
      out-of-range or wrong-type values are clamped or replaced by defaults, unknown fields and clips that point at a
      missing track or file are dropped with a reason, nothing it is given can throw or produce an invalid project, and
      limits are enforced (tracks per Q4, clips per platform, finite times, 0 ≤ in < out ≤ source length). _(unit: at
      least 30 malformed documents)_
- [ ] **AC-7:** Round trips: for every 2.x shape (empty; photo-only; video-only; mixed; with music and offset; with
      timed layers; at 20, 60 and 500 clips), sequence → v1 → document → validator gives back an equal project, and
      v1 → the clip times the 2.x editor used gives back the original placement. _(unit)_

### Track headers

- [ ] **AC-8:** The timeline shows a header per track with its name and three controls, each a labelled button
      usable by keyboard and screen reader: **Hide** (video / overlay: not drawn in the preview or the export) or
      **Mute** (audio: silent in the preview and the export), **Lock**, and the track's height (Q5). axe reports no
      serious or critical issue; 360 px wide still works with no sideways scroll. _(e2e + axe)_
- [ ] **AC-9:** Hidden and muted tracks are left out of the export as they are left out of the preview: a fixture
      with the music muted exports silent music (clip sound kept); with the video track hidden it exports black frames
      with the layers on top. _(self-test)_
- [ ] **AC-10:** A locked track's clips can't be selected for editing, dragged, trimmed, split, duplicated or deleted
      (the controls say why); it still plays and exports. _(e2e)_
- [ ] **AC-11:** Hide / mute and lock are undo steps; a track's height is a view setting, not an undo step, and lasts
      for the session. _(e2e)_

### Docs

- [ ] **AC-12:** `docs/MEDIA-STUDIO.md` (tracks, headers), `specs/lld.md` (the model and its validator) and
      `CHANGELOG.md` describe the change. _(manual check)_

## Non-Functional Requirements

- Performance: AC-5; no more memory per clip than today beyond its track id and start.
- Accessibility: AC-8 (WCAG 2.2 AA, keyboard, screen reader, 360 px).
- Compatibility: web and desktop alike; the per-platform clip limits are unchanged.
- Security: the validator is the only way in for project data (Constitution VIII).

## Out of Scope

- Adding tracks, overlay clips and picture-in-picture (`203`); edit tools such as ripple, roll and the magnetic main
  track (`202`); keyframes, transitions, speed, audio tracks beyond music, voice-over (`205`–`209`).
- Saving and opening video projects as files, unless Q1 says otherwise.
- Agent tools for the timeline (`212`, `000` gap G1); see Q7.

## Open Questions

- **Q1** _(resolved)_ Video projects last for the session today; there are no saved 2.x project files to
  migrate. Does 201 add **Save / Open project**? _Answer (accepted 2026-10-06):_ no. 201 defines the document and validator (AC-6, AC-7)
  so saving is a small step later, but Save / Open needs its own design for the media (clips are the user's files:
  embed them, or keep paths on desktop and ask to relink on the web) and becomes its own feature (`4xx`, before
  2.x users can lose work across a 3.0 update). "Every 2.x project opens unchanged" is then met by AC-2–AC-4 and AC-7
  for the in-session project.
- **Q2** _(resolved)_ Do the timed layers (text, shapes, stickers, drawings, images over the video) move onto
  an **overlay** track? _Answer (accepted 2026-10-06):_ not in 201. They keep their own start / end over the whole video as today; overlay
  tracks are created empty by the model and filled from `203` (picture-in-picture clips), and moving layers onto
  tracks is decided there.
- **Q3** _(resolved)_ Gaps: with absolute starts a clip can sit after empty time. _Answer (accepted 2026-10-06):_ the model allows
  gaps on any track (shown and exported as black on the video track, silence on audio), but 201's editing keeps the
  video track gapless exactly as today (reorder, trim and delete close up); gaps become reachable with `202`'s edit
  tools.
- **Q4** _(resolved)_ Track limits. _Answer (accepted 2026-10-06):_ the model and validator allow up to 8 video / overlay tracks and
  8 audio tracks on desktop, 4 + 4 on the web (Phase 2's exit test is 3 video + 2 audio); 201's projects have exactly
  1 video + 1 audio track and there is no "add track" yet.
- **Q5** _(resolved)_ Track height. _Answer (accepted 2026-10-06):_ three sizes (small 40 px, medium 64 px, large 96 px) from a
  menu in the header, not a drag handle: keyboard-friendly and enough for the filmstrip and waveform.
- **Q6** _(resolved)_ Time precision. _Answer (accepted 2026-10-06, changed the same day, see Changelog):_ times in
  seconds at full precision (JSON keeps a double exactly); the validator checks they are finite and in range but
  doesn't round them. Moving to integer frame ticks is deferred to `205` (keyframes) if needed.
- **Q7** _(resolved)_ Constitution XI wants every user-facing feature reachable by an agent tool; video has
  none yet (`000` G1 → `212`). _Answer (accepted 2026-10-06):_ 201 adds no tools; track headers join the timeline tools in `212`. The gap
  stays recorded.

## Changelog

- 2026-10-06 — Created.
- 2026-10-06 — Q1–Q7 resolved (all proposals accepted); Approved.
- 2026-10-06 — Plan D1: AC-3 proves the export by identical inputs to the unchanged renderer, encoder and mixer
  (decoding two exports isn't bit-exact with hardware encoders). D2: hiding the video track hides pictures only.
- 2026-10-06 — Plan approved, tasks written; In Progress.
- 2026-10-06 — AC-5: compared on the fastest of 3 runs (T002: medians of 3 swing ~45% between sessions on unchanged
  code). Q6: no 1 ms rounding: it would move clip boundaries (a ⅔ s boundary at 0.667 s lands on frame 21 instead of
  20 at 30 fps) and break AC-3 and AC-7. Both approved by the maintainer (found in T002 and T010).
