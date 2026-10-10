<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 204 — Decoder pool with look-ahead (P2.4) · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task; 👤 = needs a person. Each task lists files and the proving test.
Test-first: each "failing" task must fail before its paired implementation makes it pass.
When a task is done, record a **Result (YYYY-MM-DD):** note with `npm run specs -- done`: what was done, numbers measured,
anything surprising or deferred.

## Setup

- [x] **T001** — Spike (plan, Risks; D5): Mediabunny `VideoSampleSink` under load. 6 concurrent 1080p lanes read in order (`samples`) and at random times (`getSample`) with key frames every 2 s: how many `VideoDecoder`s each opens, whether an iterator's `return()` closes its decoder, frames and memory held, time per frame; and 201's 60-clip export decoded full size through `VideoSampleSink` against today's `CanvasSink`. Throwaway code in the self-test, not committed. · files: `scratch only` · test: the numbers recorded here; D5 decided (full size, or resized as today)
  - **Result (2026-10-09):** throwaway spike in Electron (dev machine), fixtures 3 × 10 s 1080p with a key frame every 2 s (flat colour plus a moving bar: cheap to decode, so real footage will cost more; T002's fixtures add texture for AC-15). (1) `VideoSampleSink.samples()` opens exactly one `VideoDecoder` per reader and its `return()` closes it (live decoders back to 0 every time). (2) In-order lanes, 150 steps: 1 lane 0.4 ms median / 1.2 ms p95, 2: 0.9 / 2.6, 3: 1.2 / 1.8, 4: 1.7 / 4.1, 6: 2.4 / 4.6 ms. (3) `getSample` creates and closes a decoder per call: 50 random seeks 17.5 ms median, 28.9 ms p95 (AC-7's bar is 100 / 250 ms). (4) Export into 1080p, fastest of 3: 1080p sources CanvasSink 4.37 s vs full-size VideoSampleSink 4.51 s (+3 %); 4K sources 1.68 s vs 1.79 s (+6.5 %). **D5 decided: export lanes read resized canvases as today (`CanvasSink`, ≤ 1.8 × the long side) through the pool's source; the preview uses `VideoSample` frames.** No decoder left open at the end (144 made).
- [x] **T002** [P] — Fixtures: `makeTestClip(dur, W, H, keyEvery)` (size and a key frame every 2 s, Q9; today's defaults unchanged) and `makeSyncClip()` (a white flash and a beep on the same frame every 2 s, AC-8), made in memory. · files: `src/dev/videoChecks.ts` · test: `npm test`: the existing clip check, plus a 1080p clip with 2 s key frames decoding to its colours
  - **Result (2026-10-10):** `src/dev/videoChecks.ts`: `makeTestClip(dur, W, H, keyEvery = 1, texture = false)` (today's calls unchanged); `texture` draws shifting grey noise everywhere but the middle third (flat `clipColour`, still measured exactly), at 0.1 bit a pixel, so decoding costs like footage (T001's flat clips were too cheap). `makeSyncClip(dur = 30)`: black frames with a white frame and a 50 ms 1 kHz beep every 2 s (H.264 + AAC). Two new checks: a textured 4 s 1080p clip with 2 s key frames decodes to its colours at 0, 1.9, 2 and 3.95 s (3.2 MB, made in 0.95 s); the 4 s sync clip has sound and white frames at 0 and 2 s, black between (0.35 s). `npm test` 6,127 / 0 failed; `npm run check` passed.

## Tests first: the pool

- [x] **T010** — Failing tests (`src/engine/decodePool.test.ts`, new, a fake `FrameSource` with controllable delays and failures): `lanePlan` (visible clips at `t` on every picture track, the next clip within 2 s, gaps, a hidden track, Q10), `frameTime` (the export's grid, D3), `poolLimits` (Q3: decoders = limit + 2, 4 ahead, 256 MB / 1 GB); `frame()` exact; latest wins (a superseded result is closed, never returned); `peek` never waits, holds the last frame (never null after a first frame, never another clip's) and counts holds; random `want` / `prepare` / `peek` sequences never exceed decoders, frames or bytes; `forget` and `dispose` close everything; a source that fails puts its clip in fallback with the reason and leaves the others working. · files: `src/engine/decodePool.test.ts` · test: fails (module missing)
  - 2026-10-10: 27 failing tests in src/engine/decodePool.test.ts on a fake FrameSource (module missing)
- [x] **T011** — Implement `src/engine/decodePool.ts` (§1: lanes, `frame` / `peek` / `prepare` / `want` / `forget` / `fallback` / `stats` / `dispose`, LRU, generations, `lanePlan`, `frameTime`, `poolLimits`) until T010 passes. Break-test: let `peek` return null while a frame is pending, see the hold test fail, restore. · files: `src/engine/decodePool.ts` · test: T010
  - 2026-10-10: src/engine/decodePool.ts; 31 unit tests pass, npm run check green; break-test (peek returns null while pending) fails the 2 hold tests, restored
- [ ] **T012** — Failing self-test checks (`src/dev/poolChecks.ts`, new, run from `selftest.ts`) on the real decoder: AC-1 (3 overlapping clips, two from the same file, 30 times incl. each clip's first and last frame), AC-2 (the last 15 frames of one clip and the first 15 of the next at the same moments), AC-3 (50 random times, backwards and forwards across key frames); colours within ±8 of the source time; `openFrames()` back to 0 after `dispose`. · files: `src/dev/poolChecks.ts`, `src/dev/selftest.ts` · test: `npm test`: fails (no Mediabunny source yet)
- [ ] **T013** — Implement `src/engine/frameSource.ts` (§2: `mediabunnySource`, inputs shared per file, restartable in-order readers, the frame registry and `openFrames()`) until T012 passes. Break-test: skip `releaseFrame` on a superseded frame, see the count check fail, restore. · files: `src/engine/frameSource.ts` · test: T012; `npm run check`

## Export on the pool

- [ ] **T020** — Failing self-test checks for the export: AC-9 (201's fixtures and 202's gap fixture exported, decoded at 10 times each, equal ±8 to colours recorded from today's export before the change; frame and sound plans unchanged) and AC-11 (a 2-minute 1080p 16:9 export, 24 clips of 5 s from 3 files, a hidden span and a gap: frames went through the pool and `openFrames()` is 0 after it, after 3 in a row, after a cancel at 50 % and after an unreadable clip at 1 minute). · files: `src/dev/poolChecks.ts` · test: `npm test`: the AC-11 checks fail (the export doesn't use the pool yet); AC-9 passes on today's code
- [ ] **T021** — Export on the pool (§5): lanes from an export pool, frames released as soon as replaced, the last held only for a short source, the next video clip prepared during the current one, `dispose` in `finally`; full size or resized per T001 (D5). Today's refusal messages kept. · files: `src/engine/videoExport.ts` · test: T020; the existing video self-test; `npx playwright test e2e/editors.e2e.ts`
- [ ] **T022** — Export timing (AC-10): 201's 60-clip fixture within 5 % of `main`'s fastest of 3, timed back to back in one session (as 202 T041); a 30 × 4 s 1080p video-clip project no slower than `main`. Record the numbers. · files: `src/dev/poolChecks.ts` · test: `npm test` timing lines, A/B against `main`

## Preview on the pool

- [ ] **T030** — Failing self-test check AC-4: the stage's drawing as a function (`drawPreview`, exported from the workspace) on 6-clip projects at 9:16 and 16:9, paused at 20 times: the clip's frame equals the export's frame for that time (decoded, ±8). · files: `src/dev/poolChecks.ts` · test: `npm test`: fails (the preview still seeks a `<video>`)
- [ ] **T031** — Preview on the pool (§3): `VideoStage` owns a pool (disposed on leaving the editor); paused or scrubbing draws `frame()` at `frameTime` and redraws when it lands (latest wins); playing draws `peek()` and counts holds; every tick `want(lanePlan)` and `prepare` the next clip within 2 s (also paused within 2 s of a cut); removed clips forgotten; idle decodes nothing. The `<video>` path stays only for fallback clips (T041). · files: `src/components/studio/VideoWorkspace.tsx` · test: T030; video e2e and track-header e2e unchanged
- [ ] **T032** — Self-test checks on the preview path, then fixes until they pass: AC-5 (20 × 2 s 1080p video clips played in real time, 3 runs: all 19 cuts draw the new clip's first frame on the cut's frame; no black, no hold over 1 frame; holds reported), AC-7 (50 random seeks on 1080p with 2 s key frames: exact frame, median ≤ 100 ms, p95 ≤ 250 ms; the last asked is the one shown), AC-12 (60-clip 1080p project played twice and scrubbed 100 times, sampled every step: within Q3; leaving the editor and removing a clip release within 1 s), AC-13 (paused 2 s: no decode, frames ≤ visible clips). · files: `src/dev/poolChecks.ts`, `src/components/studio/VideoWorkspace.tsx` · test: `npm test`
- [ ] **T033** — Failing self-test check AC-8 (D4): the sync clip played 30 s in the editor; the clip's `<audio>` element's `captureStream()` into an analyser gives each beep's onset, the stage gives each flash's drawn frame; every pair within 67 ms. · files: `src/dev/poolChecks.ts` · test: `npm test`: fails (sound still comes from per-clip `<video>`)
- [ ] **T034** — Preview sound (§4, D1): an audio-only `<audio>` element for the clip under the playhead and the next within 2 s (pre-seeked to its `in`, started on the cut's tick), released after; drift over 1 frame corrected by `playbackRate` ±3 %, over 0.25 s by a seek; volume, mute and a hidden track's sound as today. · files: `src/components/studio/VideoWorkspace.tsx` · test: T033; video e2e (the mute test records sounds started)

## Errors and older browsers

- [ ] **T040** — Failing checks for errors: self-test with a source factory that fails one clip: the preview draws it from the `<video>` fallback and the others from the pool, its note says it can't be exported, the export refuses it naming the file, `logError` got it; e2e (`e2e/editors.e2e.ts`): with `VideoDecoder` removed by an init script, the video editor adds clips, plays, scrubs and draws as today, without console errors. · files: `src/dev/poolChecks.ts`, `e2e/editors.e2e.ts` · test: fails (no fallback note; the editor needs the pool)
- [ ] **T041** — Fallback (§7): clips the pool can't open use today's `<video>` path in the preview with the note "This clip can't be exported here: <reason>" (clip title, accessible name, inspector), logged with `logError('handled', e)`; no `VideoDecoder` = no pool, today's preview and export, a visible-video limit of 1. · files: `src/components/studio/VideoWorkspace.tsx`, `src/components/studio/Timeline.tsx` · test: T040; `npx playwright test e2e/editors.e2e.ts`

## Limits from measurements

- [ ] **T050** — `poolTiming` (AC-15): 1, 2, 3, 4 and 6 simultaneous 1080p30 clips (and 2 and 3 4K30 clips in the desktop app), 300 steps of 30 fps each as the preview draws them: median and p95 time to have every video's frame, frames held. Record the numbers here. · files: `src/dev/poolChecks.ts` · test: `npm test` timing lines
- [ ] **T051** — Limits from T050 by Q2's rule (largest count meeting median ≤ 33 ms and p95 ≤ 50 ms, minus one; web ≤ 3, desktop ≤ 6, never < 2): `videosAtOnce` in `limitsFor()` with a unit test; the numbers in the plan (§6) and `docs/PERFORMANCE.md`. If the web can't reach 2, stop: 203's plan is reconsidered (Q2). · files: `src/engine/video.ts`, `src/engine/layers.test.ts`, `docs/PERFORMANCE.md`, `specs/features/204-decoder-pool/feature.json` · test: `npm run check`

## Manual checks

- [ ] **T060** 👤 — Manual checks in Chrome (`npm run dev`) and the desktop app: a 20-clip 1080p project plays through its cuts without a freeze or black (AC-5); the sync clip's flash and beep look and sound together (AC-8); `poolTiming` run in Chrome for the web numbers (AC-15). · files: `none` · test: the maintainer's results recorded here

## Verify

- [ ] **T090** — Docs (AC-16): `specs/lld.md` (the pool, lanes, look-ahead, frame release, `openFrames()`), `docs/PERFORMANCE.md` (AC-15 numbers, limits, the pool's memory rules), `docs/MEDIA-STUDIO.md` (limits and the fallback note, if users see them), `CHANGELOG.md` Unreleased. · files: `specs/lld.md`, `docs/PERFORMANCE.md`, `docs/MEDIA-STUDIO.md`, `CHANGELOG.md` · test: relative links resolve
- [ ] **T091** — Every Definition-of-Done gate green (`check`, `build`, `test:e2e`, `test`, `test:mcp`, `check:licenses`); entry chunk unchanged; the self-test's added time within Q9's 90 s; record the numbers. · test: all gates
- [ ] **T092** — Tick ACs (Status `Implemented`), roadmap 204 ✔️, `editor-implementation.md` P2.4 Done, `memory/progress.md`, `memory/MEMORY.md` (next: 203's plan with the limits).

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T012, T013 |
| AC-2 | T012, T013 |
| AC-3 | T012, T013 |
| AC-4 | T030, T031 |
| AC-5 | T032, T060 |
| AC-6 | T010, T011, T031, T032 |
| AC-7 | T010, T011, T032 |
| AC-8 | T033, T034, T060 |
| AC-9 | T020, T021 |
| AC-10 | T022 |
| AC-11 | T012, T013, T020, T021 |
| AC-12 | T010, T011, T031, T032 |
| AC-13 | T031, T032 |
| AC-14 | T010, T011, T040, T041 |
| AC-15 | T050, T051, T060 |
| AC-16 | T090 |
