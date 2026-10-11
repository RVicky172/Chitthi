<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 203 — Compositing many tracks, picture-in-picture (P2.3) · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task; 👤 = needs a person. Each task lists files and the proving test.
Test-first: each "failing" task must fail before its paired implementation makes it pass. Batches of parallel agents (D-030) are named in the section notes; pairs go to one agent whole.
When a task is done, record a **Result (YYYY-MM-DD):** note with `npm run specs -- done`: what was done, numbers measured,
anything surprising or deferred.

## Setup

Batch 1 runs T001–T013 (the spike inline, the three test-first pairs as agents).

- [x] **T001** — Spike (plan Risks, §4): `renderIg` under a transformed, clipped context. A throwaway check draws a clip into a 35 % box rotated 20° with a 12 % corner radius at 50 % opacity, with each framing mode (fill; whole picture with the blurred background), zoom and position, a photo look and a mask, and compares it with the same picture drawn into an offscreen canvas of the box's size and placed (the fallback design), on every GPU backend the machine has, in the preview path and the export path. Records: does the blurred background respect the clip and transform; do GPU-drawn looks; time per item. Decides §4's technique (direct or offscreen). · files: `(throwaway)` · test: the spike's numbers in its result note
  - 2026-10-11: throwaway spike (src/dev/spike203.ts, not committed): renderIg drawn into a 35 % box, rotated 20°, 12 % corner radius, 50 % opacity, directly vs into an offscreen W×H canvas placed with the same transform, 1080×1920, on CPU, WebGL2 and WebGPU, for fill, whole picture + blurred background, whole picture + colour, zoom + position, look + vignette, and a radial mask: 18 / 18 drew nothing outside the box (transform and clip respected by drawBackground, the CPU layer path and gpuColour). Direct vs offscreen differ only by resampling: mean 0.02 levels (fill, zoom), 0.47 (look), 2.9 (whole picture: offscreen scales twice), max 16–81 at antialiased edges. Time: equal on GPU (fill 1.5 ms; look 5.4 ms WebGPU), direct faster on the CPU path for masks. Decision for §4: draw directly in the transformed, clipped context (one step, no extra canvas per item); the golden references (T016) are computed from colour codes with the self-test's tolerance.
- [ ] **T002** [P] — Fixtures (`src/dev/videoChecks.ts`): `makeOverlayProject(format)` for AC-6, a main track (two video clips with a cut) and two overlay tracks: a full-frame B-roll video, a corner face-cam video at 50 % opacity, a photo rotated 15° with a 10 % corner radius, and a clip partly outside the frame, at 9:16 and 16:9, with each clip's first and last frame among 8 sample times; `makeLongOverlayProject()` (2 minutes 1080p, main + 2 overlay videos, AC-13). Colour-coded frames as `makeTestClip` so a pixel names its clip and frame. · files: `src/dev/videoChecks.ts` · test: `CHITTHI_TEST_ONLY=pool npm test`: the fixtures build (a check per fixture)
  - **In progress** since 2026-10-11

## Tests first: the model

- [ ] **T010** — Failing tests (`src/engine/timeline.test.ts`): `IDENTITY`, `isIdentity`, `clampTransform` (every field's range, NaN and missing fields), `presetTransform` (full and the four corners at 9:16 and 16:9: w 0.35, 4 % margin); `addTrack` (top of the overlays, "Overlay N" with the lowest free N, refused at `TRACK_LIMITS` web 4 / desktop 8 with the button's message), `renameTrack` (1–40 characters, trimmed), `moveTrack` (only among overlays, main stays bottom), `deleteTrack` (overlay only, with its clips; main and music refused); `patchTrack` mutes overlay tracks but not the main track. · files: `src/engine/timeline.test.ts` · test: `npx vitest run src/engine/timeline.test.ts`: fails (nothing exported yet)
  - **In progress** since 2026-10-11
- [ ] **T011** — Implement §1 and §2 in `src/engine/timeline.ts`: `ClipTransform`, `IDENTITY`, `isIdentity`, `clampTransform`, `Preset`, `presetTransform`, `tf?` on `TimedClip`; `addTrack`, `renameTrack`, `moveTrack`, `deleteTrack`; `patchTrack`'s Mute for overlay tracks. · files: `src/engine/timeline.ts` · test: T010
  - **In progress** since 2026-10-11
- [ ] **T012** [P] — Failing tests (`src/engine/stack.test.ts`, new): `frameStack` bottom first; the main track's clamp only before 0 and at or past the video's end, black between the main track's end and a later overlay clip's end (Q9); an overlay clip starting at 2.0 s first in frame 60 at 30 fps and gone in the frame after its last (AC-7); hidden tracks left out; gaps leave the tracks below; for 201 / 202 fixtures (`timeline.testkit.ts`) the stack is exactly `[videoAt]` at every frame time (AC-10). `mostVideosAt` (overlaps across tracks, hidden tracks counted, photos not, touching clips not overlapping). `snapBox` (centre lines and edges within the tolerance, the nearest wins, none outside it). · files: `src/engine/stack.test.ts` · test: `npx vitest run src/engine/stack.test.ts`: fails
  - **In progress** since 2026-10-11
- [ ] **T013** — Implement §3 in `src/engine/stack.ts` (new, pure): `frameStack`, `StackItem`, `mostVideosAt` (an event sweep), `snapBox` (uses `Box` from `engine/layers.ts`). The plan placed these in timeline.ts; a module of their own keeps batch 1's agents apart (changelog). · files: `src/engine/stack.ts` · test: T012
  - **In progress** since 2026-10-11

## Drawing, document and sound

Batch 2: T014/T015, T016/T017 and T018/T019 touch different files.

- [ ] **T014** — Failing tests (`src/engine/edits.test.ts`): `moveToTrack` (main → overlay at the nearest free spot, overlay → main with Magnetic on inserted at its time and packed, with Magnetic off as `moveTo`; locked source or target refused; never overlapping); every 202 operation (trim, ripple trim and delete, roll, slip, slide, split, duplicate, snapping targets) on an overlay track, never packed (Q8); an edit whose result has more videos at once than `maxVideos` (and more than before) refused with `tooManyVideos`' message naming the limit; one that doesn't raise the count allowed. · files: `src/engine/edits.test.ts` · test: `npx vitest run src/engine/edits.test.ts`: fails
- [ ] **T015** — Implement §8 in `src/engine/edits.ts`: `maxVideos` in `EditCtx`, the limit check after each edit (`mostVideosAt`), `tooManyVideos(n, desktop)`, `moveToTrack`. · files: `src/engine/edits.ts` · test: T014; `npx vitest run src/engine`
- [ ] **T016** [P] — Failing self-test checks (`src/dev/videoChecks.ts`): AC-6 golden frames, `renderStack` of the T002 fixture at 9:16 and 16:9 at its 8 times against per-pixel references computed from the colour codes (each clip's box, rotation, opacity and corners) within the self-test's tolerance, on every GPU backend; AC-7 a full-frame opaque overlay leaves no main-clip pixel, 0 % opacity and hidden draw nothing; AC-10 `renderStack` with one identity item equals `renderFrame` pixel for pixel on 201's fixtures at 10 times; D2 an overlay's fade-in ramps its opacity, the main clip's darkens the frame. · files: `src/dev/videoChecks.ts` · test: `npm test`: fails (no renderStack)
- [ ] **T017** — Implement §4 in `src/engine/video.ts`: `renderStack` (identity fast path through today's call; the transform, rounded clip and opacity as T001 decided; D2's fades), `renderFrame` as `renderStack` with one item. · files: `src/engine/video.ts` · test: T016
- [ ] **T018** [P] — Failing tests (`src/engine/timeline.test.ts`, the document gate): at least 30 malformed documents (transform fields out of range, of the wrong type, missing; overlay tracks beyond the limit; clips on a missing track with a reason; overlapping clips on an overlay track moved to the end of the one they overlap, never dropped; too many clips across tracks) and none throws; the AC-6 fixture round-trips document → gate → document equal; 201 / 202 documents round-trip byte-identical (no `transform` written at identity). · files: `src/engine/timeline.test.ts` · test: `npx vitest run src/engine/timeline.test.ts`: fails
- [ ] **T019** — Implement §12 in `src/engine/timeline.ts`: `DocClip.transform`, `toDocument` (written only when not identity), `mergeProject` (clamp, overlay tracks kept, the overlap rule on every picture track). · files: `src/engine/timeline.ts` · test: T018

## Store and timeline rows

Batch 3: T020/T021, T040 and T050.

- [ ] **T020** — Failing tests (`src/engine/timeline.test.ts`, `src/components/studio/previewSound.test.ts`): `audioPlan` with overlays equals the expected list exactly (start, end, from, volume, ramps), a muted overlay track adds nothing, a hidden one keeps its sound; 201 / 202 fixtures' sound sources unchanged (testkit); `soundPlan` returns every clip sounding at `t` (main + unmuted overlays), and `previewSound` keeps one element per current clip within D1's bound. · files: `src/engine/timeline.test.ts`, `src/components/studio/previewSound.test.ts` · test: vitest: fails
- [ ] **T021** — Implement §7 in the engine and the sound module: `audioPlan` (overlay clips), `soundPlan` (`current` as a list), `previewSound.update` for several current clips (the stage's call site moves in T034). · files: `src/engine/timeline.ts`, `src/components/studio/previewSound.ts` · test: T020
- [ ] **T040** [P] — Store actions (§9, `src/state/video.ts`): `addTrack`, `renameTrack`, `moveTrack`, `deleteTrack`, `setTrack` (Mute for overlays), `addMedia(files, { track, at })` (at the playhead or drop time, after the clips there if it doesn't fit; a track added first when dropped above the top track), `moveClipToTrack`, `setClipTransform` (key coalescing: one undo step per drag), `applyPreset`; `editCtx()` passes `maxVideos` from `limitsFor`. Each one undo step, returning the message to show. Unit tests for the pure parts already exist (T010–T019); here `src/state/video.test.ts` drives each action without DOM (one undo step, the messages, the limit). · files: `src/state/video.ts`, `src/state/video.test.ts` · test: `npx vitest run src/state/video.test.ts`; `npm run check`
- [ ] **T050** [P] — Behaviour-neutral refactor (§10, plan Risks): the main row's clip blocks, trims, tools and drags move into a `PictureRow` component in `Timeline.tsx` used for the main track only; nothing a user sees changes. · files: `src/components/studio/Timeline.tsx` · test: `npx playwright test e2e/editors.e2e.ts` unchanged (desktop + phone)

## Preview and export

Batch 4: T030/T031 and T032/T033; then T034 (it shares VideoWorkspace.tsx with T031) and T035.

- [ ] **T030** — Failing self-test checks (`src/dev/poolChecks.ts`): the stage draws stacks, `drawPreview` of the T002 fixture at its 8 times (paused, through `pausedFrame` and the pool) equals `renderStack` from the same pictures; all of a paused stack's pictures resolve together (latest wins per lane); the held picture is per clip (an overlay arriving doesn't blank the main clip); 201 fixtures' paused frames unchanged (AC-10); the real editor (StrictMode) shows an overlay clip. · files: `src/dev/poolChecks.ts` · test: `CHITTHI_TEST_ONLY=pool npm test`: fails
- [ ] **T031** — Implement §5: `StageFrame.items`, `pausedAt` / `pausedFrame` on `frameStack`, `drawPreview` through `renderStack`, the stage pool at `poolLimits(limitsFor().videosAtOnce)`; `VideoStage` peeks every visible video while playing and keeps a held picture per clip. · files: `src/components/studio/previewFrame.ts`, `src/components/studio/VideoWorkspace.tsx` · test: T030; video e2e unchanged
- [ ] **T032** [P] — Failing self-test checks (`src/dev/videoChecks.ts`): the export of the T002 fixture renders the same frames as the preview from the same inputs (AC-6); for 201 / 202 fixtures the export's (frame, clip, source time) list equals `framePlan`'s and its sound sources are unchanged (AC-10); AC-13: the 2-minute main + 2 overlays export finishes with `openFrames()` 0 after it, its time and peak bytes recorded. · files: `src/dev/videoChecks.ts` · test: `npm test`: fails (the export draws one clip)
- [ ] **T033** — Implement §6 in `src/engine/videoExport.ts`: frames 0…N through `frameStack`, every visible video's frame awaited together from a pool at `videosAtOnce`, photos decoded once per clip and released after, `want` / `prepare` from `lanePlan`, `forget` once passed, a short source's last frame held per clip; overlay sound via `audioPlan`. · files: `src/engine/videoExport.ts` · test: T032
- [ ] **T034** — The stage's sound for several clips (§7): `VideoStage`'s `sync` passes the list from `soundPlan` to `previewSound`; a muted overlay track is silent, a hidden one heard; AC-8 export sound sources for the fixture checked in the self-test. · files: `src/components/studio/VideoWorkspace.tsx`, `src/dev/videoChecks.ts` · test: `npm test`; video e2e (the mute test)
- [ ] **T035** — AC-12 timing (§13, `src/dev/playbackChecks.ts`, `CHITTHI_TEST_ONLY=pooltiming`): main + 2 overlay 1080p30 videos playing at once in a Reel and a YouTube project, 300 frames, median and p95 frame time (≤ 33 ms median on desktop); a project without overlays within 5 % of `main` (fastest of 3, run back to back). If the bar fails, lower the limit by Q2's rule and record it in the spec. · files: `src/dev/playbackChecks.ts` · test: `CHITTHI_TEST_ONLY=pooltiming npm test`: the numbers recorded here

## Tracks and the stage

Batch 5: T051/T052 and T053/T054 (new e2e files each).

- [ ] **T051** — Failing e2e (`e2e/tracks.e2e.ts`, new): add, rename, move up / down and delete (confirmation when it has clips) an overlay track, each one undo step; the limit disables Add track with the reason; the overlay header's Hide (not drawn), Mute (silent: the mute test's sound log), Lock (timeline and stage edits refused) and height; add files at the playhead and by dropping on a row and above the top row; drag a clip between rows and with "Move to track…"; an edit over the videos-at-once limit refused with its message; keyboard only; axe on the timeline; 360 px with no sideways scroll. · files: `e2e/tracks.e2e.ts` · test: `npx playwright test e2e/tracks.e2e.ts`: fails
- [ ] **T052** — Implement §10 in `Timeline.tsx`: a `PictureRow` per picture track (top track first), the overlay `TrackHead` (rename field, ↑ / ↓, Delete, Hide, Mute, Lock, height), Add track under the headers, drops on rows and above the top row, drags between rows, the clip menu's "Move to track…"; styles in `36-media-studio.css`. · files: `src/components/studio/Timeline.tsx`, `src/styles/36-media-studio.css` · test: T051; `e2e/editors.e2e.ts` unchanged
- [ ] **T053** [P] — Failing e2e (`e2e/overlays.e2e.ts`, new): a selected overlay clip's box on the stage: drag moves, a corner resizes keeping the aspect, the handle rotates; snapping to centre lines and edges within 8 px, off with the Snap switch and with Alt; the inspector's presets and number fields (X, Y, size, rotation, opacity, corner radius); arrows 1 % and Shift 10 % with the stage focused; a drag is one undo step; the announcement text; a locked track shows no box and disabled fields; axe on the inspector; reduced motion (no animated outline). · files: `e2e/overlays.e2e.ts` · test: `npx playwright test e2e/overlays.e2e.ts`: fails
- [ ] **T054** — Implement §11: `src/components/studio/useClipTransform.ts` (pointer and keys on the clip box with the layers' geometry; layers hit first), the stage's box drawing, and the inspector's **Position and size** group in `ClipPanel`; announcements in 202's live region. · files: `src/components/studio/useClipTransform.ts`, `src/components/studio/VideoWorkspace.tsx`, `src/styles/36-media-studio.css` · test: T053; `e2e/editors.e2e.ts` unchanged

## Manual checks

- [ ] **T060** 👤 — Manual checks in Chrome (`npm run dev`) and the desktop app: B-roll over a talking clip and a corner face-cam play smoothly and export as previewed; the Chrome AC-12 figure (main + 1 overlay, `?selftest&only=pooltiming`); the AC-13 export in Chrome (web). · files: `none` · test: the maintainer's results recorded here

## Verify

- [ ] **T090** — Docs (AC-15): `docs/MEDIA-STUDIO.md` (overlay tracks, picture-in-picture, presets, keys, limits; the videos-at-once row now in use), `specs/lld.md` (frameStack, renderStack, the transform, the document fields), `docs/PERFORMANCE.md` (decoders = limit + 2 in use; AC-12 / AC-13 numbers), `CHANGELOG.md` Unreleased, the in-app docs' keys. · files: `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `docs/PERFORMANCE.md`, `CHANGELOG.md`, `src/data/docs.ts` · test: relative links resolve
- [ ] **T091** — Every Definition-of-Done gate green (`check`, `build`, `test:e2e`, `test`, `test:mcp`, `check:licenses`); entry chunk unchanged; record the numbers. · test: all gates
- [ ] **T092** — Tick ACs (Status `Implemented`), roadmap 203 ✔️, `editor-implementation.md` P2.3 Done, `memory/progress.md`, `memory/MEMORY.md`.

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T010, T011, T040, T051, T052 |
| AC-2 | T010, T011, T051, T052 |
| AC-3 | T014, T015, T040, T051, T052 |
| AC-4 | T010, T011, T040 |
| AC-5 | T012, T013, T053, T054 |
| AC-6 | T016, T017, T030, T031, T032, T033 |
| AC-7 | T012, T013, T016, T017 |
| AC-8 | T020, T021, T033, T034 |
| AC-9 | T012, T013, T014, T015, T040, T051 |
| AC-10 | T012, T016, T017, T020, T050, T030, T031, T032 |
| AC-11 | T018, T019 |
| AC-12 | T035, T060 |
| AC-13 | T032, T033, T060 |
| AC-14 | T051, T052, T053, T054 |
| AC-15 | T090 |
