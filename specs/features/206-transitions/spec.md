<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 206 — Transitions between clips

**Status:** Approved
**Roadmap phase:** Phase 2 — Multi-track timeline (release 3.0.0) · **Created:** 2026-10-13

## Summary

Transitions blend one clip into the next: a cross-dissolve between two shots, a dip to black between scenes, a wipe or a push for energy, a zoom into the next moment. Today a cut is always hard; the only softening is a clip’s **Fade in from black**. 206 lets the user put a transition on any cut between two touching clips, choose its kind and length, and see it the same in the preview and the export, with the clips’ sound blending across it. It completes the timeline’s basic editing set (with 202’s edit tools and 205’s keyframes) and is one of the items the Phase 2 gate needs (“a 4K multi-track timeline with transitions plays smoothly on desktop”).

## User Stories

- **US-1:** As a vlogger, I want a soft cross-dissolve between two shots, so that a change of place doesn’t feel like a jump.
- **US-2:** As a creator making a Reel, I want quick wipes, pushes and zooms between clips, so that the video has the energy of the ones in my feed.
- **US-3:** As a YouTuber, I want a dip to black between chapters and the sound to blend across every transition, so that the video sounds as smooth as it looks.
- **US-4:** As an editor, I want to change a transition’s kind and length on the timeline, put the same one on every cut at once, and keep my transitions when I trim or move clips, so that I don’t redo them after every edit.
- **US-5:** As a keyboard or screen-reader user, I want to add, select, change and remove transitions without a mouse and hear what changed.

## Acceptance Criteria

### The transitions

- [ ] **AC-1:** Five transitions can be put on a cut between two touching clips on the same picture track (Q1): **Cross-dissolve**; **Dip to colour** (black or white: the first clip fades to the colour, then the second fades in from it); **Wipe** (left, right, up, down: an edge moves across and reveals the second clip); **Slide** (left, right, up, down: the second clip pushes the first out of the frame); **Zoom** (the first clip grows while it dissolves into the second). Each is a function of its progress from 0 to 1, eased in and out (Q12): at progress 0 the frame is exactly the first clip alone, at 1 exactly the second clip alone, and a cross-dissolve at 0.5 is an even mix of the two (within 1/255 per channel). _(unit)_
- [ ] **AC-2:** A transition is centred on its cut (Q2): with a length *d* (default 0.5 s, 0.1 s to 3 s, in whole frames, Q3) it runs from *d*/2 before the cut to *d*/2 after it. The first clip goes on playing past its out point and the second starts *d*/2 before its in point, from their sources; where a video’s source has no frames there, its nearest frame is held (a photo always has a picture). The project’s length and every clip’s start and length are the same with and without the transition. _(unit)_
- [ ] **AC-3:** Limits, each refused with the reason: a transition only on a cut between two touching clips of one track (not across a gap, not on a locked track); its half-length on each side fits in that clip together with the clip’s other transition (the two halves never overlap, so a clip of length *L* takes at most *L* of transitions); while a transition between two videos plays, both count towards the videos-at-once limit (web 3, desktop 5; Q7). _(unit)_
- [ ] **AC-4:** Edits keep transitions where they belong (Q8): after a move, trim, Roll, Slip, Slide, split, delete, ripple, Magnetic switch or move to another track, a transition stays on its cut while its two clips still touch, its length shortened to the new limit if needed; when they no longer touch (a gap opens, one is deleted, moved away or to another track) it is removed and the change says so. Undo brings everything back. A seeded property test of 1,000 random edits never leaves a transition between clips that don’t touch or beyond its limits. _(unit)_
- [ ] **AC-5:** Transitions are saved with the project. The document validator reads them with the other fields: unknown kinds, directions and colours become the defaults, lengths are clamped to their limits, transitions on cuts that don’t exist (clips that don’t touch, missing clips) are dropped with a reason; at least 20 malformed documents never make it throw. A project with transitions round-trips document → validator → document equal; documents without transitions stay byte-identical. _(unit)_

### Sound

- [ ] **AC-6:** The clips’ sound blends across a transition (Q6): over a Cross-dissolve, Wipe, Slide or Zoom the two sounds cross-fade with equal power (the squares of their gains sum to 1 within 1 % at every point), the first clip’s sound going on past its out point from its source; over a Dip to colour the first sound fades out by the middle and the second fades in from there. Clip volumes and 205’s volume keyframes still apply on top. A cut without a transition keeps today’s 0.03 s ramps. The export’s sound sources for a fixture with every kind equal the expected list exactly. _(unit)_

### The transitions

- [ ] **AC-7:** Each change is one undo step: adding a transition, changing its kind, direction, colour or length (a drag is one step however long), removing it, and **Apply to every cut** on a track. _(unit)_

### Editing

- [ ] **AC-8:** A **Transitions** panel in the video editor’s tool rail lists the five, each with a small looping preview (a still with reduced motion). Choosing one puts it on the selected cut, or, with a clip selected, on the cut at its end (the start for the last clip); **Apply to every cut** puts it on every cut of that track where it fits. With no cut to use the panel says why. _(e2e (290))_
- [ ] **AC-9:** On the timeline every cut between two touching clips is a focusable target, and a transition shows as a marked block over its cut. A transition is a button: a click selects it and the inspector shows its kind, direction or colour, and length; Delete removes it; dragging either edge changes its length on both sides (in frames, up to its limit); with it selected, ← / → change the length by a frame (Shift: by 0.5 s). Each change is announced (kind, cut, length). _(e2e (290))_
- [ ] **AC-10:** Everything in AC-8 and AC-9 works from the keyboard; the panel, the cut targets, the transition blocks and the inspector fields have names and states for screen readers; axe finds no serious problems in the panel, the timeline and the inspector; at 360 px wide nothing scrolls sideways outside the timeline; with reduced motion the panel’s previews don’t play. _(e2e (290))_

### Rendering

- [ ] **AC-11:** The preview and the export decide what to draw with one function: at a time inside a transition, the two clips, each one’s local time (from its source, held at its edges) and the progress. For a fixture with each kind between a video and a photo, on the main track and on an overlay track, at 30 and 60 fps, its answer at every frame of the export equals the expected list exactly. _(unit)_
- [ ] **AC-12:** Golden frames: each kind (and each direction of Wipe and Slide, both Dip colours) at progress 0, 0.25, 0.5, 0.75 and 1, at 9:16 and 16:9, matches its reference within the self-test’s tolerance on every rendering backend; the paused preview shows the same frames and the export renders the same frames from the same inputs. On an overlay track the transition happens inside the clips’ boxes as they are drawn (203’s boxes and 205’s keyframes included, Q5). _(self-test (290))_
- [ ] **AC-13:** No regressions: projects without transitions are pixel-identical and give identical export inputs (frames, clips, times and sound sources) to 205 for 201’s to 205’s fixtures; every existing video e2e test passes unchanged. _(self-test (290))_
- [ ] **AC-14:** Speed: on the reference mid-range laptop a cross-dissolve between two 1080p30 videos previews with no more dropped frames than 205’s two-video overlay playback; drawing a transition frame at 1080p takes at most 4 ms (median) more than drawing one clip; exporting a 60-second Reel with 10 transitions takes at most 10 % longer than the same Reel with hard cuts. _(timing (290))_

### Docs

- [ ] **AC-15:** `docs/MEDIA-STUDIO.md` (the transitions, their options, limits and keys), `specs/lld.md` (the model, the timing, the drawing and the sound), `CHANGELOG.md` and the in-app docs describe the change; the media studio’s “Still to do” no longer lists cross-fades. _(review)_

## Non-Functional Requirements

- **Performance:** a transition frame costs at most 4 ms more to draw than one clip at 1080p (median, desktop); preview playback and export speed for projects without transitions stay within 5 % of 205 (AC-13, AC-14); no extra decoding outside a transition.
- **Accessibility:** every action works from the keyboard and is announced; names and states for screen readers; reduced motion respected (AC-10).
- **Compatibility:** web and desktop alike; no new dependency; every existing project opens and exports unchanged (AC-5, AC-13).
- **Free and open source:** every transition is for everyone, on the web and the desktop app.

## Out of Scope

- More kinds (iris, spin, blur, glitch), custom or imported transitions, and shader-based drawing (Q1, Q4).
- Transitions at the video’s start or end, into gaps, or on the music (Q9, Q11).
- A choice of easing, keyframes on a transition, or separate sound and picture transitions (Q6, Q12).
- Speed changes (207); audio tracks and sound cross-fades between audio clips (208); text animations (210).
- Agent tools for transitions (212, Q10).

## Open Questions

- **Q1** _(resolved)_ Which transitions, with which options? _Answer (accepted 2026-10-13):_ the five of the work item (P2.6): Cross-dissolve; Dip to colour (black or white, no colour picker); Wipe and Slide in four directions (left, right, up, down); Zoom (in only). More kinds (iris, spin, blur, glitch, custom shaders) can follow in a later feature.
- **Q2** _(resolved)_ How does a transition fit in time? _Answer (accepted 2026-10-13):_ centred on the cut, using the clips’ source beyond their in and out points (“handles”), and holding a video’s first or last frame where its source runs out, so adding or removing a transition never changes the project’s length or any clip’s place. (The alternative, overlapping the clips as some phone editors do, shortens the video by the transition’s length and moves every later clip, music and layer timing out of sync.)
- **Q3** _(resolved)_ Length? _Answer (accepted 2026-10-13):_ 0.5 s by default (a common default that reads as smooth in a Reel), from 0.1 s to 3 s, in whole frames; limited by the clips as AC-3 says.
- **Q4** _(resolved)_ The roadmap says “as shaders”: must transitions run on the GPU? _Answer (accepted 2026-10-13):_ not in 206. The video preview and export draw with the 2D canvas today (203, 205); all five kinds are a mix, a moving edge or a moving and scaled picture, which the 2D canvas draws exactly and the same in the preview, the export and every browser. Writing them as shaders now would need the video drawing moved to the GPU first, a separate, larger change. They move to shaders when the video pipeline does; the roadmap item becomes “Transitions between clips”. This is the maintainer’s call.
- **Q5** _(resolved)_ Which tracks? _Answer (accepted 2026-10-13):_ every picture track: the main track and overlay tracks, always between two touching clips of the same track. On an overlay track the transition happens inside the clips’ boxes as drawn (a wipe moves across the clips, not the whole frame); a clip with a box that differs from its neighbour’s blends from one box to the other only through the transition’s picture, not by moving the box.
- **Q6** _(resolved)_ What happens to the sound? _Answer (accepted 2026-10-13):_ always blended: equal-power cross-fades for Cross-dissolve, Wipe, Slide and Zoom; for Dip to colour the sound dips too (out to the middle, then in). No option to turn it off in 206; a hard sound cut over a soft picture transition can come with the audio work (208).
- **Q7** _(resolved)_ Do the two videos during a transition count towards the videos-at-once limit? _Answer (accepted 2026-10-13):_ yes: both are decoded and drawn at once, so the limit (web 3, desktop 5) stays honest; a transition that would go over it is refused with the reason, as 203’s edits are.
- **Q8** _(resolved)_ What happens to a transition when an edit separates its clips? _Answer (accepted 2026-10-13):_ it is removed, and the edit’s announcement says so; undo brings it back with the clips. While the clips still touch it stays, shortened if the new limits need it. (The alternative, refusing edits that would break a transition, would make ordinary trims fail.)
- **Q9** _(resolved)_ Transitions at the video’s start or end, or into a gap? _Answer (accepted 2026-10-13):_ not in 206: a transition always joins two clips. The clip’s **Fade in from black** and the video’s fade-out at its end stay as they are and cover the start and the end; a gap stays a hard cut to black.
- **Q10** _(resolved)_ Agent tools (Constitution XI)? _Answer (accepted 2026-10-13):_ none in 206, as 203 and 205: transitions are store actions and pure functions, and the timeline’s agent tools, transitions included, come together in 212.
- **Q11** _(resolved)_ Should the selected cut, the Transitions panel and Apply to every cut also cover the music track? _Answer (accepted 2026-10-13):_ no: the music is one clip; its sound already fades in and out. Sound-only cross-fades between audio clips come with audio tracks (208).
- **Q12** _(resolved)_ Easing? _Answer (accepted 2026-10-13):_ every transition’s progress follows Ease in and out (205’s curve), with no choice in 206; a choice of easing, or keyframes on a transition’s progress, can come later.

## Changelog

- 2026-10-13 — Created: draft spec with 15 acceptance criteria and 12 open questions with proposed answers.
- 2026-10-13 — Q1–Q12: every proposed answer accepted by the maintainer (Q4: 2D canvas, no shaders in 206, D-035); Approved.
