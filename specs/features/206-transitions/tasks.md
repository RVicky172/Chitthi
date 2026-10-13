<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 206 — Transitions between clips · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task; 👤 = needs a person. Each task lists files and the proving test.
Test-first: each "failing" task must fail before its paired implementation makes it pass. Tasks run one at a time in the main session.
Tasks are proven by unit tests only (D-033); the e2e, golden-frame, sound and timing checks are listed in `290` ("Deferred checks collected from the phase": 206 AC-6, AC-8, AC-9, AC-10, AC-12, AC-13, AC-14).
When a task is done, record a **Result (YYYY-MM-DD):** note with `npm run specs -- done 206 Txxx --result "…"`.

## The model

Pure functions in `engine/transitions.ts` first; the spike proves the pool can decode past a clip's ends before anything relies on it.

- [ ] **T010** — Spike (risk 1): with the fake frame source in `decodePool.test.ts`, prove a lane asked for times before a clip's `in` and after its `out` serves the source's frames there and holds its first / last frame past the source's ends, and that two clips of one track decode side by side. If not, note what `PoolClip` / `poolClip` / the export's `lane` must widen, for T021. Record the finding. · files: `src/engine/decodePool.test.ts` · test: `npx vitest run src/engine/decodePool.test.ts`
- [ ] **T011** — Failing tests (`src/engine/transitions.test.ts`): `progressAt` (null outside [cut − d/2, cut + d/2], 0 and 1 at the ends, eased in and out as 205's curve at 0.25 / 0.5 / 0.75); `roomFor`; `tidyTransitions`: keeps a transition on touching clips, drops one whose `to` doesn't start where its clip ends (a gap, another track, a missing clip), clamps lengths in time order so each clip's two halves fit, rounds down to frames (30 / 60 fps), drops under 0.1 s, returns what it dropped; the defaults (0.5 s, dir left, colour black). · files: `src/engine/transitions.test.ts` · test: `npx vitest run src/engine/transitions.test.ts`: fails (no module)
- [ ] **T012** — Implement plan §1 in `src/engine/transitions.ts`: `Transition`, `TransitionKind`, `Direction`, `TRANSITION_LIMITS`, `cutsOf`, `halves`, `progressAt` (205's Ease in and out), `roomFor`, `tidyTransitions`; `transition?` on `TimedClip`. · files: `src/engine/transitions.ts`, `src/engine/timeline.ts` · test: T011
- [ ] **T013** [P] — Failing tests (`src/engine/timeline.test.ts`, the document gate): ≥ 20 malformed transition documents (wrong types, NaN, unknown kind / dir / colour, lengths out of range or off the frame grid, a `to` that is missing, on another track or not touching, `__proto__`) never throw and give the expected transitions and reasons; a project with transitions round-trips document → gate → document equal; 201–205 documents without transitions stay byte-identical. · files: `src/engine/timeline.test.ts` · test: `npx vitest run src/engine/timeline.test.ts`: the new cases fail
- [ ] **T014** — Implement plan §8: `mergeTransition` (in `transitions.ts`), `DocClip.transition`, `toDocument` (written only when present), `mergeProject` runs `tidyTransitions` after placing the clips, each drop with a reason. · files: `src/engine/transitions.ts`, `src/engine/timeline.ts` · test: T013

## What a frame shows

One `frameStack` for the preview, the export, the preview sound and the pool (Constitution VIII).

- [ ] **T020** — Failing tests (`src/engine/stack.test.ts`, `src/engine/decodePool.test.ts`): `frameStack` inside a transition gives the pair in the track's place with `mix` (kind, dir, colour, progress, role) and locals past the out point / before the in point; outside it, and for projects without transitions, exactly 205's stack; AC-11's fixture (each kind between a video and a photo, on the main and an overlay track, at 30 and 60 fps): the stack at every export frame equals the expected list; the project's length and the clips' starts are unchanged by transitions; `mostVideosAt` counts both videos over a transition's span; `lanePlan` lists both clips of a playing transition and the incoming one within 2 s. · files: `src/engine/stack.test.ts`, `src/engine/decodePool.test.ts` · test: `npx vitest run src/engine/stack.test.ts src/engine/decodePool.test.ts`: the new cases fail
- [ ] **T021** — Implement plan §2: `Mix` and `frameStack`'s pair in `stack.ts`; `mostVideosAt` with halves; `lanePlan` and lanes widened by the halves (from T010's finding) in `decodePool.ts`, `previewFrame.ts` (`poolClip`) and the export's `lane`; photos clamp their movement progress to 0–1. · files: `src/engine/stack.ts`, `src/engine/decodePool.ts`, `src/components/studio/previewFrame.ts`, `src/engine/videoExport.ts`, `src/engine/video.ts` · test: T020

## Drawing

- [ ] **T030** — Failing tests (`src/engine/transitions.test.ts`): `transitionOps(mix, W, H)` for every kind, each Wipe and Slide direction and both Dip colours at progress 0, 0.25, 0.5, 0.75, 1: at 0 the outgoing clip alone (alpha 1, nothing moved), at 1 the incoming alone; a dissolve's alphas at 0.5; a wipe's revealed rectangle; a slide's offsets (± p of the frame); Zoom's scale 1 → 1.3 and alpha 1 − p (D3); a dip's colour alpha 1 − |2p − 1| and which clip shows on each side of 0.5. · files: `src/engine/transitions.test.ts` · test: `npx vitest run src/engine/transitions.test.ts`: the new cases fail
- [ ] **T031** — Implement plan §3: `transitionOps` and `DrawOp`; `renderStack` draws a track's pair on the scratch canvas (each clip as alone: box, keyframes, look, its own alpha), applies the ops (dip with `source-atop`) and lays it down once; `StackDraw` carries `mix`; the preview (`drawPreview`) and the export's frame loop pass it through. Unit tests: `renderStack` without a `mix` is unchanged (the 203 / 205 tests). · files: `src/engine/transitions.ts`, `src/engine/video.ts`, `src/components/studio/previewFrame.ts`, `src/engine/videoExport.ts` · test: T030; `npm run check` (203's and 205's drawing tests unchanged)

## Sound

- [ ] **T040** [P] — Failing tests (`src/engine/keyframes.test.ts`, `src/engine/timeline.test.ts`): `edgeGain`: equal power (squares sum to 1 within 1 % every 1 ms across the transition), the outgoing sound past its end, the dip (out to 0 by the cut, in from it); `audioPlan` gives `lead` / `trail` / edges for a fixture with every kind (expected list exactly) and 205's sources unchanged without transitions; `gainCurve` with edges stays within 0.5 dB of the exact curve, with volume keyframes too. · files: `src/engine/keyframes.test.ts`, `src/engine/timeline.test.ts` · test: `npx vitest run src/engine`: the new cases fail
- [ ] **T041** — Implement plan §4: `SoundSource` `lead` / `trail` / `edgeIn` / `edgeOut` in `audioPlan`; `edgeGain` in `sourceGainAt` / `gainCurve`; `mixWindow` reads each source from `start − lead` to `end + trail` with one curve; `previewSound` sets each element's volume with the edges on every tick (new preview test). · files: `src/engine/timeline.ts`, `src/engine/keyframes.ts`, `src/engine/videoExport.ts`, `src/components/studio/previewSound.ts` · test: T040

## Store actions

- [ ] **T050** — Failing tests (`src/state/video.test.ts`): `change()` keeps or drops transitions by the rule after a move, trim, Roll, Slip, Slide, ripple, delete, Magnetic switch and move to track (a shortened one clamped); split moves the outgoing transition to the right part; duplicate keeps it at the old cut; `setTransition` (add, change kind / dir / colour / length; refused across a gap, on a locked track and past the videos-at-once limit, recording nothing), `removeTransition`, `transitionEveryCut` (only where it fits); undo-step counts for each, a length drag one step; a seeded 1,000-edit property test never leaves a transition between clips that don't touch or beyond its room. · files: `src/state/video.test.ts` · test: `npx vitest run src/state/video.test.ts`: the new cases fail
- [ ] **T051** — Implement plan §5 in `src/state/video.ts`: `tidyTransitions` in `change()` after packing (what it drops goes to the announcement), split and duplicate, `setTransition`, `removeTransition`, `transitionEveryCut`, `transitionSel` (view state). · files: `src/state/video.ts` · test: T050

## Panel, inspector and timeline

Unit tests cover the pure helpers; the UI itself is checked in 290.

- [ ] **T060** — Implement plan §6: `TransitionPanel` (the five kinds with looping previews drawn by `transitionOps`, still with reduced motion; applies to the selected cut, else the cut at the selected clip's end (the start for the last clip); Apply to every cut; a note with no cut) as a tool-rail item, and the inspector for a selected transition (kind, direction or colour, length in whole frames, Remove transition). Pure helper `panelCut(state)` (which cut the panel acts on, or why none) with unit tests. · files: `src/components/studio/TransitionPanel.tsx`, `src/components/studio/VideoWorkspace.tsx`, `src/components/studio/timelineRows.ts`, `src/components/studio/timelineRows.test.ts`, `src/styles/36-media-studio.css` · test: the helper's unit tests; `npm run check`
- [ ] **T061** — Implement plan §7 (D2): cut targets (`tl-cut`, Enter opens the panel for the cut) and transition blocks (`tl-trans`: select, Delete, edge drags in whole frames up to the room, ← / → a frame, Shift 0.5 s) in each picture row; announcements. Pure helpers in `timelineRows.ts` with unit tests: `transitionBlock` (left and width from cut, length, zoom), `describeTransitionChange` (added, changed, removed, dropped by an edit). · files: `src/components/studio/Timeline.tsx`, `src/components/studio/timelineRows.ts`, `src/components/studio/timelineRows.test.ts`, `src/styles/36-media-studio.css` · test: the helpers' unit tests; `npm run check`

## Docs and close

- [ ] **T090** — Docs (AC-15): `docs/MEDIA-STUDIO.md` (the transitions, options, limits, keys; "Still to do" without cross-fades), `specs/lld.md` (the model, the timing, the drawing, the sound), `CHANGELOG.md` Unreleased, the in-app docs. · files: `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `CHANGELOG.md`, `src/data/docs.ts` · test: relative links resolve
- [ ] **T091** — `npm run check` and `npm run build` green; entry chunk within budget; record the numbers. The other gates run in 290 (D-033). · test: `npm run check`; `npm run build`
- [ ] **T092** — Tick the ACs proven by unit tests; the rest are listed in 290; Status `Implemented`, roadmap 206 ✔️, `editor-implementation.md` P2.6 Done, `memory/progress.md`, `memory/MEMORY.md`.

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T011, T012, T030, T031 |
| AC-2 | T010, T011, T012, T020, T021 |
| AC-3 | T011, T012, T020, T021, T050, T051 |
| AC-4 | T011, T012, T050, T051 |
| AC-5 | T013, T014 |
| AC-6 | T040, T041 |
| AC-7 | T050, T051 |
| AC-8 | T060 |
| AC-9 | T061 |
| AC-10 | T060, T061 |
| AC-11 | T020, T021 |
| AC-12 | T031 |
| AC-13 | T020, T021, T040 |
| AC-14 | T031 |
| AC-15 | T090 |
