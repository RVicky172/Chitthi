<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 207 — Speed: constant, reverse, freeze, ramps · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-18, D1–D5 as recommended, D-049) <!-- Draft | Approved -->

## Approach

Speed is data on a video clip, and **one function** turns a clip's time into a source time: `sourceAt(clip, local)` in a new `engine/speed.ts`. Today `clip.in + local` is written out in nine places (the export's frames and trace, the preview's frames, the stage's peek and fallback video, the preview sound, the sound plan, the pool's prime, the lanes' handles); each becomes a call to `sourceAt`, and `clipLength` learns the speed, so every rule that already asks `clipLength` / `frameStack` / `audioPlan` (packing, Magnetic, gaps, the export's frames, transitions' room, the videos-at-once limit) follows without change (Constitution VIII, AC-10). Under D-033 every task is proven by unit tests; e2e, golden frames, timing and listening checks go to 290.

**§1 The time mapping (new `engine/speed.ts`, AC-1, AC-3, AC-5, AC-10).** A video clip gets `speed?` (0.1–10, missing = 1, Q1), `reverse?: true`, `ramp?: RampPoint[]` (2–10 points `{ at, v }`: `at` a share 0–1 of the source part `in`–`out`, `v` a speed; a ramp replaces `speed`, and never goes with `reverse`, Q7) and `freeze?: number` (§4). Pure functions: `clipLength` (timeline.ts) becomes `(out − in) / speed` for a constant speed and the ramp's play time for a ramp; `sourceAt(clip, local)` = `in + local × s`, `out − local × s` reversed, the ramp's inverse for a ramp, the frozen time for a freeze; `localAt(clip, source)` its inverse (for trims, split and the timeline's thumbnails). Outside 0…length (transition handles, 206) it goes on at the speed of that edge and the caller clamps to the file as today. A ramp's speed over the source part is a monotone cubic through its points (curve.ts's Fritsch–Carlson spline, no overshoot, Q5); its play time T(p) = (out − in) × ∫₀ᵖ du / v(u) is tabulated once per ramp (512 steps, adaptive Simpson within each step split at the points: plain Simpson misses 1 µs on steep curves; cached on the ramp array by a WeakMap) and inverted by Newton steps on the table, so `sourceAt(clip, length)` lands on `out` within 1 µs (AC-5). Presets (Q6) are data: `RAMP_PRESETS` = Montage, Hero, Bullet, Jump cut, Flash in, Flash out.

**§2 Edits (`engine/edits.ts`, new `engine/speedEdits.ts`, AC-2, AC-7).** `setSpeed(clips, id, speed | ramp | reverse, ctx)` builds the new clip, keeps in and out (Q2), and then reuses the existing rules: on the main track with Magnetic on, `pack` moves the later clips; elsewhere `checkTrack` refuses an overlap with Q3's reason ("There is 1.2 s of room before the next clip; at 0.5× this clip needs 4 s"); the platform's length limit (`TOO_LONG`) and a new shortest length (a speed that would make the clip shorter than 0.1 s is refused, as `clipLength`'s floor would otherwise break the mapping) refuse the rest. `trim` turns the drag (timeline seconds) into source seconds with `localAt` / `sourceAt`, so a 1 s drag at 2× uses 2 s of source and a reversed clip's start edge moves its out point (AC-3); a ramped clip's edge moves along its curve, which stays over a fixed source span (`rampSpan`, D2, amended 2026-10-18). `split` gives both parts the speed and reverse, and each the same ramp and span (D2). Roll, Slip and Slide go through `trim` / in-out moves and keep each part's speed. Keyframes (Q9): `scaleKeys(keys, newLength / oldLength)` in keyframes.ts after a speed or ramp change. Transitions (206): `tidyTransitions` already clamps them to the new room; their handles come from §1's edge speed.

**§3 Rendering and decoding (`stack.ts`, `video.ts`, `decodePool.ts`, `frameSource.ts`, `videoExport.ts`, `previewFrame.ts`, `VideoStage.tsx`, AC-10).** `StackItem` gains nothing: drawers call `sourceAt(item.clip, item.local)`. The export job (`videoExportJob.ts` copies clip fields by name) carries `speed`, `reverse`, `ramp`, `freeze`. The pool: (a) a lane's window (`PoolClip`) is the source span the clip shows, from `sourceAt` at its first and last shown local times (with handles), so a reversed clip's lane covers out → in; (b) **skipping**: a reader keeps reading forward only while the wanted frame is within the current group of pictures; past the next key frame it restarts there (`FrameSource.keyAfter(time)` from Mediabunny's key packets), so a 10× export decodes from key frames rather than through the whole source (D3); (c) **reverse**: a reversed lane decodes backwards in chunks (from the key frame before the wanted time up to it), holds that chunk's frames within the pool's byte budget and hands them out newest first; the preview's reversed lanes decode at stage size (`maxWidth`) so a chunk fits (D4). A spike task proves (c) with the fake frame source first (risk 1). A freeze frame's lane decodes its one frame once and holds it.

**§4 Freeze frame (`speedEdits.ts`, `videoClips.ts`, AC-4).** A freeze frame is a video clip with `freeze` = the source time it shows and `dur` its length (2 s default, 0.1–60 s), the same file, box, framing, look and keyframes held at their values at the cut (one key each, as split gives its parts, so nothing jumps; D-051) as the clip it came from; `clipLength` uses `dur` like a photo's and it has no sound (D1). `freezeFrame(clips, id, local, ctx)` splits the clip at the playhead (none at its first or last frame) and inserts the freeze between the parts: on the main track with Magnetic on the later clips move by its length; elsewhere it is refused when it doesn't fit, with the reason. Its end is dragged like a photo's (`trim` treats it as a photo).

**§5 Sound (`soundPlan.ts`, new `engine/timeStretch.ts`, `videoExport.ts`, `previewSound.ts`, AC-6).** `SoundSource` gains `rate` (source seconds per timeline second, missing = 1). `clipSounds` leaves out a clip whose speed is outside 0.5–2, reversed, ramped or frozen (`soundMuted(clip)` gives the reason the inspector shows); the rest get `rate = speed`. The preview sets `playbackRate = speed × nudge` on the clip's element with `preservesPitch` on (the browser keeps the pitch). The export decodes `[from, from + length × rate]` and runs it through `timeStretch(samples, rate, sampleRate)`: WSOLA (waveform-similarity overlap-add, 40 ms Hann frames, 50 % overlap, ±10 ms search; our own ~150 lines, no new dependency) to the timeline length, then schedules it as one buffer per window; windows carry 50 ms of the previous one's input so cuts between 10-second windows don't click (D5). Volume, 205's volume keyframes and 206's edges stay on the gain node in timeline time, unchanged.

**§6 Store actions (new `state/videoSpeed.ts`, `state/videoClips.ts`, AC-8).** `setClipSpeed`, `setClipReverse`, `setClipRamp` (preset or points), `moveRampPoint`, `addRampPoint`, `removeRampPoint`, `resetSpeed`, `freezeFrame`: each one `change()` with a coalescing key (`speed:<id>`, `ramp:<id>:<point>`), so a slider or point drag is one undo step; refusals are toasts and announcements, as 202's edits. Turning on reverse with a ramp drops the ramp (and says so); choosing a ramp turns reverse off (Q7). A seeded property test runs 1,000 random speed, reverse, ramp, freeze, trim, split and move edits and checks the invariants after each (AC-8).

**§7 Saving (`projectGate.ts`, `projectDoc.ts`, AC-9).** `readClip` reads the four fields through `mergeSpeed(raw, dropped)`: speeds clamped to 0.1–10, ramps with fewer than 2 or more than 10 points, unordered or non-finite places dropped or mended with the reason, a ramp with reverse keeps the ramp, `freeze` clamped into the file. A clip at 1× forward without ramp or freeze writes none of the fields, so documents without speed changes stay byte-identical.

**§8 Inspector and timeline (new `components/studio/SpeedGroup.tsx`, `RampEditor.tsx`; `ClipInspector.tsx`, `PictureRow.tsx`, `timelineRows.ts`, `Transport.tsx`, `Timeline.tsx`, AC-11, AC-12).** The Speed group: Constant / Ramp; the speed as a field and slider (log scale, 0.1–10) with the presets; Reverse; the new length; Reset speed; for a ramp the six presets and `RampEditor`, an SVG curve with focusable points (drag, double-click to add, Delete to remove; ← / → along the clip, ↑ / ↓ speed, Shift for larger steps), each change announced. The badge on a clip ("2×", "0.5×", "◀ 1×", "Ramp", a still for a freeze) is a pure `speedBadge(clip)` in `timelineRows.ts`; thumbnails and the description use `sourceAt`. Freeze frame is a Transport button and Shift + F with the timeline focused (Q10). Unit tests cover the pure helpers; the UI itself is checked in 290.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/speed.ts`, `tests/unit/engine/speed.test.ts` | new | §1: the time mapping, ramps, presets, `soundMuted` |
| `src/engine/timeline.ts`, `tests/unit/engine/timeline.test.ts` | modify | §1: `SpeedFields` on `ClipTiming`, `clipLength` with speed |
| `src/engine/speedEdits.ts`, `tests/unit/engine/speedEdits.test.ts` | new | §2, §4: `setSpeed`, `freezeFrame` |
| `src/engine/edits.ts`, `src/engine/keyframes.ts`, `tests/unit/engine/edits.test.ts`, `tests/unit/engine/keyframes.test.ts` | modify | §2: trims through `sourceAt` / `localAt`, cut ramps, `scaleKeys` |
| `src/engine/stack.ts`, `src/engine/video.ts`, `src/engine/transitions.ts` | modify | §3: source times through `sourceAt`, handles at the edge speed |
| `src/engine/decodePool.ts`, `src/engine/frameSource.ts`, `tests/integration/engine/decodePool.test.ts`, `tests/support/fakeDecoder.ts` | modify | §3: lane windows, key-frame skips, reverse chunks, freeze |
| `src/engine/soundPlan.ts`, `src/engine/timeStretch.ts` (new), `tests/unit/engine/timeStretch.test.ts` (new) | new / modify | §5: `rate`, muted cases, WSOLA |
| `src/engine/videoExport.ts`, `src/state/videoExportJob.ts` | modify | §3, §5: the job carries the fields; frames and sound at speed |
| `src/engine/projectGate.ts`, `src/engine/projectDoc.ts` | modify | §7: `mergeSpeed`, saving |
| `src/state/videoSpeed.ts` (new), `src/state/videoClips.ts`, `tests/integration/state/video.test.ts` | new / modify | §6: actions, undo keys, the property test |
| `src/components/studio/previewFrame.ts`, `src/components/studio/previewSound.ts`, `src/components/studio/VideoStage.tsx` | modify | §3, §5: preview frames and sound at speed |
| `src/components/studio/SpeedGroup.tsx` (new), `src/components/studio/RampEditor.tsx` (new), `src/components/studio/ClipInspector.tsx` | new / modify | §8: the Speed group and curve editor |
| `src/components/studio/PictureRow.tsx`, `src/components/studio/timelineRows.ts`, `src/components/studio/Transport.tsx`, `src/components/studio/Timeline.tsx`, `src/styles/36-media-studio.css` | modify | §8: badges, thumbnails, Freeze frame button and Shift + F |
| `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `CHANGELOG.md`, `src/data/docs.ts` | modify | AC-15 |
| `specs/features/290-phase2-test-pass-release/feature.json` | modify | the deferred checks for AC-6 (listening), AC-11–AC-14 (D-033) |

## Data Structures & Interfaces

```ts
// engine/speed.ts
export const SPEED_LIMITS = { min: 0.1, max: 10, step: 0.01 } as const;          // Q1
export const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4] as const;
export const SOUND_SPEEDS = { min: 0.5, max: 2 } as const;                          // Q8
export interface RampPoint { at: number /* 0–1 of in–out */; v: number /* speed */ }
export type RampPreset = 'montage' | 'hero' | 'bullet' | 'jump' | 'flash-in' | 'flash-out';
export const RAMP_PRESETS: Readonly<Record<RampPreset, readonly RampPoint[]>>;
export interface SpeedFields { speed?: number; reverse?: true; ramp?: RampPoint[]; freeze?: number }
export function sourceAt(clip: ClipTiming & SpeedFields, local: number): number;   // the one mapping (AC-10)
export function localAt(clip: ClipTiming & SpeedFields, source: number): number;   // its inverse
export function playLength(clip: ClipTiming & SpeedFields): number;                // clipLength's video case
export function edgeSpeed(clip: ClipTiming & SpeedFields, edge: 'start' | 'end'): number;
// SpeedFields also has rampSpan?: readonly [number, number]: the source seconds a ramp's shares refer to (D2); missing = in–out
export function soundMuted(clip: ClipTiming & SpeedFields): string | null;        // the reason, or null

// engine/timeline.ts
interface ClipTiming extends SpeedFields { kind: 'photo' | 'video'; dur: number; in: number; out: number }

// engine/soundPlan.ts
interface SoundSource { /* … */ rate?: number }   // source seconds per timeline second

// engine/timeStretch.ts
export function timeStretch(input: Float32Array, rate: number, sampleRate: number): Float32Array; // length ≈ input / rate

// engine/decodePool.ts
interface FrameSource { from(time: number): AsyncIterator<PoolFrame>; keyAfter?(time: number): Promise<number | null>; close(): void }
interface PoolClip { /* … */ reverse?: boolean; still?: boolean }

// engine/speedEdits.ts
export function setSpeed<C extends EditClip>(clips: C[], id: string, change: SpeedChange, ctx: EditCtx): Edit<C>;
export function freezeFrame<C extends EditClip>(clips: C[], id: string, local: number, ctx: EditCtx, newId: () => string): Edit<C>;
```

## Techniques

- **One mapping, everywhere.** `sourceAt` replaces every `clip.in + local`; a grep for that pattern in `src/` is empty when §3 is done (checked in the task). At 1× forward without a ramp it returns exactly `in + local` (same floating-point operations), so 206's export inputs are bit-identical (AC-13).
- **Ramps as a monotone spline over the source.** curve.ts's Fritsch–Carlson spline joins the points without overshoot (Q5), so v stays within the points' range and above 0.1×; the play-time table is computed once per ramp and cached, and the inverse is Newton on the table, with the end pinned to `out` exactly.
- **Reuse the edit rules.** Speed edits build the new clip and hand it to `checkTrack` / `pack` / `limitVideos` / `tidyTransitions` as 202's edits do, so Magnetic, refusals, the videos-at-once limit and transitions follow without new code paths.
- **WSOLA** for same-pitch sound in the export: overlap-add of Hann-windowed frames taken from the source at the rate, each shifted within ±10 ms to the best cross-correlation with the previous output; pure Float32Array in and out, unit-tested on sines (pitch kept: zero crossings per second within 1 %) and on length (within one frame).
- **Reverse decoding in chunks** keeps the pool's limits: a chunk is at most the pool's `ahead` × 4 frames or the byte budget, whichever is smaller.
- **Announcements** through the timeline's live region, as 202–206 do ("Clip 2: 0.5×, now 8.4 s").

## Test Approach

| AC | Proof | Test |
| --- | --- | --- |
| AC-1 | unit | `sourceAt` / `playLength` / `frameStack` + `sourceAt` at every export frame for 0.25×, 0.5×, 2×, 10× at 30 and 60 fps against a hand-computed list, 1 µs (`tests/unit/engine/speed.test.ts`, `stack.test.ts`) |
| AC-2 | unit | `setSpeed` with Magnetic on / off, overlay refusal text, length limit, shortest length; trim at 2× moves 2 s of source; roll, slip, slide, split keep speed (`tests/unit/engine/speedEdits.test.ts`, `edits.test.ts`) |
| AC-3 | unit | reversed at 1× and 2×: first frame = out, last = in, every frame's source time; trim start moves out (`speed.test.ts`, `speedEdits.test.ts`) |
| AC-4 | unit | `freezeFrame` in the middle, at the first and last frame, Magnetic on / off, refusal; the freeze's fields carried over; no sound (`speedEdits.test.ts`, `soundPlan` in `timeline.test.ts`) |
| AC-5 | unit | each preset and a custom curve: monotone source, ends at `out` within 1 µs, every frame against a reference integrated at 100× the resolution; a clip inside its `rampSpan` plays exactly that part of the whole curve (`speed.test.ts`) |
| AC-6 | unit + 290 | `audioPlan` sources for every case (rate, muted ones left out); `timeStretch` keeps a sine's pitch within 1 % and the length within a frame at 0.5×, 0.75×, 1.5×, 2× (`tests/unit/engine/timeStretch.test.ts`); a listening check in 290 |
| AC-7 | unit | keyframes scaled with the length; transitions clamped with the reason; handles at the edge speed (`speedEdits.test.ts`, `stack.test.ts`) |
| AC-8 | unit | undo-step counts per action, a drag one step; seeded 1,000-edit property test (`tests/integration/state/video.test.ts`) |
| AC-9 | unit | ≥ 20 malformed documents, round trip, byte-identical without speed (`timeline.test.ts` gate tests) |
| AC-10 | unit | the pool with the fake decoder: a 10× lane restarts at key frames (frames decoded counted), a reversed lane hands frames newest first within the byte budget, a freeze decodes once (`tests/integration/engine/decodePool.test.ts`); no `clip.in + local` left in `src/` |
| AC-11, AC-12 | e2e (290) | the Speed group, ramp editor, badges, Freeze frame button and Shift + F, keyboard, announcements, axe, 360 px |
| AC-13 | self-test (290) | golden frames with a burnt-in frame counter at 0.5×, 2×, 10×, reversed, frozen, Hero; 201–206 fixtures unchanged |
| AC-14 | timing (290) | preview at 2× / 4× / reversed, export of a mixed-speed 60 s Reel vs 1× on the reference laptop |
| AC-15 | review | the docs task |

## Risks & Mitigations

- **Reverse playback cost** (§3, AC-14): decoders only go forwards, so reverse means decoding a key-frame group to show its frames backwards. Mitigation: a spike task first with the fake decoder (chunked backward lanes within the byte budget); preview reverse at stage size (D4); if a long-GOP phone video still drops too many frames in 290, the preview holds frames (as it does today when behind) while the export stays exact.
- **Same-pitch export sound** (§5, AC-6): our own WSOLA can warble on music or clip at window edges. Mitigation: unit tests on sines and on window joins (no step larger than the signal's own between samples); the 50 ms carry-over between windows; a listening check in 290 with speech and music at 0.5×, 0.75×, 1.5×, 2×; if it isn't good enough, fall back to pitch following the speed (Q8's cheaper choice) after asking the maintainer.
- **Missing one `clip.in + local`** (§3): a place left on the old mapping shows the wrong frame only at a speed ≠ 1. Mitigation: every site goes through `sourceAt` in one task, with a grep check that none is left; the golden frames in 290 cover preview and export.
- **Ramp numerics** (§1, AC-5): an inverse that drifts reaches `out` early or late. Mitigation: the table's end is pinned to the exact integral and the last frame to `out`; tests against a 100× finer reference for every preset at 30 and 60 fps.
- **Clip length floor** (§2): `clipLength` keeps a 0.1 s floor that would break the mapping for a tiny clip at 10×. Mitigation: speeds that would go under it are refused, so the floor never applies to a sped-up clip.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec approved 2026-10-18 (Q1–Q11 accepted, Q8 same pitch); AC-10 reworded and the shortest length added with the plan (D3, D-049). |
| II. Test-Gated Delivery | ✅ | Unit tests first for every task (D-033); e2e, golden frames, timing and listening checks listed in 290. |
| III. Simplicity and Small Dependencies | ✅ | No new dependency: WSOLA is our own ~150 lines; ramps reuse curve.ts's spline; speed edits reuse 202's rules. |
| IV. Memory Is Maintained | ✅ | Decisions and gotchas logged as they come; progress at the end. |
| V. Free and Open Source, Always | ✅ | Every speed feature for everyone, web and desktop alike. |
| VI. On the User's Device, No Backend | ✅ | Decoding, stretching and mixing happen locally. |
| VII. Permissive Licences Only | ✅ | Nothing new to license. |
| VIII. What You See Is What You Get | ⚠️ | Pictures: one `sourceAt` for preview and export. Sound: both keep the pitch but by different stretchers (browser vs WSOLA, D5), so the preview's sound is close, not sample-identical. |
| IX. Secure Desktop Shell | ✅ | No IPC or Electron change. |
| X. Budgets and Accessibility | ✅ | AC-14's timing budgets; keyboard, names, announcements for the curve editor (AC-12); the new UI is in the lazy studio chunk, the entry chunk unchanged. |

## Decisions for the maintainer (accepted 2026-10-18: D1–D5 as recommended)

- **D1 — What a freeze frame is in the data.** _Recommended:_ a video clip with `freeze` (the source time it shows) and `dur` (its length): it keeps the file, box, framing, look and keyframes with no new clip kind, and every rule that handles video clips (tracks, transitions, the videos-at-once limit, saving) takes it as it is. _Alternative:_ a third clip kind `still` (clearer in the data, but every `kind === 'photo' | 'video'` switch, the gate and the export job would need a new case).
- **D2 — Ramps when a clip is trimmed or split.** _Recommended:_ the curve is **cut**: points stay at the same source moments, the speed at the new edge becomes a point there, points outside are dropped (and a trim outwards extends the edge speed), so what plays at every moment that is kept doesn't change and the trimmed edge shows what was there. Q5's "trimming keeps the curve's shape over what's left" read this way. **Amended 2026-10-18 (T043, D-050):** cutting re-fits the spline through fewer points, which changed what plays between them (a split Bullet ramp up to 0.59 s, 32 %); instead the ramp keeps its curve over a fixed source span (`rampSpan`, set on the first trim or split; missing = in–out) and trims and splits only move in and out along it, so every kept frame plays exactly as before and trimming back out restores the clip. _Alternative:_ the curve is **stretched** over what's left (its shares kept), which changes the speed of frames the user didn't touch.
- **D3 — AC-10's "decodes only the frames it draws".** Compressed video can only be decoded from a key frame, so at 10× the export can't decode just the frames it draws. _Recommended:_ reword AC-10 to "the export draws only the frames it shows, and when the next frame it needs is past the next key frame it jumps there instead of decoding through (at 10× it never plays through the source)", and measure it with the fake decoder (frames decoded per frame drawn). _Alternative:_ keep the wording and accept it can't be met literally.
- **D4 — Reverse in the preview.** _Recommended:_ reversed lanes in the preview decode at the stage's size, in backward chunks within the pool's byte budget (the export decodes at its own size as today); the first second may drop frames (AC-14). _Alternative:_ reverse decoded at full size (fewer frames per chunk, more key-frame restarts, more dropped frames).
- **D5 — Sound in the preview vs the export.** _Recommended:_ the preview uses the browser's own pitch keeping (`preservesPitch`), the export our WSOLA: both keep the pitch, but they won't be sample-identical (the picture is). _Alternative:_ run our WSOLA in the preview too (an AudioWorklet and decoding the clip's sound up front: much more code and memory for a small gain).
- **Spec changes with the plan:** AC-10's wording (D3) and the shortest length (a speed that would make a clip shorter than 0.1 s is refused) go into the spec's Changelog when the plan is approved.
