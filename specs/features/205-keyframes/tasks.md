<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 205 — Keyframes: animate a clip's box, its volume and layers over time · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task; 👤 = needs a person. Each task lists files and the proving test.
Test-first: each "failing" task must fail before its paired implementation makes it pass. Tasks run one at a time in the main session.
Tasks are proven by unit tests only (D-033); the e2e, golden-frame, sound and accessibility checks are listed in `290` ("Deferred checks collected from the phase": 205 AC-6, AC-7, AC-9, AC-10, AC-11, AC-13).
When a task is done, record a **Result (YYYY-MM-DD):** note with `npm run specs -- done 205 Txxx --result "…"`.

## The model

Pure functions in `engine/keyframes.ts` first: everything else calls them.

- [ ] **T010** — Failing tests (`src/engine/keyframes.test.ts`): `valueAt` exact at keys, the first value before and the last after, linear midpoint, `ease-in` / `ease-out` / `ease-in-out` against sampled CSS cubic-bezier values (±0.001), hold; `clampValue` for every property's range (203's box, layers', volume 0–1); `transformAt` / `volumeAt` / `layerAt` replace only animated fields and return the same object when there are no keys; `isAnimated`. · files: `src/engine/keyframes.test.ts` · test: `npx vitest run src/engine/keyframes.test.ts`: fails (no module)
- [ ] **T011** — Implement plan §1 in `src/engine/keyframes.ts`: `Keyframe`, `Ease`, `ClipKeyProp`, `LayerKeyProp`, `Keyframes`, `valueAt` (binary search; cubic-bezier by Newton with bisection fallback), `clampValue`, `transformAt`, `volumeAt`, `layerAt`, `isAnimated`; `keys?` on `TimedClip` and `LayerBase`. · files: `src/engine/keyframes.ts`, `src/engine/timeline.ts`, `src/engine/layers.ts` · test: T010
- [ ] **T012** — Failing tests (`keyframes.test.ts`): `setKey` (adds; replaces within half a frame; new keys Ease in and out; clamps), `removeKey`, `moveKey` (one value or all at a time; landing on a key replaces it), `setEase`, `animate` / `stopAnimating` (Remove animation keeps the value at the playhead), the limits (100 per value, 5,000 per project, with the message); `shiftKeys`; `splitKeys` (left: keys before the cut + one holding the value at it; right: keys after, shifted, + one at 0). · files: `src/engine/keyframes.test.ts` · test: `npx vitest run src/engine/keyframes.test.ts`: the new cases fail
- [ ] **T013** — Implement plan §2 in `keyframes.ts` (pure edits, limits, `shiftKeys`, `splitKeys`). · files: `src/engine/keyframes.ts` · test: T012
- [ ] **T014** [P] — Failing tests (`src/engine/timeline.test.ts`, the document gate): ≥ 25 malformed keyframe documents (wrong types, NaN, unsorted, equal times, unknown ease, unknown value names, too many per value and per project, on clips and on layers) never throw and give the expected keys and reasons; a project with keys round-trips document → gate → document equal; 201 / 202 / 203 documents without keys stay byte-identical. · files: `src/engine/timeline.test.ts` · test: `npx vitest run src/engine/timeline.test.ts`: the new cases fail
- [ ] **T015** — Implement plan §10: `mergeKeys` in `keyframes.ts`; `DocClip.keys`, `toDocument` (written only when present) and `mergeProject` in `timeline.ts`; `mergeLayers` reads `keys` in `layers.ts`. · files: `src/engine/keyframes.ts`, `src/engine/timeline.ts`, `src/engine/layers.ts` · test: T014
- [ ] **T016** — Tests (`keyframes.test.ts`): AC-8's fixture (a clip moving corner to corner with Ease in and out while its opacity falls 100 → 0 % and it turns 90°; a title layer that flies in, holds and fades) evaluated at every frame of the export's grid equals the expected list; AC-12's timing (median of 200 evaluations of a frame on 500 clips with 5,000 keys ≤ 0.05 ms; no keys: no allocation). · files: `src/engine/keyframes.test.ts` · test: `npx vitest run src/engine/keyframes.test.ts`

## Edits keep keyframes in place

- [ ] **T020** [P] — Failing tests (`src/engine/edits.test.ts`): a start trim without ripple keeps each key at its timeline time (keys shifted by minus the start's move); a ripple start trim, an end trim, Slip, nudges, moves, `moveToTrack` and reorders leave key times (relative to the clip) unchanged; Roll shifts the right clip's keys, Slide the next clip's; a seeded property test (1,000 random edits) checks both rules. · files: `src/engine/edits.test.ts` · test: `npx vitest run src/engine/edits.test.ts`: the new cases fail
- [ ] **T021** — Implement plan §3 in `src/engine/edits.ts`: `trim` (start, no ripple) and `moveStart` shift keys with `shiftKeys`. · files: `src/engine/edits.ts` · test: T020

## Drawing and sound

One evaluation for the preview and the export (Constitution VIII).

- [ ] **T030** — Implement plan §4 with unit tests: `renderStack` takes each item's box from `transformAt(clip, local)` through a pure exported helper (`itemTransform`), and `drawLayers` draws `layerAt(layer, t)` when given a time (the photo editor passes none). Tests (`keyframes.test.ts`): `itemTransform` returns the stored box (same object) without keys and the keyed values with them; `layersAt` without a time or keys returns the same layers. · files: `src/engine/video.ts`, `src/engine/layers.ts`, `src/engine/keyframes.test.ts` · test: `npm run check` (the photo editor's and 203's unit tests unchanged)
- [ ] **T040** [P] — Failing tests: `audioPlan` keeps a clip whose stored volume is 0 but has volume keys above 0, with `gain` in clip time (`timeline.test.ts`); a pure `gainCurve(source, windowStart, windowLength, step = 0.005)` (`keyframes.test.ts`): linear interpolation between its points stays within 0.5 dB of the exact curve (ramps included), two adjacent windows meet with equal values, and a source without keys gives today's ramp values. · files: `src/engine/timeline.test.ts`, `src/engine/keyframes.test.ts` · test: `npx vitest run src/engine`: the new cases fail
- [ ] **T041** — Implement plan §5: `audioPlan` with `gain`; `gainCurve`; `mixWindow` sets one `setValueCurveAtTime` per source per window for keyed sources (unkeyed ones keep today's ramps); `previewSound` sets each element's volume from `volumeAt` on every sync. · files: `src/engine/timeline.ts`, `src/engine/keyframes.ts`, `src/engine/videoExport.ts`, `src/components/studio/previewSound.ts` · test: T040

## Store actions

- [ ] **T050** — Failing tests (`src/state/video.test.ts`): split gives each part its keys (`splitKeys`), duplicate copies them, `setLayerTimes` shifts a layer's keys when its start edge moves and not when it moves whole; `toggleKey`, `removeAnimation`, `moveKeys` (a drag under one key: one undo step), `setKeyEase`, `deleteKeys`; the routers `setClipTransformAt`, `updateLayerAt`, `setClipVolume` write a keyframe at the playhead for an animated value and the stored value otherwise; each is one undo step and returns its refusal (locked track, limits). · files: `src/state/video.test.ts` · test: `npx vitest run src/state/video.test.ts`: the new cases fail
- [ ] **T051** — Implement plan §6 in `src/state/video.ts`. · files: `src/state/video.ts` · test: T050

## Inspector, stage and timeline

Unit tests cover the pure helpers; the UI itself is checked in 290.

- [ ] **T060** — Implement plan §7: `KeyframeButton` (three states, `aria-pressed`, a name with the value and time; menu: Remove animation) beside 203's Position and size fields, the Clip sound slider and the layers' position, size, rotation and opacity controls; fields show the value at the playhead and write through the routers; previous / next keyframe buttons. Pure helpers `keyState(keys, local)` and `adjacentKey(item, local, direction)` with unit tests (`keyframes.test.ts`). · files: `src/components/studio/KeyframeButton.tsx`, `src/components/studio/VideoWorkspace.tsx`, `src/components/ig/LayerPanel.tsx`, `src/engine/keyframes.ts`, `src/engine/keyframes.test.ts`, `src/styles/36-media-studio.css` · test: the helpers' unit tests; `npm run check`
- [ ] **T061** — Implement plan §8: the stage evaluates before editing: `useClipTransform` uses `transformAt` and `setClipTransformAt`; the video stage passes `layerAt(layer, t)` to `useLayerPointer` and routes its updates through `updateLayerAt`; the photo editor unchanged. · files: `src/components/studio/useClipTransform.ts`, `src/components/studio/VideoWorkspace.tsx`, `src/components/ig/useLayerPointer.ts` · test: `npm run check` (the routers are proven by T050)
- [ ] **T062** — Implement plan §9 (D1–D3): `KeyframeLane` under the selected clip's or layer's row (one row of diamonds, expand to one row per value; select, drag with `snap`, Delete, the interpolation menu; the shape shows the ease), K / Alt + [ / ] / ← → keys, announcements. Pure helpers in `timelineRows.ts` with unit tests: `keyTimes(item)` (the union of times), `describeKeyChange`, `easeShape`. · files: `src/components/studio/KeyframeLane.tsx`, `src/components/studio/Timeline.tsx`, `src/components/studio/timelineRows.ts`, `src/components/studio/timelineRows.test.ts`, `src/styles/36-media-studio.css` · test: the helpers' unit tests; `npm run check`

## Docs and close

- [ ] **T090** — Docs (AC-14): `docs/MEDIA-STUDIO.md` (keyframes, interpolations, keys), `specs/lld.md` (the model, the evaluation, the document fields, the gain curve), `CHANGELOG.md` Unreleased, the in-app docs' keys. · files: `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `CHANGELOG.md`, `src/data/docs.ts` · test: relative links resolve
- [ ] **T091** — `npm run check` and `npm run build` green; entry chunk within budget; record the numbers. The other gates run in 290 (D-033). · test: `npm run check`; `npm run build`
- [ ] **T092** — Tick the ACs proven by unit tests; the rest are listed in 290; Status `Implemented`, roadmap 205 ✔️, `editor-implementation.md` P2.5 Done, `memory/progress.md`, `memory/MEMORY.md`.

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T010, T011, T012, T013 |
| AC-2 | T010, T011 |
| AC-3 | T012, T013, T020, T021, T050, T051 |
| AC-4 | T014, T015 |
| AC-5 | T012, T013, T050, T051 |
| AC-6 | T050, T051, T060, T061 |
| AC-7 | T062 |
| AC-8 | T016, T030 |
| AC-9 | — |
| AC-10 | T040, T041 |
| AC-11 | T030 |
| AC-12 | T016 |
| AC-13 | T062 |
| AC-14 | T090 |
