<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 207 — Speed: constant, reverse, freeze, ramps

**Status:** Implemented
**Roadmap phase:** Phase 2 — Multi-track timeline (release 3.0.0) · **Created:** 2026-10-16

## Summary

Speed changes are one of the most used edits in short video: a slow-motion moment, a time-lapse of a long walk, a clip played backwards, a still held on the best frame, a ramp that speeds into an action and slows down at its peak. Today every video clip plays at its own speed, forwards, and the only still is a photo. 207 lets the user set a video clip’s speed (constant), play it in reverse, freeze a frame, and ramp the speed over the clip with a curve, and see it the same in the preview and the export. The clip’s sound follows a constant speed; it is muted for ramps and reverse at first, as the work item (P2.7) says. With 206’s transitions and 205’s keyframes it completes the timeline’s picture edits for Phase 2.

## User Stories

- **US-1:** As a creator making a Reel, I want to slow a clip down or speed it up to an exact speed, so that a jump lands in slow motion and a long walk becomes a few seconds.
- **US-2:** As a vlogger, I want to play a clip backwards, so that I can rewind a moment for effect.
- **US-3:** As an editor, I want to freeze the frame at the playhead for a few seconds, so that I can hold on a face or put a title over a still.
- **US-4:** As a creator, I want speed ramps (presets like Montage or Hero, or my own curve), so that a clip speeds into an action and slows at its peak, like the edits in my feed.
- **US-5:** As an editor, I want speed changes to keep the rest of my edit in order (later clips, transitions, keyframes, sound), and to undo them in one step.
- **US-6:** As a keyboard or screen-reader user, I want to set speed, reverse, freeze and ramps without a mouse and hear what changed.

## Acceptance Criteria

### Constant speed

- [x] **AC-1:** A video clip has a speed from 0.1× to 10× (Q1), 1× by default, typed or chosen from presets 0.25×, 0.5×, 0.75×, 1×, 1.5×, 2×, 4×. At speed *s* the same part of the source (its in and out points) lasts (out − in) / *s* on the timeline, and the source time at *t* seconds into the clip is in + *t* × *s*. For a fixture at 0.25×, 0.5×, 2× and 10×, at 30 and 60 fps, the source time drawn at every frame of the export equals the expected list exactly (within 1 µs). Photos have no speed (their length is how long they show). _(unit)_
- [x] **AC-2:** Changing a clip’s speed changes its length on the timeline, not the part of the source it uses (Q2). On the main track with **Magnetic** on, later clips move with it; elsewhere a clip that would run into the next clip is refused with the reason (Q3). A change that would make the video longer than its platform’s limit (Reels 90 s web / 180 s desktop, YouTube 15 min / 3 h) is refused with the reason, as is a speed that would make the clip shorter than 0.1 s. Trimming a sped-up clip moves its in and out points by its speed (a 1 s drag at 2× uses 2 s more source). Roll, Slip, Slide and split keep each part’s speed. _(unit)_

### Reverse

- [x] **AC-3:** A video clip can play in reverse, at any constant speed: the first frame shown is its out point and the last its in point, and the source time at *t* seconds into the clip is out − *t* × *s*. Trimming its start on the timeline moves its out point and trimming its end its in point, so what the user sees at each edge is what they trim. For a fixture reversed at 1× and 2×, the source time at every frame of the export equals the expected list exactly. _(unit)_

### Freeze frame

- [x] **AC-4:** **Freeze frame** with a video clip under the playhead splits it there and puts a still of that exact frame between the two parts (Q4): 2 s by default, 0.1 s to 60 s, its length changed like a photo’s by dragging its end. It is drawn from the video at that source time (not a screenshot of the preview), with the clip’s box, framing and look (203, 205, its edit) carried over; it has no sound. On the main track with Magnetic on, later clips move by its length; elsewhere it is refused when it doesn’t fit, with the reason. At the clip’s first or last frame it goes before or after the clip without a split. _(unit)_

### Speed ramps

- [x] **AC-5:** A video clip can have a speed ramp instead of a constant speed: a curve of speed over the clip, 2 to 10 points (Q5), each a place along the clip and a speed from 0.1× to 10×, joined smoothly. Six presets set the points (Montage, Hero, Bullet, Jump cut, Flash in, Flash out, Q6), which can then be changed. The clip’s length is the time the curve takes to play through its source part, and the source time is a function of clip time that always moves forwards, starts at its in point and ends exactly at its out point (within 1 µs); a ramp never reaches the out point early or late. For a fixture with each preset and a custom curve, at 30 and 60 fps, the source time at every frame equals the expected list exactly. A ramp and reverse don’t go together on one clip in 207 (Q7). _(unit)_

### Sound

- [x] **AC-6:** The clip’s sound follows a constant speed (Q8): over its length on the timeline it plays the same part of the source, faster or slower, at the same pitch, from 0.5× to 2×; outside that range, in reverse and with a ramp it is muted, and the inspector says why. A freeze frame is silent. Clip volume, 205’s volume keyframes and 206’s transition fades apply on the timeline as before. The export’s sound sources for a fixture with each case equal the expected list exactly. _(unit)_

### Keeping the edit

- [x] **AC-7:** A clip’s keyframes (205) stay at the same places along the clip when its speed or ramp changes, so an animation keeps its shape over the new length (Q9). Its transitions (206) keep their lengths and are shortened to the new limit if needed, with the reason; their handles (the source beyond in and out) are taken at the clip’s speed at that edge, held at its first or last frame where the source runs out. Layers and the music are timed on the timeline and don’t move unless Magnetic moves the clips they follow today. _(unit)_
- [x] **AC-8:** Each change is one undo step: setting a speed (a slider drag is one step however long), reverse on or off, freeze frame, choosing a ramp preset, moving, adding or removing a ramp point (a drag is one step), and **Reset speed**. A seeded property test of 1,000 random speed, reverse, ramp, freeze, trim, split and move edits never leaves a clip whose source time leaves its in–out part, whose length differs from what its speed gives, or that overlaps another clip on its track. _(unit)_

### Saving

- [x] **AC-9:** Speed, reverse, ramps and freeze frames are saved with the project. The document validator reads them with the other fields: speeds are clamped to 0.1×–10×, ramps with fewer than 2 or more than 10 points, unordered places or non-finite values are mended or dropped with the reason, reverse together with a ramp keeps the ramp; at least 20 malformed documents never make it throw. A project with every case round-trips document → validator → document equal; documents without speed changes stay byte-identical. _(unit)_

### Rendering

- [x] **AC-10:** The preview and the export decide which source frame to draw with one function (the same one as AC-1, AC-3, AC-5): at any time, each clip under it and the source time to show. The export draws only the frames it shows, and when the next frame it needs is past the next key frame it jumps to that key frame instead of decoding through (at 10× it never plays through the source); a freeze frame is decoded once (D3). _(unit)_

### Editing

- [ ] **AC-11:** The inspector of a selected video clip has a **Speed** group: Constant or Ramp; the speed as a field and slider with the presets (AC-1); **Reverse**; the ramp’s presets and a curve editor with its points (drag a point, double-click to add one, Delete to remove one); the clip’s new length; **Reset speed**. **Freeze frame** is in the timeline’s transport and on Shift + F with the timeline focused (Q10). On the timeline a sped-up, slowed, reversed or ramped clip shows a badge (“2×”, “0.5×”, “◀ 1×”, “Ramp”), and a freeze frame looks like a still. _(e2e (290))_
- [ ] **AC-12:** Everything in AC-11 works from the keyboard: the ramp’s points are focusable, ← / → move a point along the clip and ↑ / ↓ change its speed (Shift: larger steps); every control has a name and state for screen readers and each change is announced (clip, speed, new length); axe finds no serious problems in the inspector and timeline; at 360 px wide nothing scrolls sideways outside the timeline. _(e2e (290))_

### Rendering

- [ ] **AC-13:** Golden frames: a test video with a frame counter burnt in, at 0.5×, 2×, 10×, reversed, frozen and with the Hero ramp, shows at each checked frame of the export exactly the source frame AC-1, AC-3, AC-4 and AC-5 say; the paused preview shows the same frame. No regressions: projects without speed changes are pixel-identical and give identical export inputs (frames, clips, times and sound sources) to 206 for 201’s to 206’s fixtures; every existing video e2e test passes unchanged. _(self-test (290))_
- [ ] **AC-14:** Speed: on the reference mid-range laptop, a 1080p30 clip previews at 2× with no more dropped frames than at 1× and at 4× with at most 10 % dropped; reversed 1080p30 previews with at most 10 % dropped after its first second; a frozen frame costs no decoding while it shows. Exporting a 60-second Reel made of clips at 0.5× to 4× takes at most 25 % longer than the same Reel at 1×. _(timing (290))_

### Docs

- [x] **AC-15:** `docs/MEDIA-STUDIO.md` (speed, reverse, freeze frame, ramps, their limits, the sound and the keys), `specs/lld.md` (the time mapping, the ramp curve, the sound), `CHANGELOG.md` and the in-app docs describe the change; the media studio’s “Still to do” no longer lists speed changes and reverse. _(review)_

## Non-Functional Requirements

- **Performance:** at 1× and without a ramp nothing changes: projects without speed changes preview and export within 5 % of 206 (AC-13); a speed change costs only the decoding it needs (fast clips skip frames in the export, freezes decode once); preview at high speeds and in reverse may drop frames within AC-14’s limits.
- **Accuracy:** the source frame shown at every exported frame is exactly the one the speed, reverse, ramp or freeze says (AC-1, AC-3–AC-5, AC-10, AC-13); a clip’s length never drifts from its speed (AC-8).
- **Accessibility:** every action works from the keyboard and is announced; names and states for screen readers; the curve editor has a non-pointer way to set every point (AC-12).
- **Compatibility:** web and desktop alike; no new dependency; every existing project opens and exports unchanged (AC-9, AC-13).
- **Free and open source:** every speed feature is for everyone, on the web and in the desktop app.

## Out of Scope

- Speeds outside 0.1×–10×; keeping the clip’s length when the speed changes (Q1, Q2).
- Sound for ramps and reverse, and pitch-kept sound outside 0.5×–2× (Q8): later, with the audio work.
- Ramps together with reverse (Q7); frame blending or optical-flow slow motion (frames are repeated when slowed).
- Speed for photos, layers or the music; speed keyframed through 205’s keyframes (ramps are their own curve).
- Agent tools for speed (212, Q11).

## Open Questions

- **Q1** _(resolved)_ Speed range? _Answer (accepted 2026-10-18):_ 0.1× to 10× for constant speed and ramp points, in steps of 0.01×. Phone editors go further (CapCut 0.1×–100×), but past 10× a 1080p clip is mostly skipped frames and the export would decode most of the source to throw it away; a long time-lapse is better done by trimming. Easy to widen later.
- **Q2** _(resolved)_ What does changing the speed keep: the part of the source, or the clip’s length on the timeline? _Answer (accepted 2026-10-18):_ the part of the source (in and out points stay; the clip gets shorter or longer), as Premiere, Resolve and CapCut do by default. Keeping the length (and moving the out point) can come later as an option.
- **Q3** _(resolved)_ A slower clip on an overlay track, or on the main track with Magnetic off, that would run into the next clip? _Answer (accepted 2026-10-18):_ refused with the reason (“There is 1.2 s of room before the next clip; at 0.5× this clip needs 4 s”), like other edits that don’t fit; never silently trimmed and never overwriting the next clip.
- **Q4** _(resolved)_ What is a freeze frame? _Answer (accepted 2026-10-18):_ a still of the frame at the playhead, placed between the two halves of the split clip (what CapCut and Premiere’s Insert Frame Hold Segment do), 2 s by default, with no sound; it keeps the clip’s box, framing and look so it matches the frames around it. It is its own clip (it can be moved, trimmed, deleted, given transitions and keyframes like a photo), not a speed of 0. The alternative, holding the last frame of a clip, is the same edit with the playhead on that frame.
- **Q5** _(resolved)_ How many ramp points, and how are they joined? _Answer (accepted 2026-10-18):_ 2 to 10 points, joined by a smooth curve that doesn’t overshoot between points (so the speed never goes outside the points’ range or below 0.1×). Points are places along the clip’s source part (0 to 100 %), so trimming keeps the curve’s shape over what’s left.
- **Q6** _(resolved)_ Which ramp presets? _Answer (accepted 2026-10-18):_ six, after CapCut’s familiar set, with our own numbers: **Montage** (fast–slow–fast–slow–fast), **Hero** (normal, slow in the middle, normal), **Bullet** (fast, very slow in the middle, fast), **Jump cut** (normal, a short fast burst, normal), **Flash in** (fast into normal), **Flash out** (normal into fast). Each is just a starting set of points.
- **Q7** _(resolved)_ Ramps with reverse? _Answer (accepted 2026-10-18):_ not in 207: turning on Reverse sets the clip back to a constant speed (and says so), and choosing a ramp turns Reverse off. Reverse with a ramp is rare and doubles the cases to get right; it can come later.
- **Q8** _(resolved)_ The sound at a constant speed: same pitch, or pitch follows the speed (“chipmunk”)? _Answer (accepted 2026-10-18):_ same pitch from 0.5× to 2×, muted outside it, in reverse and with ramps (the work item says muted for ramps and reverse at first). The preview gets the same pitch from the browser (audio elements keep pitch by default); the export needs a time-stretch of its own (no new library), which is the main cost of this feature. The cheaper choice is pitch following the speed (a simple resample, same in preview and export); it sounds like a tape played fast or slow. The maintainer chose same pitch on 2026-10-18.
- **Q9** _(resolved)_ Keyframes when the speed changes: stay at the same timeline times, or the same places along the clip? _Answer (accepted 2026-10-18):_ the same places along the clip (scaled with its length), so a zoom that ran over the whole clip still does; keyframes are timed from the clip’s start on the timeline (205) and stay so.
- **Q10** _(resolved)_ Keys? _Answer (accepted 2026-10-18):_ Shift + F for Freeze frame with the timeline focused (F alone is free today but reads as “fit” in other editors). No key for speed: it is in the inspector. Ctrl + R (Premiere’s speed dialog) is the browser’s reload and is left alone.
- **Q11** _(resolved)_ Agent tools (MCP) for speed? _Answer (accepted 2026-10-18):_ not in 207; they come with the other timeline tools in 212, like 206’s transitions.

## Changelog

- 2026-10-16 — Created: draft spec with 15 acceptance criteria and 11 open questions with proposed answers.
- 2026-10-18 — Q1–Q11: every proposed answer accepted by the maintainer (Q8: same pitch from 0.5× to 2×, with our own time-stretch in the export); Approved.
- 2026-10-18 — Plan drafted (§1–§8, D1–D5 for the maintainer).
- 2026-10-18 — Plan approved (D1–D5 as recommended, D-049): AC-10 reworded (the export jumps to key frames rather than decoding only drawn frames, D3); AC-2 refuses a speed that would make a clip shorter than 0.1 s.
- 2026-10-18 — Tasks written (T010–T092).
- 2026-10-18 — D2 amended (T043, D-050): a ramp keeps its curve over a fixed source span (`rampSpan`) instead of being cut; trims and splits move in and out along it. `cutRamp` dropped.
- 2026-10-18 — Plan §4 amended (T044, D-051): a freeze frame holds the clip's keyframed values at the cut instead of replaying its keys scaled to its length.
