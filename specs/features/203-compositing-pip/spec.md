<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 203 — Compositing many tracks, picture-in-picture (P2.3)

**Status:** Draft
**Roadmap phase:** 2 — Multi-track timeline · **Created:** 2026-10-08 · **Owner:** RVicky172

## Summary

Since `201` a video project is made of tracks, but it still has exactly one video track: a single picture at any
moment, with text and stickers on top. Creators of Reels, Shorts and YouTube videos routinely need a second picture
over the first: B-roll cut over someone talking (the sound of the main clip continues), a face-cam in a corner of a
screen recording, a product shot beside a review, a logo clip over the intro. This feature lets the user add
**overlay tracks** above the main video track, put video and photo clips on them at any time, and place each overlay
clip in the frame with a **position, size, rotation and opacity** (picture-in-picture), or leave it covering the
whole frame (B-roll). Every frame draws every visible clip at that time, bottom track first, and the preview and the
exported MP4 match. Projects with no overlay clips look, sound and export exactly as they do after `201` and `202`.
It needs the decoder pool (`204`) to decode several videos at the same moment.

## User Stories

- **US-1:** As a vlogger, I want to cut B-roll over my talking clip while my voice keeps playing, so that the video isn't one long shot of my face.
- **US-2:** As a creator of tutorials and reactions, I want a small clip (my face, a product) in a corner of the main clip, so that viewers see both at once.
- **US-3:** As a video creator, I want to move, resize, rotate and fade an overlay clip directly on the preview and with exact numbers, so that I can place it where I want.
- **US-4:** As a keyboard or screen reader user, I want to add tracks and place overlay clips without a mouse, so that I can do everything anyone else can.
- **US-5:** As a creator with an older 2.x or `201` / `202` project, I want it to play and export exactly as before, so that the update costs me nothing.
- **US-6:** As a contributor building `205`–`212`, I want one tested model of tracks drawn in order with a transform per clip, so that keyframes (`205`), transitions (`206`) and agent tools (`212`) animate and reach the same properties.

## Acceptance Criteria

### Tracks

- [ ] **AC-1:** The user can add an **overlay** track (Q12), rename it, move it up or down among the overlay tracks and delete it (with its clips, after a confirmation if it holds any). The main video track is always the bottom picture track (Q10). Video and overlay tracks together are limited to 4 on the web and 8 on the desktop app (the limits of `201` Q4); at the limit **Add track** is disabled and says why. Each of these is one undo step. _(unit + e2e)_
- [ ] **AC-2:** An overlay track's header has **Hide** (picture not drawn in the preview or the export), **Mute** (its clips' sound silent in the preview and the export, Q7), **Lock** (as in `201` AC-10, including on the preview: a locked overlay clip can't be moved, resized or selected for editing there) and the height menu. _(e2e)_

### Overlay clips

- [ ] **AC-3:** Video and photo files can be added to an overlay track at the playhead (button, and by dropping files onto the track; dropping onto the empty area above the top track creates a new overlay track, Q12). Clips can be dragged in time on their track and between picture tracks (main ↔ overlay), with the clip keeping its start time unless snapping moves it. `202`'s operations (trim, ripple trim and delete, roll, slip, slide, split, duplicate, snapping) work on overlay tracks, which are never magnetic (Q8): clips there never overlap and gaps are allowed. _(unit + e2e)_
- [ ] **AC-4:** Each clip on a picture track has a **transform**: position (the clip's centre as a share of the frame, from −0.5 to 1.5 on each axis so a clip can sit partly outside), size (its width as a share of the frame width, 0.05 to 4), rotation (−180° to 180°) and opacity (0–100 %), with Q2's corner radius. The clip keeps its own aspect ratio inside its box. A new overlay clip starts full frame (B-roll) (Q4); the inspector offers **Full frame** and the four **corner** presets (35 % of the frame width, 4 % margin). Main-track clips start and stay at the identity transform unless the user changes it. _(unit)_
- [ ] **AC-5:** On the preview, a selected overlay clip shows a box with handles: drag to move, corner handles to resize keeping the aspect ratio, a rotate handle; moves snap to the frame's centre lines and edges within 8 px (off with the Snap switch or Alt, as `202` Q4). The inspector has number fields for X, Y, size, rotation, opacity and corner radius. With an overlay clip selected and the preview focused, arrow keys move it by 1 % of the frame (10 % with Shift). A drag is one undo step however long; each change is announced to screen readers (the clip and its new values). _(e2e)_

### Compositing

- [ ] **AC-6:** At every frame time `t`, the frame is: the main video track's clip at `t` (black in a gap or past its end), then each visible overlay track's clip at `t` from the lowest track to the highest, each with its transform and opacity, then the timed layers on top of all tracks (Q1). Gaps on an overlay track draw nothing (the tracks below show through). Golden frames: a fixture with the main track and 2 overlay tracks (a full-frame B-roll video, a corner face-cam video with 50 % opacity, a rotated photo with rounded corners, a clip partly outside the frame), at 9:16 and 16:9, at 8 sample times including each clip's first and last frame, matches its reference within the self-test's tolerance on every GPU backend, and the export renders the same frames from the same inputs. _(self-test)_
- [ ] **AC-7:** Timing is frame-exact: an overlay clip starting at 2.0 s at 30 fps appears first in frame 60 and is gone in the frame after its last; hidden tracks and clips at 0 % opacity draw nothing; a full-frame opaque overlay clip covers the frame completely (no pixel of the main clip shows). _(unit + self-test)_
- [ ] **AC-8:** Sound: each overlay video clip's own sound plays at its clip volume, mixed with the main track's clips and the music, in the preview and the export; a muted overlay track adds nothing. The export's sound sources (start, end, source time, volume, ramps) for a fixture with overlays equal the expected list exactly. _(unit + self-test)_
- [ ] **AC-9:** The video's length is the end of the last clip on any picture track (Q9); the per-platform length and clip limits (`limitsFor()`) apply to the whole project, counting clips on every track (Q6), and refusals use the existing messages. At most Q6's number of video clips are visible at the same moment; an edit that would exceed it is refused with a message that says the limit and why. _(unit + e2e)_

### Nothing changes for existing projects

- [ ] **AC-10:** Projects with no overlay clips (`201`'s fixtures: photo-only, video-only, mixed, music with offset, timed layers, fade-out, at 9:16, 4:5, 1:1 and 16:9; and `202`'s with gaps) give pixel-identical preview frames at 10 sample times each and identical export inputs (frames, clips, times and sound sources) to `202`. All existing video e2e tests pass unchanged. _(unit + self-test + e2e)_
- [ ] **AC-11:** The project document reads every existing document unchanged (Q11): the new fields are optional and their defaults are the identity transform and no overlay clips. The validator clamps out-of-range transform values, drops clips on a missing track with a reason, moves a clip that overlaps another on an overlay track to the end of the one it overlaps (as `202` D3, never dropping it), enforces the track and clip limits, and never throws: at least 30 new malformed documents. Round trips document → validator → document are equal for the AC-6 fixture. _(unit)_

### Performance and memory

- [ ] **AC-12:** Preview: with the main track and 2 overlay tracks each playing a 1080p 30 fps video at the same moment (a 1080 × 1920 Reel and a 1920 × 1080 YouTube project), the median preview frame time over 300 frames is ≤ 33 ms in the desktop app and, with main + 1 overlay, ≤ 33 ms in Chrome on the development machine (Q13). A project without overlays stays within 5 % of `202` (fastest of 3 runs, as `201` AC-5). _(self-test timing)_
- [ ] **AC-13:** Exporting a 2-minute 1080p fixture with main + 2 overlay video tracks completes on desktop and web and leaves no open `VideoFrame` (the check `204` adds), and its export time is recorded in the plan's measurements. _(self-test)_

### For everyone

- [ ] **AC-14:** Adding, renaming, reordering, hiding, muting, locking and deleting tracks, adding overlay clips and setting every transform value work from the keyboard alone with labelled controls; axe reports no serious or critical issue on the timeline and the inspector; at 360 px wide everything works with no sideways scroll; the preview handles respect `prefers-reduced-motion` (no animated outlines). _(e2e + axe)_

### Docs

- [ ] **AC-15:** `docs/MEDIA-STUDIO.md` (overlay tracks, picture-in-picture, presets, keys, limits), `specs/lld.md` (the drawing order, the transform, the document fields) and `CHANGELOG.md` describe the change; the in-app docs list the keys. _(manual check)_

## Non-Functional Requirements

- Performance: AC-12, AC-13; drawing a frame with no overlay clip costs no more than in `202`.
- Memory: at most Q6's number of videos decoded at once; frames are released as soon as they are drawn (`204`).
  Photos on overlay tracks follow today's per-photo memory budget (docs/PERFORMANCE.md).
- Accessibility: AC-14 (WCAG 2.2 AA in light and dark themes, keyboard, screen reader, 360 px).
- Compatibility: web and desktop alike, with fewer tracks on the web (AC-1, Q6) for memory reasons only
  (Constitution V); Firefox and Safari get the same result through the existing Canvas 2D / WebGL2 paths.
- What you see is what you get: one drawing path for preview and export (Constitution VIII); no export-only
  compositing.
- Security: project data only enters through the validator (AC-11).
- Licences: no new library, model or asset.

## Out of Scope

- Keyframed (animated) position, size, rotation and opacity (`205`); transitions between clips (`206`); speed
  (`207`); audio-only tracks beyond the music (`208`).
- Blend modes on clips (photo layers have them; Q5), crop of overlay clips, borders and shadows (Q2), chroma key and
  background removal for overlays.
- Clips connected to a main-track clip so they move with it in a ripple (Final Cut's connected clips; Q8).
- Moving the timed layers (text, stickers, drawings) onto tracks (Q1).
- Compound clips and groups (`210`); proxies (`211`).
- Agent tools for tracks and overlay clips (`212`; Q14).
- Saving and opening video projects as files (`201` Q1).

## Open Questions

- **Q1** [NEEDS CLARIFICATION] `201` Q2 and `202` Q6 left to 203 whether the timed layers (text, shapes, stickers, drawings, images) move onto overlay tracks. _Proposed:_ not in 203. Layers keep their own start / end and are drawn above every track, as today; ripples don't move them. Putting layers in the track stack (a title under a PiP clip) is reconsidered with compound clips and groups (`210`).
- **Q2** [NEEDS CLARIFICATION] Which properties does a clip's transform have? _Proposed:_ position, uniform size, rotation, opacity and a **corner radius** (0–50 % of the box's shorter side), the common picture-in-picture look. No crop, border, shadow or non-uniform stretch in 203; the clip keeps its aspect ratio. Today's per-clip framing (fill / whole picture with blurred background, zoom, position inside the frame) keeps working inside the box.
- **Q3** [NEEDS CLARIFICATION] Can main-track clips be transformed too (e.g. shrink the main clip over a coloured or black background)? _Proposed:_ yes, the same transform on every picture track (one model, and `205` animates it the same way); main-track clips default to full frame, and the area they leave uncovered is black.
- **Q4** [NEEDS CLARIFICATION] Where does a new overlay clip appear? _Proposed:_ full frame (B-roll, the most common use), with **Full frame** and four corner presets in the inspector (35 % of the frame width, 4 % margin from the edges, on the safe side of the platform's UI for Reels / Shorts).
- **Q5** [NEEDS CLARIFICATION] Blend modes on overlay clips (screen, multiply … as photo layers have)? _Proposed:_ not in 203: normal only. They are cheap to add later on the same drawing path and can come with a Phase 3 item.
- **Q6** [NEEDS CLARIFICATION] Limits. _Proposed:_ the per-platform clip limits (20 / 50 / 60 / 500) count clips on every track; at most **3** video clips visible at the same moment on the web and **6** on the desktop app (photos don't count), the final numbers set from `204`'s measurements before 203's plan is approved.
- **Q7** [NEEDS CLARIFICATION] Sound of overlay clips. _Proposed:_ an overlay video clip's own sound plays at its clip volume (B-roll often has ambient sound the user can lower); overlay tracks get both **Hide** and **Mute** in their header (`201`'s Hide on the main track hides pictures only, D2, and stays so).
- **Q8** [NEEDS CLARIFICATION] How do overlay tracks behave with Magnetic and ripples? _Proposed:_ overlay tracks are never magnetic (free placement, gaps allowed, no overlaps); a ripple on the main track moves only main-track clips, as in `202` Q6. Connected clips that follow the main track can come later.
- **Q9** [NEEDS CLARIFICATION] What sets the video's length when an overlay clip ends after the main track? _Proposed:_ the last clip end on any picture track; after the main track ends, its area is black under the overlays. The music and layers keep their own times.
- **Q10** [NEEDS CLARIFICATION] Track order. _Proposed:_ the main video track stays the bottom picture track and can't be moved or deleted; overlay tracks are listed above it in drawing order and moved with up / down buttons in their header (keyboard-friendly, like `201` Q5's height menu), each an undo step.
- **Q11** [NEEDS CLARIFICATION] Project document version. _Proposed:_ stays **1**: overlay tracks already exist in the v1 model (`201` AC-1) and the transform is a new optional field with identity defaults, as `202` added Magnetic (`202` Q1). Bump to 2 only if the plan finds a change an old reader would misread.
- **Q12** [NEEDS CLARIFICATION] How is a track added? _Proposed:_ an **Add track** button under the track headers (adds an empty overlay track at the top), and dropping files on the empty area above the top track creates one with the files placed at the drop time. New tracks are named "Overlay 1", "Overlay 2" …
- **Q13** [NEEDS CLARIFICATION] Performance target. The Phase 2 gate is a 4K timeline with 3 video and 2 audio tracks playing smoothly on desktop, which also depends on proxies (`211`). _Proposed:_ 203 proves 1080p (AC-12); the 4K gate is measured at the end of Phase 2, after `211`.
- **Q14** [NEEDS CLARIFICATION] Constitution XI (agent tools). _Proposed:_ as in `201` Q7 and `202` Q7, no tools in 203; tracks, overlay clips and transforms are plain operations on the project so `212` (which needs 203) exposes them. The gap stays recorded.

## Changelog

- 2026-10-08 — Created (Draft).
