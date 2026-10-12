<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 205 — Keyframes: animate a clip's box, its volume and layers over time · Implementation Plan

**Spec:** `./spec.md` · **Status:** Draft <!-- Draft | Approved -->

## Approach

Keyframes are data on the clip or layer they animate, evaluated by one pure module that the preview, the export,
the stage editing and the inspector all call, so what the user sees is what is exported (Constitution VIII). Under
D-033 every task is proven by unit tests; the e2e, golden-frame and sound checks are listed in 290.

**§1 The model (new `engine/keyframes.ts`, AC-1, AC-2, AC-12).** A keyframe is `{ t, v, ease }`: seconds from the start
of its clip or layer (Q2), the value, and how the change that starts at it eases (Q3). An item's keyframes are a map
from an animatable value to a sorted list: clips animate `x`, `y`, `w`, `rot`, `opacity`, `radius` (203's box) and
`volume`; layers `x`, `y`, `w`, `rot`, `opacity` (Q1). `valueAt(keys, t)` finds the segment by binary search and
interpolates: linear; ease-in / ease-out / ease-in-out as CSS's cubic-bezier curves (0.42, 0, 1, 1), (0, 0, 0.58, 1),
(0.42, 0, 0.58, 1), solved for x by Newton's method with a bisection fallback; hold. Before the first key: the first
value; after the last: the last. `clampValue(prop, v)` keeps values in range (203's `TF_RANGE`, layers', volume 0–1,
Q8). Higher-level helpers: `transformAt(clip, local)` (the clip's `tf` with its animated fields replaced),
`volumeAt(clip, local)`, `layerAt(layer, t)` (the layer with its animated fields at timeline time `t`), and
`isAnimated(item, prop)`. Items without keyframes return their stored values untouched (no allocation per frame).

**§2 Editing keyframes, pure (keyframes.ts, AC-1, AC-5).** `setKey(keys, prop, t, v)` (adds, or replaces the value at a
time within half a frame; new keys get Ease in and out), `removeKey`, `moveKey(prop | all, from, to)` (a key landing on
another replaces it), `setEase`, `animate(item, prop, t)` (the first key, at the current value) and
`stopAnimating(item, prop, t)` (**Remove animation**: the value at `t` becomes the stored one). Limits (Q5): 100 keys
per value, 5,000 per project, refused with a message.

**§3 Keyframes follow their clip (edits.ts, the store, AC-3).** Times are from the item's start, so moves, ripples,
reorders, track changes, nudges and Magnetic packing carry keyframes for free. Only edits that move a start **edge**
shift them, by minus how far the start moved, so they stay at their timeline place: `trim` of a start edge without
ripple, and `moveStart` (the right clip of a Roll, the next clip of a Slide). A ripple start trim keeps the clip's start,
so nothing shifts. Slip never touches them. `splitKeys(keys, at, valuesAtCut)` gives the left part the keys before
`at` plus one at `at` holding the value there, and the right part the keys after `at` shifted by `-at` plus one at 0
(the store's split uses it). Duplicate copies them (the object spread already does). A layer's start edge
(the timeline's layer bar) goes through a new store action `setLayerTimes`, which shifts its keys the same way.

**§4 Drawing (video.ts, layers.ts, AC-8, AC-11).** `renderStack` takes each item's box from `transformAt(clip,
local)` instead of `clip.tf`, so the preview and the export, which both call it, get the same values at every frame.
`drawLayers(ctx, layers, W, H, t)` draws `layerAt(layer, t)` when a time is given (the video editor); the photo editor
passes none and is unchanged. Items without keyframes take the exact code path of today, so 203's projects stay
pixel-identical.

**§5 Sound (timeline.ts audioPlan, videoExport.ts, previewSound.ts, AC-10).** A clip with volume keyframes is in the
sound plan even when its stored volume is 0, and its `SoundSource` carries `gain` (its keys, in clip time). The
export's `mixWindow` then builds one gain curve for the window: the volume curve times the 0.03 s end ramps, sampled
every 5 ms, set with `setValueCurveAtTime` (the only automation on that gain node, so events never overlap); windows
meet exactly, so a curve crossing a 10 s window edge is continuous. The preview's `previewSound` sets each element's
`volume` from `volumeAt` on every sync tick (within one frame). A spike (T001) checks the curve's accuracy (0.5 dB) and
that nothing clicks at window edges before the rest is built.

**§6 Store actions (state/video.ts, AC-5, AC-6).** `toggleKey(item, prop)` (the diamond: animate / add / remove the
key at the playhead), `removeAnimation(item, prop)`, `moveKeys(item, prop | 'all', from, to, key)` (a drag: one undo
step), `setKeyEase(item, prop | 'all', t, ease)`, `deleteKeys(item, prop | 'all', t)`, and two routers that make the
existing editing keyframe-aware: `setClipTransformAt` (used by the stage box, the arrow keys and the inspector's
fields) and `updateLayerAt` (the layers' pointer and fields). A router writes an animated value as a keyframe at the
playhead (Q4: auto-key) and a not-animated one as today. `setClipVolume` does the same for volume. Every action is one
undo step returning its refusal (locked track, a limit).

**§7 Inspector (VideoWorkspace.tsx ClipPanel, LayerPanel's fields, AC-6).** A `KeyframeButton` (a diamond with three
states: not animated, at a key, between keys; `aria-pressed` and a name such as "X: keyframe at 1.20 s") beside each
animatable field: the 203 Position and size fields, the clip's Clip sound slider, and the layers' position, size,
rotation and opacity controls; its menu has **Remove animation**. The fields show the animated value at the playhead.
Previous / next keyframe buttons in each group's heading.

**§8 Stage (useClipTransform.ts, useLayerPointer.ts, VideoWorkspace.tsx).** The stage evaluates before it edits: the
clip box from `transformAt`, the layers passed to `useLayerPointer` as `layerAt(layer, t)`, so hit tests and handles
match what is drawn; their updates go through the §6 routers, so dragging an animated clip or layer sets a keyframe at
the playhead.

**§9 Timeline keyframe lane (Timeline.tsx, new `studio/KeyframeLane.tsx`, AC-7, AC-13).** Under the selected clip's row
(or the selected layer's row) a thin lane shows one diamond per keyframe time (the union of its animated values); an
expand button shows one row per value. A diamond is a button: click selects, drag moves (snapping to frames, the
playhead and the item's ends with 202's `snap`, Alt to skip), Delete removes, its menu (a portal menu like the track
height menu) sets the interpolation; its shape shows it (diamond: ease, square: hold, triangle-ish: linear). Keys with
the timeline focused: K toggles keys at the playhead for every animated value of the selection, Alt + [ / ] jump to the
previous / next key, ← / → (Shift: a second) move the focused diamond. Changes are announced through the timeline's live
region (`describeKeyChange`, timelineRows.ts). Reduced motion: no transitions on diamonds.

**§10 Project document (timeline.ts, layers.ts, AC-4).** `DocClip.keys?` and `Layer.keys?`, written only when present,
so documents without keyframes are byte-identical. The gate (`mergeKeys(raw, props)`) sorts by time, keeps the last of
equal times, clamps values, checks `ease` (unknown → Ease in and out), drops non-finite entries, enforces the limits with
a reason, and never throws; `mergeProject` and `mergeLayers` call it.

**§11 Agent tools.** None in 205 (Q6): 212 adds the timeline's agent tools, keyframes included.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/keyframes.ts`, `src/engine/keyframes.test.ts` | new | §1, §2: the model, evaluation, pure edits, the gate |
| `src/engine/timeline.ts`, `src/engine/timeline.test.ts` | modify | §5, §10: `keys` on clips and in the document, `gain` in the sound plan |
| `src/engine/edits.ts`, `src/engine/edits.test.ts` | modify | §3: start-edge edits shift keys |
| `src/engine/video.ts` | modify | §4: `renderStack` draws `transformAt` |
| `src/engine/layers.ts` | modify | §4, §10: `drawLayers` draws `layerAt` with a time; `mergeLayers` reads keys |
| `src/engine/videoExport.ts` | modify | §5: the gain curve in `mixWindow` |
| `src/components/studio/previewSound.ts` | modify | §5: element volume from `volumeAt` |
| `src/state/video.ts`, `src/state/video.test.ts` | modify | §3, §6: split keys, the keyframe actions, the routers, `setLayerTimes` |
| `src/components/studio/VideoWorkspace.tsx`, `src/components/ig/LayerPanel.tsx` | modify | §7, §8: keyframe buttons, animated values in fields, the stage evaluates first |
| `src/components/studio/useClipTransform.ts`, `src/components/ig/useLayerPointer.ts` | modify | §8: edit the animated box / layer through the routers |
| `src/components/studio/KeyframeLane.tsx`, `src/components/studio/Timeline.tsx`, `src/components/studio/timelineRows.ts` | new / modify | §9: the lane, its keys and announcements |
| `src/styles/36-media-studio.css` | modify | §7, §9: diamonds, the lane |
| `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `CHANGELOG.md`, `src/data/docs.ts` | modify | AC-14 |
| `specs/features/290-phase2-test-pass-release/feature.json` | modify | the deferred checks for AC-6, AC-7, AC-9–AC-11, AC-13 (D-033) |

## Data Structures & Interfaces

```ts
// engine/keyframes.ts
export type Ease = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';
export interface Keyframe {
  /** Seconds from the start of its clip or layer. */
  t: number;
  /** The value from here (in its property's units: shares of the frame, degrees, 0–1). */
  v: number;
  /** How the change from this keyframe to the next eases. */
  ease: Ease;
}
export type ClipKeyProp = 'x' | 'y' | 'w' | 'rot' | 'opacity' | 'radius' | 'volume';
export type LayerKeyProp = 'x' | 'y' | 'w' | 'rot' | 'opacity';
export type Keyframes<P extends string> = Partial<Record<P, Keyframe[]>>;
export const KEY_LIMITS = { perValue: 100, perProject: 5000 } as const;

export function valueAt(keys: readonly Keyframe[], t: number): number;
export function transformAt(clip: TimedClip, local: number): ClipTransform;
export function volumeAt(clip: TimedClip & { volume: number }, local: number): number;
export function layerAt<L extends Layer>(layer: L, t: number): L;
export function setKey<P extends string>(keys: Keyframes<P>, prop: P, t: number, v: number): Keyframes<P> | { error: string };
export function shiftKeys<P extends string>(keys: Keyframes<P>, by: number): Keyframes<P>;
export function splitKeys<P extends string>(keys: Keyframes<P>, at: number, valueAtCut: (prop: P) => number): [Keyframes<P>, Keyframes<P>];
export function mergeKeys<P extends string>(raw: unknown, props: readonly P[]): { keys: Keyframes<P> | undefined; dropped: string[] };

// engine/timeline.ts: TimedClip gains   keys?: Keyframes<ClipKeyProp>
// engine/layers.ts:   LayerBase gains   keys?: Keyframes<LayerKeyProp>
// engine/timeline.ts: SoundSource gains gain?: Keyframe[]  (volume keys, clip time; the source's volume is the base)
// engine/timeline.ts: DocClip gains     keys?: Keyframes<ClipKeyProp>
```

## Techniques

- **Cubic-bezier easing:** x(u) and y(u) for control points (x1, y1, x2, y2); for a progress p find u with x(u) = p by
  Newton's method (8 steps, derivative guard) with bisection fallback, then y(u). Matches the browser's CSS curves to
  1e-4 (unit-tested against sampled `cubic-bezier` values).
- **Binary search** over each value's keys per evaluation: O(log n) per value; a stack of ≤ 8 clips and the layers
  showing at a frame is well under AC-12's 0.05 ms.
- **Gain automation:** `AudioParam.setValueCurveAtTime(curve, start, duration)` with one curve per source per window
  (linear interpolation between 5 ms points: under 0.1 dB from an ease curve), so the mixer's sample-exact gain matches
  the preview's per-tick `volume`.
- **Auto-key routing:** the store, not the components, decides whether a change is a keyframe, so the stage, the arrow
  keys and the fields stay as they are apart from calling the router.

## Test Approach

| AC | Proof | Where |
| --- | --- | --- |
| AC-1 | unit | `keyframes.test.ts`: which values animate; a value without keys is unchanged |
| AC-2 | unit | `keyframes.test.ts`: exact at keys, before / after, linear midpoint, the three eases against sampled CSS curves (±0.001), hold, ranges |
| AC-3 | unit | `edits.test.ts` (start trim with / without ripple, roll, slide, slip, nudge, move to track carry or keep keys), `video.test.ts` (split, duplicate, layer start edge) |
| AC-4 | unit | `timeline.test.ts`: ≥ 25 malformed keyframe documents, limits, round trip, byte-identical without keys |
| AC-5 | unit | `video.test.ts`: each keyframe action and a drag are one undo step |
| AC-6 | e2e (290) | the inspector's diamonds, auto-key from fields, the stage and arrows, previous / next |
| AC-7 | e2e (290) | the lane: select, drag with snapping, Delete, interpolation menu, K, Alt + [ / ], arrows, announcements |
| AC-8 | unit | `keyframes.test.ts`: the fixture's values at every frame on the export grid equal the expected list; `renderStack` and the export both take them from `transformAt` (a unit test on the item list the export builds) |
| AC-9 | self-test (290) | golden frames of the fixture at 9:16 and 16:9 on every backend; the paused preview; the export |
| AC-10 | unit + self-test (290) | unit: `audioPlan` with `gain`, the window curve's values (±0.5 dB, continuous across windows) as a pure function; 290: the export's sound measured; the preview within a frame |
| AC-11 | self-test (290) | 201 / 202 / 203 fixtures pixel-identical, identical export inputs; existing video e2e unchanged |
| AC-12 | unit | a timed evaluation (median of 200 runs) on 500 clips and 5,000 keys ≤ 0.05 ms; no keys = no allocation |
| AC-13 | e2e (290) | keyboard only, names, axe, 360 px, reduced motion |
| AC-14 | review | the docs in T090 |

## Risks & Mitigations

- **Audio automation** (§5): overlapping AudioParam events throw, and a curve split across 10 s windows could click. Mitigation: one `setValueCurveAtTime` per source per window and nothing else on that gain node; **T001 spike** measures the curve against the expected gain (±0.5 dB) and the joins between windows before the mixer is changed.
- **Auto-key surprises** (§6, Q4): once a value is animated, a drag sets a keyframe rather than moving the whole animation. Mitigation: the diamond shows the state everywhere the value is edited, the change is announced with "keyframe at …", and **Remove animation** is one step away.
- **Shared layer code with the photo editor** (§4, §8): `drawLayers` and `useLayerPointer` serve both editors. Mitigation: keyframes act only when a time is passed (the video editor); the photo editor's calls don't change and its tests must stay green.
- **Start-edge edits** (§3): a missed edit path would make animations jump after a trim. Mitigation: shift keys in the two helpers every start-edge edit uses (`trim` start without ripple, `moveStart`), and a seeded property test (1,000 random edits) that a key's timeline time is kept by start-edge edits and carried by moves.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec approved 2026-10-12 (Q1–Q8 accepted). |
| II. Test-Gated Delivery | ✅ | Unit tests first for every task (D-033); the e2e, golden-frame and sound checks are listed in 290. |
| III. Simplicity and Small Dependencies | ✅ | No new dependency: easing, search and audio automation are a few small functions and the Web Audio API. |
| IV. Memory Is Maintained | ✅ | Decisions and gotchas logged as they come; progress at the end. |
| V. Free and Open Source, Always | ✅ | Keyframes for everyone, web and desktop alike. |
| VI. On the User's Device, No Backend | ✅ | All evaluation and mixing happen locally. |
| VII. Permissive Licences Only | ✅ | Nothing new to license. |
| VIII. What You See Is What You Get | ✅ | One evaluation (`keyframes.ts`) for the preview, the export and the editors (§4, §5). |
| IX. Secure Desktop Shell | ✅ | No IPC or Electron change. |
| X. Budgets and Accessibility | ✅ | AC-12 budget (0.05 ms per frame); keyboard, names, announcements, reduced motion (AC-13); no entry-chunk growth beyond a few KB. |
| XI. Agents Use the Same Code | ⚠️ | No agent tool in 205 (Q6, accepted): the actions are pure functions and store actions that 212's tools will call. |

## Decisions for the maintainer

- **D1 — The lane's layout.** _Recommended:_ one row of diamonds (every animated value's keyframe times) under the
  selected clip or layer, with an expand button for one row per value. _Alternative:_ always one row per value (clearer,
  but tall: up to 7 rows under a clip).
- **D2 — Keyboard shortcut.** _Recommended:_ **K** toggles keyframes at the playhead for the selection's animated values;
  **Alt + [ / ]** jump between keyframes (Alt avoids the browser's and screen readers' own [ ] shortcuts). _Alternative:_
  no single-key shortcut, only the buttons.
- **D3 — Ease shown on the diamond.** _Recommended:_ the shape shows it (rounded diamond: an ease, square: hold, pointed
  diamond: linear), with the name in its accessible label and tooltip. _Alternative:_ one shape, the ease only in the
  menu and label.
