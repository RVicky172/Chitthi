# 201 — Track model and migration (P2.1) · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

## Setup: baseline and reference, against the unchanged code

- [x] **T001** — Spike: in the self-test, make a 2 s 320 × 240 video clip from a canvas with Mediabunny
      (`CanvasSource`, in memory) and load it as a `VClip`-like fixture; decide whether the pixel checks can use video
      clips (plan, Risks). · files: `src/dev/selftest.ts` (scratch section, kept if it works) · test: the clip decodes
      to frames in Electron, or the fallback (photo-only pixel fixtures) is recorded
  - **Result (2026-10-06):** works. New dev-only module `src/dev/videoChecks.ts` (called at the end of the self-test's
    `run()`): `makeTestClip()` encodes a 2 s 320 × 240 H.264 MP4 at 30 fps in memory with Mediabunny (each frame one
    flat colour whose red rises and blue falls with time, so a decoded frame tells its time); `decodedColours()`
    decodes frames the way the export does (`CanvasSink.canvasesAtTimestamps`). In Electron: 18 KB made in 817 ms,
    colours at 0, 0.5, 1, 1.5, 1.95 s within ±8 levels. 2 new checks (6,117 passed, 0 failed). **Video clips can be
    used in the pixel fixtures**; no fallback needed.
- [x] **T002** — Self-test "video" section, timing only (AC-5 baseline): a 60-clip 1080p fixture (photos, 0.5 s each,
      plus video clips if T001 allows); preview frame time at 60 times (median) and export to memory (seconds), median
      of 3. Run on the **unchanged** code; record the numbers here. · files: `src/dev/selftest.ts` · test: `npm test`
      prints the timing line
  - **Result (2026-10-06):** `videoTiming()` in `src/dev/videoChecks.ts`: 60 clips (0.4 s generated 1600 × 1067 JPEG
    photos with zoom-in, every tenth a 0.4 s cut of T001's test clip, some fades), 24 s at 1920 × 1080, GPU opened as
    the app does (WebGPU here). Preview = the editor's path (`clipAt(timeline())` then `renderFrame`, read back) at
    300 times per run (60 at first: too few); export = `encodeVideo` to memory. 3 runs each. **Baseline on the
    unchanged 2.x code, 5 self-test sessions** (Core Ultra 9 285K, NVIDIA Blackwell):

    | Session | Preview runs (ms) | Export runs (s) |
    | --- | --- | --- |
    | 1 (60 samples) | 10.9, 10.3, 10.3 | 2.76, 2.84, 2.79 |
    | 2 (60 samples) | 11.4, 12.7, 11.9 | 2.90, 2.76, 2.76 |
    | 3 | 10.4, 11.8, 15.1 | 2.77, 2.75, 2.80 |
    | 4 | 10.1, 12.4, 14.9 | 2.76, 2.69, 2.79 |
    | 5 | 10.9, 14.9, 14.9 | 2.80, 2.64, 2.64 |

    **Surprise:** later runs in one session are often slower (10 → 15 ms), so a median of 3 swings ~45% between
    sessions; the fastest run is steady (10.1–11.4 ms; export 2.64–2.76 s). The check now prints median and fastest.
    **T041's bar:** fastest run ≤ the slowest baseline session's fastest + 5%: preview ≤ 12.0 ms, export ≤ 2.90 s
    (spec AC-5 says "median of 3": needs the maintainer's OK, see report). The video clips' preview source here is a
    blank 320 × 240 canvas (the app draws from a `<video>` element): the timing is dominated by `renderFrame`, which
    201 doesn't change. Self-test 6,117 passed, 0 failed (~100 s, +15 s for the export runs).
- [x] **T003** [P] — Frozen reference: copy the 2.x `timeline`, `clipAt`, `totalLength`, the export loop's frame list
      (per clip `[f0, f1)`, local times) and `openAudio`'s source list into `src/engine/timeline.reference.ts` (test-only,
      a header saying never edit). Fixture builders for every 2.x shape (empty; photo-only; video-only; mixed; music +
      offset; timed layers; fade-out; 20 / 60 / 500 clips; edge lengths 0.1 s and limit-long). · files:
      `src/engine/timeline.reference.ts`, `src/engine/timeline.fixtures.ts` · test: a sanity test that the reference
      equals today's `engine/video.ts` functions on every fixture (passes now)
  - **Result (2026-10-06):** one file instead of two, `src/engine/timeline.testkit.ts` (reference + fixtures; new
    suffix `*.testkit.ts` excluded from the library build in `tsconfig.lib.json`, like `*.test.ts`). Reference:
    `legacyClipLength`, `legacyTimeline`, `legacyTotal`, `legacyClipAt`, `legacyFrameRange`, `legacyFramePlan` (the
    export loop's per-clip `[f0, last)` with `frames = max(1, round(total × fps))`) and `legacyAudioPlan` (clip sound
    with 0.03 s ramps, music 0 → total from `max(0, offset)` with a `min(1.5, total / 3)` fade-out), header "never
    edit", frozen at `a283e6a`. 12 fixtures: empty, photoOnly, videoOnly, mixed, musicOffset, musicSilent (volume 0),
    timedLayers, noFadeOut, tinyClips (0.05 / 0.0999 s: the 0.1 s minimum), clips20 / 60 / 500 (0.37 s and ⅓ s
    lengths to stress float sums). `timeline.testkit.test.ts`: 14 tests, the reference equals today's
    `timeline` / `clipAt` (every boundary ± 1 µs, 200 times, < 0 and past the end) / `totalLength` / `clipLength` /
    `frameRange` on every fixture. Break-test: minimum 0.1 → 0.11 failed 2 fixtures, restored. The two plan functions
    copy `videoExport.ts`'s loops by reading (they need the DOM there, so no automatic comparison). `npm run check`
    757 tests, build 327 KB; new files Prettier-clean.

## Tests first: the model

- [x] **T010** — Failing tests for §1 (`src/engine/timeline.test.ts`): `pack` gives the reference starts to 1 ms;
      `projectLength`; `videoAt` equals `legacyClipAt` (clip and local time) at every boundary ± 1 µs and 1,000 seeded
      random times incl. < 0 and past the end; `framePlan` equals the reference frame list at 30 and 60 fps; `audioPlan`
      equals the reference sources; hidden `V1` → `videoAt` null and frames with no clip; muted `A1` → no music source;
      `TRACK_LIMITS`. · files: `src/engine/timeline.test.ts` · test: fails (module missing)
- [x] **T011** — Implement §1 in `src/engine/timeline.ts` until T010 passes. Break-test: change `pack`'s rounding, see
      the equivalence fail, restore. · files: `src/engine/timeline.ts` · test: T010 (AC-1, AC-2 partly, AC-3 unit, AC-9
      unit)
  - **Result T010 + T011 (2026-10-06):** `timeline.test.ts` written first (failed: module missing), then
    `src/engine/timeline.ts`: `Track`, `TrackKind`, `MAIN_VIDEO` / `MUSIC`, `defaultTracks()`, `TRACK_LIMITS`,
    `TimedClip`, `AudioClip` (music: `in` = offset, `toEnd`, `srcDur`), `Project`, `pack`, `projectLength`,
    `videoAt`, `framePlan`, `audioPlan` (`SoundSource`). **54 tests pass**: for all 12 fixtures, starts
    **bit-identical** to 2.x (`toEqual`, no tolerance), length, the clip and local time at every boundary ± 1 µs and
    1,000 seeded times, the export frames at 30 and 60 fps, the sound sources; plus hidden `V1` (no clip, one black
    span, same length, clip sound kept: D2), muted `A1` (music left out), locked (no change), `pack` keeps other
    tracks, limits. **Spec change found here (approved):** Q6's 1 ms grid broke AC-3 / AC-7; break-test = rounding
    `pack`'s starts to 1 ms → **15 of 54 fail**, restored → 54 pass. `npm run check`: 21 files, 811 tests.

## Tests first: document and validators

- [x] **T012** [P] — Failing tests for `mergeLayers` (`src/engine/layers.test.ts`): every kind round-trips; wrong
      types, NaN, huge sizes, unknown kinds, bad colours, too many strokes / points, non-`data:image/` image sources,
      masks through `mergeMasks`; `start` / `end` clamped and ordered. · files: `src/engine/layers.test.ts` · test: fails
- [x] **T013** — Implement `mergeLayers()` in `src/engine/layers.ts` (D3) until T012 passes. · files:
      `src/engine/layers.ts` · test: T012
  - **Result T012 + T013 (2026-10-06):** 8 tests written first (failed: not a function). `mergeLayers(raw, images)` +
    `LAYER_LIMITS` (100 layers, 2,000 characters, 400 strokes, 8,000 points, as mask strokes) in
    `src/engine/layers.ts`; `mergePart` exported from `masks.ts` and reused for layer masks, which keep only linear and
    radial parts (what the layer panel makes). Every kind round-trips through JSON exactly; non-arrays, `null`,
    nested arrays and unknown kinds → dropped; numbers clamped; colours `#rrggbb` (or `''` where "none" is allowed);
    unknown shapes / brushes → defaults; `start` / `end` kept only when finite, ≥ 0 and ordered; strokes with NaN or
    odd point counts dropped; ids unique and safe. **Plan correction:** image layers don't carry image data, they
    name a picture held in memory (`addLayerImage`), so the gate keeps an image layer only when `images` (the
    project's media ids) has it, not "only `data:image/` sources" as the plan said. Break-test: removing the
    `images.has` check failed "image layers need a picture the project has", restored. One test bug fixed
    (`toMatchObject({ start: undefined })` needs the key present). `layers.test.ts` 25 tests; `npm run check` 819.
- [x] **T014** — Failing tests for §2: `fromSequence` (AC-2: back-to-back starts, the music clip with offset, volume,
      `toEnd`, an empty `A1` without music, layers unchanged); `toDocument` → JSON → `mergeProject` round trips for
      every fixture (AC-7); v1 → clip times equal the reference placement; ≥ 30 malformed documents (AC-6: `null`,
      strings, arrays, NaN / Infinity, negative and huge times, `in ≥ out`, `out > srcDur`, unknown track, missing
      media, duplicate ids, 600 clips, 20 tracks, bad `edit`, bad layers, unknown version) → valid project, reasons in
      `dropped`, never throws. · files: `src/engine/timeline.test.ts` · test: fails
- [x] **T015** — Implement §2 (`toDocument`, `fromSequence`, `mergeProject`) until T014 passes. · files:
      `src/engine/timeline.ts` · test: T014 (AC-6, AC-7)
  - **Result T014 + T015 (2026-10-06):** 61 tests written first (60 failed: functions missing). In
    `src/engine/timeline.ts`: `DocMedia` (id, kind photo / video / audio / image, name, type, size, pixel size,
    source length: described, never embedded), `DocClip`, `DocAudio`, `ProjectDoc` (a `Project` plus version 1,
    kind, format, fps, quality, media), `fromSequence` (2.x clips back to back on `V1`, the song as `music` on `A1`
    with `in` = offset and `toEnd`, every other field kept), `toDocument` (only a project's own fields) and
    `mergeProject(raw, desktop)` → `{ doc, dropped }`: no version → 2.x shape upgraded through `fromSequence`;
    version ≠ 1 → empty project, "newer version"; settings checked against `formatsFor` / `limitsFor` (desktop-only
    formats refused on the web); media, tracks (`V1` video and `A1` audio always present with those kinds; 8 + 8 /
    4 + 4), clips (track must be a picture track, media of the same kind, photo `dur` finite ≥ 0, video
    `0 ≤ in < out ≤ srcDur` with `out` clamped to the source, else dropped; `edit` via `mergeEdit`; motion, fade,
    volume), sound clips, layers via `mergeLayers` with the media's image ids; duplicate ids renamed; `pack` last;
    one `try` around all. Tests: for all 12 fixtures the 2.x document → v1 → JSON → gate is unchanged, nothing
    dropped, starts and frames and sound equal the frozen 2.x; `toDocument` keeps no blobs / URLs / thumbnails /
    unknown fields; **34 malformed documents** each give a valid project (own-rule checks + a second pass changes
    nothing) and never throw; reasons say why. Break-tests: no "nothing left to play" rule → "in ≥ out" failed;
    `toDocument` copying whole clips → the key test failed; both restored. `npm run check` 880 tests; entry 327 KB.

## Core: store and export

- [ ] **T020** — Store (§3): `tracks`, clips with `track` / `start`, music on `A1`, `pack` in `change()`, `total()`
      from `projectLength`, undo snapshots with `tracks`; no UI change yet (positions equal by construction). · files:
      `src/state/video.ts` · test: `npm run check`; the three video e2e tests pass unchanged
- [ ] **T021** — Track actions and lock guards (§3): `setTrack` (hidden / muted / locked, undoable),
      `setTrackHeight` (`trackView`, not undoable, PURE), every clip action and `addMedia` / music changes refuse on a
      locked track with a reason. Unit-test the pure guard helper. · files: `src/state/video.ts`,
      `src/engine/timeline.ts` (+ test) · test: unit + `npm run check`
- [ ] **T022** — Export (§4): `videoExport.ts` frame loop over `framePlan`, hidden frames with `src = null`, sound via
      `audioPlan`; `exportVideo` builds the job from the project. · files: `src/engine/videoExport.ts`,
      `src/state/video.ts` · test: T010's plan tests; `npm run test:e2e` (Reel and YouTube exports)
- [ ] **T023** — Remove the old placement callers: `timeline()` / `clipAt()` / `totalLength()` uses in the
      components and `videoExport.ts` move to `timeline.ts`; `engine/video.ts` keeps formats, motion, `renderFrame`;
      update `layers.test.ts`'s "video timeline" tests to the new functions (the reference keeps the old ones). ·
      files: `src/engine/video.ts`, `src/components/studio/*.tsx`, `src/engine/layers.test.ts` · test: `npm run check`,
      e2e

## UI

- [ ] **T030** — Tests first: new e2e test in `e2e/editors.e2e.ts`: the Video and Music headers are groups with
      Hide / Mute, Lock and Height buttons (by role and name); keyboard only; Hide → preview black with layers; Mute →
      music muted; Lock → drag, trim, Delete, S, Ctrl+D refused with the message; undo / redo of hide, mute, lock;
      height Small / Medium / Large changes the row and survives undo; axe; Pixel 7 project. · files:
      `e2e/editors.e2e.ts` · test: fails
- [ ] **T031** — Track headers in `Timeline.tsx` (buttons, height menu with arrow keys / Home / End / Escape, icons
      from lucide-react, labels for screen readers, icons-only ≤ 600 px) and styles (three heights, lock badge, header
      controls) in `styles/36-media-studio.css`. · files: `src/components/studio/Timeline.tsx`,
      `src/styles/36-media-studio.css` · test: T030 header parts
- [ ] **T032** — Behaviour: preview via `videoAt` (hidden → black + layers), music `<audio>` muted with `A1`, clip
      sound kept when `V1` hidden (D2), locked clips not selectable / draggable, keyboard shortcuts refused with a
      toast, read-only inspector. · files: `src/components/studio/VideoWorkspace.tsx`, `Timeline.tsx` · test: T030
      passes; all e2e (AC-4, AC-8, AC-10, AC-11)

## Self-test

- [ ] **T040** — Self-test video section (§5): for the fixtures at 9:16, 4:5, 1:1, 16:9 (with layers, fade-out,
      music), 10 sample times each, the frame through the reference path and through `videoAt` on Canvas 2D:
      pixel-identical; hidden `V1` → black + layers. Break-test: shift one clip's start by a frame, see it fail,
      restore. · files: `src/dev/selftest.ts` · test: `npm test` (AC-3, AC-9)
- [ ] **T041** — Timing after the change (AC-5): T002's check on the new code, 3 runs; within 5% of T002's numbers
      (median). · test: `npm test` timing line vs T002

## Verify

- [ ] **T090** — Docs (AC-12): `docs/MEDIA-STUDIO.md` (tracks and headers, Hide vs Mute, lock, heights),
      `specs/lld.md` (module map: `timeline.ts`, `mergeLayers`; the video state), `specs/architecture.md` if a block
      changes, `CHANGELOG.md` Unreleased; `src/data/docs.ts` (in-app docs) for the headers. · test: link check
- [ ] **T091** — Every Definition-of-Done gate green (`check`, `build`, `test:e2e`, `test`, `test:mcp`,
      `check:licenses`); entry chunk unchanged (timeline code is in the studio chunk); record the numbers.
- [ ] **T092** — Tick ACs in `spec.md` (Status `Implemented`), roadmap 201 → ✔️, `editor-implementation.md` P2.1 →
      Done, `memory/progress.md`, `memory/MEMORY.md` (next: `202`).

## AC coverage

| AC    | Tasks                    |
| ----- | ------------------------ |
| AC-1  | T010, T011               |
| AC-2  | T014, T015, T010, T011   |
| AC-3  | T003, T010, T011, T040   |
| AC-4  | T020, T022, T023, T032   |
| AC-5  | T002, T041               |
| AC-6  | T012, T013, T014, T015   |
| AC-7  | T014, T015               |
| AC-8  | T030, T031, T032         |
| AC-9  | T010, T011, T022, T040   |
| AC-10 | T021, T030, T032         |
| AC-11 | T021, T030, T032         |
| AC-12 | T090                     |
