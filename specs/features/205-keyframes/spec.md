<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 205 — Keyframes: animate a clip's box, its volume and layers over time

**Status:** Approved
**Roadmap phase:** Phase 2 — Multi-track timeline (release 3.0.0) · **Created:** 2026-10-12

## Summary

Keyframes let a value change over time: a picture-in-picture clip that slides in from the side and grows, a logo that fades out, a title that flies in and settles, a clip whose sound dips under a voice. Today every clip box, layer and clip volume holds one value for its whole length, so motion is limited to the photo movement presets. 205 lets the user set values at chosen moments (keyframes) and has the preview and the export move smoothly between them, with a choice of how each change eases. It is the base for later work: transitions (206), speed ramps (207), volume ducking (208) and text animations (210).

## User Stories

- **US-1:** As a vlogger, I want my face-cam to slide in from the corner and grow when I start talking, so that the video feels edited rather than static.
- **US-2:** As a creator, I want a title to fly in, hold and fade out, so that my Reel opens like the ones I see in my feed.
- **US-3:** As a YouTuber, I want a B-roll clip's own sound to dip while I speak over it and come back after, so that viewers hear both without a jump.
- **US-4:** As an editor, I want to see, move and delete keyframes on the timeline and choose how each change eases, so that I can fine-tune timing without redoing it.
- **US-5:** As a keyboard or screen-reader user, I want to add, find, move and remove keyframes without a mouse and hear what changed.

## Acceptance Criteria

### The model

- [ ] **AC-1:** These values can be animated (Q1): a picture clip's box (X, Y, size, rotation, opacity, corner radius), a video clip's volume, and a layer's X, Y, size, rotation and opacity. Each animated value is a list of keyframes (a time and a value) in time order; a value without keyframes stays as today. _(unit)_
- [ ] **AC-2:** Between two keyframes the value follows the first one's interpolation (Q3): **Linear**, **Ease in**, **Ease out**, **Ease in and out** (the standard CSS curves `ease-in`, `ease-out`, `ease-in-out`, within 0.001 of the value) or **Hold** (the value stays until the next keyframe). At a keyframe's time the value is exactly the keyframe's; before the first keyframe it is the first one's value, after the last the last one's. Values never leave their property's range (the ranges of 203's transform, layers and volume). _(unit)_
- [ ] **AC-3:** Keyframe times are measured from the start of their clip or layer (Q2), so moving a clip or layer (drag, ripple, roll, slide, nudge, a change of track) moves its keyframes with it. Trimming a clip's start keeps every keyframe at the same place on the timeline; keyframes that end up outside the clip are kept (an undo or a re-trim brings them back) but don't act. Splitting gives each part the keyframes in its span plus a keyframe at the cut holding the value there, so nothing jumps; duplicating copies them. Slip doesn't move them. _(unit)_
- [ ] **AC-4:** The project document stores keyframes as optional fields: every existing document opens unchanged and one without keyframes is written back byte-identical. The validator sorts keyframes by time, keeps the last of several at the same time, clamps values to their range, drops non-numeric ones, and enforces at most 100 keyframes per value and 5,000 per project (Q5) with a reason; at least 25 malformed documents never make it throw. A project with keyframes round-trips document → validator → document equal. _(unit)_
- [ ] **AC-5:** Every edit to keyframes is one undo step: adding, changing a value, moving, deleting, changing an interpolation; a drag (on the stage or on the timeline) is one step however long. _(unit)_

### Editing

- [ ] **AC-6:** In the inspector each animatable value has a keyframe button (Q4) that shows whether the value is not animated, has a keyframe at the playhead, or is animated between keyframes. Pressing it starts animating the value with a keyframe at the playhead (or adds / removes the keyframe at the playhead). While a value is animated, changing it at the playhead (its field, a drag on the stage, the arrow keys) adds a keyframe there or updates the one there. Previous / next keyframe buttons move the playhead to the selected clip's or layer's keyframes. _(e2e (290))_
- [ ] **AC-7:** Under the selected clip or layer the timeline shows a keyframe lane with a diamond per keyframe time (one row per animated value when expanded). A diamond can be selected, dragged in time (snapping to frames, the playhead and the clip's ends, as 202's Snap), deleted with Delete, and given an interpolation from its menu; the diamond's shape shows its interpolation. Keyboard (with the timeline focused): K adds or removes keyframes at the playhead for every animated value of the selection, Alt + [ / Alt + ] go to the previous / next keyframe, and with a keyframe selected ← / → move it a frame (Shift: a second). Each change is announced to screen readers (the value, its time and its new state). _(e2e (290))_

### Rendering

- [ ] **AC-8:** The preview and the export take every animated value from the same evaluation at each frame's time on the export's frame grid: for a fixture (a clip moving from one corner to the other with Ease in and out while its opacity falls from 100 % to 0 and it turns 90°; a title layer that flies in, holds, and fades), the values at every frame equal the expected list exactly. _(unit)_
- [ ] **AC-9:** Golden frames: that fixture at 9:16 and 16:9, at 8 sample times including each keyframe's frame, matches its reference within the self-test's tolerance on every GPU backend, the paused preview shows the same frames, and the export renders the same frames from the same inputs. _(self-test (290))_
- [ ] **AC-10:** Volume keyframes shape a video clip's sound in the export sample by sample (no steps or clicks: within 0.5 dB of the curve) and in the preview within one frame of it; at 0 % the clip is silent. The export's sound sources for a fixture with volume keyframes equal the expected list exactly. _(unit + self-test (290))_
- [ ] **AC-11:** A project without keyframes is unchanged: pixel-identical preview frames at 10 sample times and identical export inputs (frames, clips, times and sound sources) to 203 for 201's, 202's and 203's fixtures; all existing video e2e tests pass unchanged. _(self-test (290))_

### Quality

- [ ] **AC-12:** Working out every animated value for one frame takes at most 0.05 ms (median) for a project with 500 clips and 5,000 keyframes, so keyframes don't slow playback; a project without keyframes does no extra work per frame. _(unit)_
- [ ] **AC-13:** Everything in AC-6 and AC-7 works from the keyboard; the keyframe buttons, the lane and the interpolation menu have names and states for screen readers; axe finds no serious problems in the inspector and the timeline; at 360 px wide nothing scrolls sideways outside the timeline; with reduced motion the lane and diamonds don't animate. _(e2e (290))_
- [ ] **AC-14:** `docs/MEDIA-STUDIO.md` (keyframes, interpolations, keys), `specs/lld.md` (the keyframe model, the evaluation, the document fields), `CHANGELOG.md` and the in-app docs (keys) describe the change. _(review)_

## Non-Functional Requirements

- **Performance:** keyframes add at most 0.05 ms per frame (AC-12); preview playback and export speed stay within 5 % of 203 for projects without keyframes; no new decoding or memory per keyframe.
- **Accessibility:** every keyframe action works from the keyboard and is announced; names and states for screen readers; reduced motion respected (AC-13).
- **Compatibility:** web and desktop alike; no new dependency; every existing project opens and exports unchanged (AC-4, AC-11).
- **Free and open source:** keyframes are for everyone, on the web and the desktop app.

## Out of Scope

- Keyframes on colour adjustments, looks and masks (Phase 3, the colour work).
- The music's volume, ducking, and boosting a clip above 100 % (208).
- Speed changes and speed ramps (207); transitions (206).
- Text style animation and animation presets (slide, pop, typewriter: 210).
- Custom easing curves, Bézier handles, a graph editor, curved motion paths.
- Agent tools for keyframes (212, Q6).

## Open Questions

- **Q1** _(resolved)_ Which values can be animated in 205? _Answer (accepted 2026-10-12):_ a picture clip's box (X, Y, size, rotation, opacity, corner radius, from 203), a video clip's volume, and a layer's X, Y, size, rotation and opacity: what motion, picture-in-picture and titles need. Not in 205: colour adjustments and masks (the colour work of Phase 3), the music's volume (with ducking in 208), text style (colour, size of the font) and the photo movement presets, which stay as they are (Q7).
- **Q2** _(resolved)_ What are keyframe times measured from? _Answer (accepted 2026-10-12):_ the clip's (or layer's) start on the timeline, so moving it moves its animation. Trimming the start keeps keyframes where they are on the timeline (the motion doesn't jump); keyframes outside the clip are kept but don't act. Slip changes what a video shows, not when its box moves, so it leaves keyframes alone. (The alternative, times in the video's own source, would make a slip move the animation.)
- **Q3** _(resolved)_ Which interpolations, and which one do new keyframes get? _Answer (accepted 2026-10-12):_ Linear, Ease in, Ease out, Ease in and out, and Hold; a keyframe's interpolation applies to the change that starts at it. New keyframes get **Ease in and out**, which looks natural for motion and fades; the menu changes it. Custom curves (Bézier handles, a graph editor) are out of scope.
- **Q4** _(resolved)_ How does a user start animating a value? _Answer (accepted 2026-10-12):_ as in most editors, a keyframe button next to each value in the inspector (a diamond: empty when not animated, filled at a keyframe, half when between keyframes). Once a value is animated, any change at the playhead (field, stage drag, arrow keys) sets a keyframe there; to change the whole animation at once the user removes its keyframes (the button's menu: **Remove animation**). The timeline's lane shows and edits the keyframes of the selected clip or layer only, to keep the timeline readable.
- **Q5** _(resolved)_ Limits? _Answer (accepted 2026-10-12):_ 100 keyframes per value and 5,000 per project, on the web and the desktop app alike: far beyond hand-made animation, and they bound the document and the per-frame work (AC-12).
- **Q6** _(resolved)_ Agent tools (Constitution XI)? _Answer (accepted 2026-10-12):_ none in 205, as 203 (Q14): keyframes are store actions and pure functions, and the timeline's agent tools, keyframes included, come together in 212.
- **Q7** _(resolved)_ How do keyframes and a photo's movement preset (zoom in, pan left …) combine? _Answer (accepted 2026-10-12):_ both apply: the preset moves the picture inside its box (as today), keyframes move the box. Turning presets into editable keyframes is left for later; nothing about existing projects changes.
- **Q8** _(resolved)_ Volume range for keyframes? _Answer (accepted 2026-10-12):_ 0–100 %, the clip volume's range today (no boost above the file's own level); a boost, with a limiter, comes with the audio work in 208.

## Changelog

- 2026-10-12 — Created: draft spec with 14 acceptance criteria and 8 open questions with proposed answers.
- 2026-10-12 — Q1–Q8: every proposed answer accepted by the maintainer; Approved.
- 2026-10-12 — Plan drafted (§1–§11, D1–D3 for the maintainer).
