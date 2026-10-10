<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 204 — Decoder pool with look-ahead (P2.4) · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-09, D1–D5 as recommended) <!-- Draft | Approved -->

## Approach

What the code is today (read for this plan, at `e851ba1`, with 202 merged):

- **Preview** (`components/studio/VideoWorkspace.tsx`, `useClipVideos` + `VideoStage`): one `<video>` element per
  video clip, created on first use and kept for the whole session (memory grows with the clip count, US-3). Playback
  advances the playhead with the wall clock in `requestAnimationFrame`; `sync()` plays the clip under the playhead
  (re-seeking when it drifts > 0.3 s) and pauses the others; `draw()` hands the playing `<video>` to `renderFrame`.
  The next clip starts cold at its cut (US-1). Paused, it seeks when off by > 0.02 s, so the frame can differ from the
  export's (US-2). The clip's sound comes from the same `<video>`.
- **Export** (`engine/videoExport.ts`): walks `framePlan`; per video clip it opens a Mediabunny `Input` and a
  `CanvasSink` (resized to ≤ 1.8 × the frame's long side, pool of 2) and iterates `canvasesAtTimestamps` over that
  clip's frame times, then disposes the input. One clip at a time, no look-ahead.
- Mediabunny 1.61 (already shipped, MPL-2.0) also has `VideoSampleSink`: `getSample(t)` (random access),
  `samples(from, to)` (in order, pre-decoding a few ahead) and `samplesAtTimestamps(ts)`; each `VideoSample` wraps a
  WebCodecs `VideoFrame` that must be `close()`d, and `toCanvasImageSource()` gives something `renderFrame` can draw.

**§1 The pool, pure (`src/engine/decodePool.ts`, new).** A `DecodePool` keeps **lanes**: one per clip that needs
pictures (two clips from the same file get two lanes, AC-1), each with a frame source opened on the clip's file, the
frames decoded ahead (≤ 4, Q3) and the frame last handed out (held until a newer one replaces it). The pool knows
nothing of Mediabunny: it gets a `FrameSourceFactory` (§2), so Vitest drives it with a fake source. It offers:
`frame(clip, srcTime)` (async, exact: the export and paused previews), `peek(clip, srcTime)` (sync, never waits:
playback draws whatever is ready and holds the last frame otherwise, counting a **hold**, AC-6), `prepare(clip)`
(look-ahead: open the lane and decode its first frame), `want(clipIds)` (the lanes the caller still needs; the rest may
close), `forget(clipId)`, `dispose()`, and `stats()` (open decoders, held frames, their bytes, holds). Limits come
from `PoolLimits` (decoders = the visible-video limit + 2, frames ahead 4, a byte budget: Q3); over budget the least
recently used lane not wanted is closed first. Seeks are **latest wins**: each `frame()` on a lane carries a
generation, and a result that a newer request superseded is closed, not returned (AC-7). Which lanes a time needs is
one pure function, `lanePlan(project, t, playing, ahead)`: the clips visible at `t` on every picture track, plus each
track's next clip starting within 2 s of playback (Q10), so 203 reuses it for many tracks.

**§2 Frames from Mediabunny (`src/engine/frameSource.ts`, new).** `mediabunnySource(file)` opens an `Input` (shared
per file, reference-counted) and a `VideoSampleSink` per lane. In-order reading uses `samples(from)` (Mediabunny
pre-decodes a few ahead; the iterator's `return()` closes its decoder); a jump backwards or more than 2 s forwards
restarts it at the new time (`getSample` for a single exact frame). Every `VideoSample` passes through one registry
(`trackFrame` / `releaseFrame`) that counts open frames, bytes (display width × height × 4, the spec's measure, D2)
and decoders, so `openFrames()` can be read by any self-test at any moment (AC-11, reused by 203 and 206). A
source that fails to open (no video track, `canDecode()` false) or to decode rejects with an `ExportError`-style
reason naming the file.

**§3 Preview on the pool (`VideoWorkspace.tsx`).** `VideoStage` owns one pool (created with the editor, disposed on
leaving it, AC-12). Drawing asks `peek()` for the clip at `t` (playing) or awaits `frame()` and redraws (paused).
Paused or scrubbing, the time is put on the project's frame grid exactly as the export does (`frameTime(t, fps)`,
`floor(t · fps + 1e-6) / fps`, D3), so a paused preview shows the export's frame (AC-4). Each playback tick calls
`want(lanePlan(...))` and `prepare()` for the next clip within 2 s; paused within 2 s before a cut prepares it too.
When clips change, lanes of removed clips are forgotten and lanes whose trim moved are kept (same file). Idle (paused,
nothing changing) the pool decodes nothing and holds one frame per visible clip (AC-13). Photos are drawn as today.

**§4 Preview sound.** The pictures no longer come from `<video>`; each clip's sound plays from an `<audio>` element
on the clip's file (audio only: no video decoding), created for the clip under the playhead and the next one within
2 s, released after (D1, so elements no longer grow with the clip count). The next clip's element is loaded and
seeked to its `in` ahead of its cut and started on the cut's tick. Sync (Q5, AC-8): each tick compares the element's
time with the playhead; a drift over 1 frame nudges `playbackRate` by up to ±3 % until within 10 ms, over 0.25 s it
seeks. The music keeps today's element. A self-test measures the offset (D4).

**§5 Export on the pool (`videoExport.ts`).** The per-clip `CanvasSink` block becomes a lane of an export pool: the
clip's frame times are read in order (`samplesAtTimestamps`, as today), each frame is released as soon as the next
replaces it and the last one is held only for "a source shorter than its trim". While a clip is encoded, the next
video clip in `framePlan` is prepared (look-ahead one clip, Q10), so opening it overlaps the current clip (AC-10). The
pool is disposed in `finally`: after a cancel or an error no frame or decoder is left (AC-11). If decoding full-size
frames makes the export slower than 202 (the spike, T001), the export lanes ask the source for frames resized like
today's `CanvasSink` (`width` ≤ 1.8 × long side). **Decided by T001:** full size was 3 % (1080p sources) and 6.5 % (4K) slower, so export lanes read resized canvases through the pool's source; the preview reads `VideoSample` frames.

**§6 Limits from measurements (AC-15).** A self-test timing (`poolTiming`) plays 300 steps of 1, 2, 3, 4 and 6
simultaneous 1080p30 clips (and 2 and 3 4K30 clips on the desktop app) through the pool as the preview would, with
the median and 95th percentile time for every video's frame and the frames held. Q2's rule turns the numbers into
`videosAtOnce` in `limitsFor()` (web ≤ 3, desktop ≤ 6, never < 2), recorded in this plan and `docs/PERFORMANCE.md`
before 203's plan is approved. 204 only sets the numbers; 203 enforces them.

**§7 Errors and older browsers (Q6, Q7, AC-14).** A clip whose source fails gets a lane in **fallback**: the preview
draws it from today's `<video>` path (kept for exactly this), the clip shows a note "This clip can't be exported here:
<reason>" (text in the clip's accessible name and the inspector), the export refuses it with today's message, and the
error goes to `logError('handled', e)`. Without `VideoDecoder` (Firefox < 130, Safari < 26) the pool isn't created:
the preview and the export work as today and the visible-video limit is 1.

The development machine for every measurement: Intel Core Ultra 9 285K, 128 GB, NVIDIA GeForce RTX 5080, Windows 11;
the self-test runs in Electron (Chromium) with WebGPU.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/decodePool.ts` | new | §1 pool, lanes, `lanePlan`, `frameTime`, `poolLimits`, holds, latest-wins, LRU |
| `src/engine/decodePool.test.ts` | new | AC-6, AC-7 (logic), AC-12 (bounds), AC-14 (fallback) with a fake source |
| `src/engine/frameSource.ts` | new | §2 Mediabunny `VideoSampleSink` source, shared inputs, frame registry `openFrames()` |
| `src/engine/videoExport.ts` | modify | §5 lanes from an export pool, look-ahead one clip, dispose in `finally` |
| `src/engine/video.ts` | modify | `videosAtOnce` in `VLimits` / `limitsFor()` (§6) |
| `src/components/studio/VideoWorkspace.tsx` | modify | §3 stage draws from the pool (peek / exact frame), look-ahead, release; §4 audio elements and drift correction; §7 fallback path and note |
| `src/components/studio/Timeline.tsx` | modify | §7 the fallback note in the clip's name and title |
| `src/dev/videoChecks.ts` | modify | `makeTestClip` size and key-frame interval; AC-9 export checks on the pool |
| `src/dev/poolChecks.ts` | new | AC-1–AC-5, AC-7, AC-8, AC-10–AC-15 self-test checks and `poolTiming` |
| `src/dev/selftest.ts` | modify | runs `poolChecks` |
| `e2e/editors.e2e.ts` | modify | AC-14: without `VideoDecoder` the editor previews as today |
| `specs/lld.md`, `docs/PERFORMANCE.md`, `docs/MEDIA-STUDIO.md`, `CHANGELOG.md` | modify | AC-16 (and AC-15's numbers) |

## Data Structures & Interfaces

```ts
// src/engine/decodePool.ts (pure: no Mediabunny, no DOM beyond the frame type)
export interface PoolFrame { image: CanvasImageSource; width: number; height: number; time: number; duration: number; close(): void }
export interface FrameSource {
  /** Frames in order from the one showing at t: a restartable reader (no `at()`: T001 found Mediabunny's getSample opens a decoder per call). */
  from(t: number): AsyncIterator<PoolFrame>;
  close(): void;
}
export type FrameSourceFactory = (file: Blob, opts: { maxWidth?: number }) => Promise<FrameSource>;
export interface PoolLimits { decoders: number; ahead: number; bytes: number }
export interface PoolStats { decoders: number; frames: number; bytes: number; holds: number }
export interface PoolClip { id: string; file: Blob; in: number; out: number; start: number; track: string }

export class DecodePool {
  constructor(open: FrameSourceFactory, limits: PoolLimits, source?: { maxWidth?: number }); // maxWidth: export lanes (D5)
  frame(clip: PoolClip, srcTime: number): Promise<PoolFrame | null>;     // exact; latest wins per lane
  peek(clip: PoolClip, srcTime: number): PoolFrame | null;                // never waits; holds the last frame
  prepare(clip: PoolClip): void;                                          // look-ahead: first frame ready
  want(ids: Iterable<string>): void;                                      // the rest may close (LRU, budgets)
  forget(id: string): void;
  fallback(id: string): string | null;                                    // why a clip can't use the pool
  stats(): PoolStats;
  dispose(): void;
}
/** The clips a time needs: visible on every picture track, and each track's next clip within `ahead` seconds. */
export function lanePlan<C extends TimedClip>(p: Project<C>, t: number, ahead: number): { visible: C[]; next: C[] };
/** A time on the project's frame grid, as the export encodes it (D3). */
export const frameTime = (t: number, fps: number) => Math.floor(t * fps + 1e-6) / fps;
export function poolLimits(videosAtOnce: number, desktop: boolean): PoolLimits; // Q3

// src/engine/frameSource.ts (Mediabunny)
export const mediabunnySource: FrameSourceFactory;
export function openFrames(): { decoders: number; frames: number; bytes: number }; // every pool, for self-tests

// src/engine/video.ts
export interface VLimits { /* … */ videosAtOnce: number }   // AC-15, set from the measurements (Q2)
```

## Techniques

- **Frame ownership in one place.** Only `frameSource.ts` creates frames and only the pool closes them; every frame
  goes through `trackFrame` / `releaseFrame`, so a leak shows as a non-zero count in a self-test, not as a slow tab.
- **Never await in the draw loop.** Playback draws `peek()` (what's ready, else the held frame) and lets lanes decode
  in the background; paused and export use the exact `frame()`.
- **Latest wins** for seeks: generation counters per lane; superseded results are closed on arrival.
- **Restartable in-order readers**: a reader continues while time moves forward by < 2 s, else restarts at the new
  time (Mediabunny seeks to the key frame before it).
- **Look-ahead from one pure plan** (`lanePlan`), shared by the preview and the export and by 203's many tracks.
- **Bounded by numbers, not by clip count**: decoders = visible-video limit + 2, 4 frames ahead per lane, a byte
  budget (256 MB web, 1 GB desktop), LRU close of unwanted lanes.
- **Audio-only elements** for preview sound, with `playbackRate` drift correction instead of hard seeks.
- Fixtures made in memory (`makeTestClip` gains a size and a key-frame interval: 2 s, Q9), no video file in the repo.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `poolChecks`: 3 overlapping clips (two from one file), 30 times incl. first / last frames; colours ±8 of the source time | self-test |
| AC-2 | `poolChecks`: last 15 frames of clip A and first 15 of clip B at the same moments, 30 pairs exact | self-test |
| AC-3 | `poolChecks`: 50 random times across 3 clips (backwards, forwards, across key frames) exact | self-test |
| AC-4 | `poolChecks`: 6-clip projects at 9:16 and 16:9, 20 times: paused preview frame (the stage's own path) = the export's frame (decoded) ±8 | self-test |
| AC-5 | `poolTiming`: 20 × 2 s 1080p clips played in real time, 3 runs: each of 19 cuts draws the new clip's first frame on the cut's frame; manual run in Chrome | self-test timing + manual |
| AC-6 | `decodePool.test.ts`: a slow fake source → `peek` holds the last frame (never null, never another clip's), holds counted; self-test counts holds in AC-5's runs | unit + self-test |
| AC-7 | `decodePool.test.ts`: latest wins (superseded frames closed); `poolTiming`: 50 random seeks on 1080p with 2 s key frames, median ≤ 100 ms, p95 ≤ 250 ms | unit + self-test timing |
| AC-8 | self-test: generated sync clip (flash + beep every 2 s), the `<audio>` element's stream into an analyser vs the drawn flash frame, 30 s, ≤ 67 ms; manual check in Chrome and the desktop app | self-test + manual |
| AC-9 | the existing video self-test (200 pixel-identical frames, hidden, muted, gap) and the 201 / 202 fixtures' exports decoded ±8 at 10 times each; existing video e2e unchanged | self-test + e2e |
| AC-10 | `videoTiming` (201's fixture) within 5 % of 202's fastest of 3 measured in the same session (A/B against `main`, as 202 T041 learned); 30 × 4 s 1080p clips no slower than before | self-test timing |
| AC-11 | `poolChecks`: 2-minute 1080p export (24 clips from 3 files, hidden span, gap): `openFrames()` all 0 after it, after 3 in a row, after a cancel at 50 %, after a failing clip at 1 minute | self-test |
| AC-12 | `decodePool.test.ts`: decoders / frames / bytes never over `PoolLimits` under random wants, release on `forget` / `dispose`; `poolChecks`: 60-clip 1080p project played twice + 100 scrubs, sampled every step; leaving the editor and removing a clip release within 1 s | unit + self-test |
| AC-13 | `poolChecks`: paused 2 s, no decode happens, held frames ≤ visible clips | self-test |
| AC-14 | `decodePool.test.ts`: a failing source → fallback with its reason, others unaffected; `poolChecks`: export refusal message names the file, error logged; e2e: `VideoDecoder` removed by an init script → preview draws and the editor works as today | unit + self-test + e2e |
| AC-15 | `poolTiming`: 1/2/3/4/6 × 1080p30 (and 2/3 × 4K30 desktop), 300 steps, median / p95 / frames; limits by Q2's rule recorded here and in `docs/PERFORMANCE.md`; manual Chrome run | self-test timing + manual |
| AC-16 | docs reviewed at verification | manual |

## Risks & Mitigations

- **`VideoFrame` leaks** (a frame not closed keeps GPU memory until garbage collection, then the decoder stalls). → One registry for every frame (§2), counts read by AC-11 / AC-12 self-tests after exports, cancels and errors.
- **Mediabunny's readers under many lanes** (decoder count per iterator, behaviour of `return()`, random access cost with 2 s key frames). → Spike T001 before building on it: 6 concurrent 1080p lanes, in-order and random reads, counts, memory and timings.
- **Export speed** (full-size `VideoFrame`s drawn instead of `CanvasSink`'s downscaled canvases). → T001 times both on 201's fixture; D5's fallback keeps today's size.
- **Hardware decoder limits** (Chromium may cap concurrent hardware decoders and fall back to software). → AC-15 measures what really happens; the limits come from the numbers (Q2), never guessed.
- **Preview sound sync with audio-only elements** (start latency at a cut, drift). → Pre-seeked element per next clip, `playbackRate` correction, AC-8 measured automatically (D4) and by hand.
- **Rewriting the preview path breaks today's behaviour** (play, scrub, hide, mute, lock, gaps). → The existing video e2e and self-test run after every UI task; the old `<video>` path stays for fallback.
- **Self-test time** (1080p and 4K fixtures encoded in memory). → Fixtures made once per run and shared; the run is timed against Q9's +90 s budget, 720p sources if over (with the maintainer's agreement).
- **Timing noise on the development machine** (202 T041: absolute numbers drifted within one day). → AC-10 compares against `main` back to back in the same session; AC-15 records medians and 95th percentiles over 300 steps.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Spec approved (Q1–Q10, D-027) |
| II. Test-gated delivery | ✅ | Pool logic test-first with a fake source; self-test checks per AC; existing video e2e after each UI task |
| III. Small dependencies | ✅ | None new: Mediabunny's `VideoSampleSink` (already shipped) |
| IV. Memory maintained | ✅ | D1–D5 to `decisions.md` once accepted; gotchas to `learnings.md` |
| V. Free and open source | ✅ | Same pool on web and desktop; lower limits on the web for memory only |
| VI. On device, no backend | ✅ | Decoding on the device; no network |
| VII. Permissive licences | ✅ | Nothing new |
| VIII. WYSIWYG, one code path | ✅ | Preview and export decode through the same pool; paused preview = export frame (AC-4) |
| IX. Secure desktop shell | ✅ | No IPC or Electron change |
| X. Budgets and accessibility | ✅ | Entry chunk unchanged (pool loads with the editor / export); memory bounds AC-11–13; the note is screen-reader text |
| XI. Agents use the same code | ⚠️ | No tools (Q8); the agent's export tool gets the pool through `encodeVideo` |

## Decisions for the maintainer (accepted 2026-10-09: D1–D5 as recommended)

- **D1** — Preview sound from audio-only `<audio>` elements for the clip under the playhead and the next one, instead
  of a `<video>` per clip kept all session. Bounds memory (AC-12) and leaves picture decoding to the pool.
  Alternative: keep a muted-picture `<video>` per clip for sound (simpler, but memory grows with clips). Recommended.
- **D2** — Frame bytes counted as display width × height × 4 (the spec's Q3 measure), though decoders often hold
  NV12 (1.5 bytes a pixel): the budget is conservative. Recommended.
- **D3** — A paused preview shows the frame on the project's frame grid (`floor(t · fps)`), the one the export encodes,
  even when the playhead sits between two frames; the time shown stays the playhead's. Recommended.
- **D4** — AC-8 is measured automatically in the self-test (the `<audio>` element's `captureStream()` into an analyser
  against the frame drawn) and confirmed by hand in Chrome, rather than by hand only. It measures the pipelines, not
  the speakers' latency (the same for both). Recommended.
- **D5** — The export decodes through the pool at full size first; if T001's spike shows it slower than `CanvasSink`'s
  downscaled frames, export lanes ask for frames resized as today (`maxWidth`). Recommended.
