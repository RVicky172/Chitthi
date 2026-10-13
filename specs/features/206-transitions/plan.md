<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 206 — Transitions between clips · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-13, D1–D3 as recommended, D-036) <!-- Draft | Approved -->

## Approach

A transition is data on the clip before its cut, and the one function that decides what a frame shows (`frameStack`) returns both clips while it plays. The preview picture, the preview sound, the export's frames and sound and the decoder pool already ask `frameStack` (or `audioPlan`), so they all follow from it and show the same thing (Constitution VIII). Drawing stays on the 2D canvas (Q4, D-035). Under D-033 every task is proven by unit tests; the e2e, golden-frame, sound and timing checks go to 290.

**§1 The model (new `engine/transitions.ts`, AC-1–AC-3).** `Transition` = `{ kind, dur, to, dir?, colour? }` on the outgoing clip (`TimedClip.transition?`, D1): `kind` one of `dissolve`, `dip`, `wipe`, `slide`, `zoom`; `dur` seconds (0.1–3, whole frames, default 0.5, Q3); `to` the id of the clip it leads into; `dir` (`left` / `right` / `up` / `down`) for wipe and slide; `colour` (`black` / `white`) for dip. Pure helpers: `cutsOf(clips, track)` (each pair of touching clips, within 1e-6 s), `halves(clip)` (the seconds of transition before its end and after its start), `progressAt(transition, cut, t)` (0 → 1 over [cut − d/2, cut + d/2], eased with 205's Ease in and out, Q12), `roomFor(a, b)` (the longest transition that fits, AC-3), and `tidyTransitions(clips, fps)`: the one rule that keeps transitions valid (AC-4): a transition whose `to` clip doesn't start where its clip ends on the same track is dropped; the rest are clamped, in time order, so that each clip's two halves fit in it (rounded down to a frame; under 0.1 s it is dropped). It returns the clips and what it dropped (for the announcement).

**§2 What a frame shows (`engine/stack.ts`, AC-2, AC-11).** `frameStack(p, t)` gives, on a track where t is inside a transition, two items in the track's place: the outgoing clip (its `local` past its length up to d/2) and the incoming one (`local` from −d/2), each with `mix: { kind, dir, colour, progress, role: 'from' | 'to' }`. Elsewhere it is unchanged, so projects without transitions get exactly 205's stack (AC-13). A video's source time is `in + local`; outside its source the picture holds its nearest frame (the pool already holds at a source's `head` / `tail`; photos clamp their movement progress to 0–1). `mostVideosAt` widens each video clip's span by its halves, so both videos of a transition count (Q7); `lanePlan` lists both clips of a playing transition and the incoming one within 2 s.

**§3 Drawing (`engine/video.ts`, AC-1, AC-12).** A pure `transitionOps(mix, W, H)` describes each clip's drawing as data: an alpha, a clip rectangle, a translation and a scale (and, for dip, the colour's alpha), so it is unit-tested without a canvas. `renderStack` draws a track's transition pair onto one scratch canvas (each clip as before 206: its box, keyframes and look), applies the ops, and lays the result down once: Cross-dissolve: from, then to at alpha p; Wipe: from, then to clipped to the revealed part of the frame; Slide: from moved out by p of the frame, to moved in from the opposite edge; Zoom: to, then from scaled 1 → 1.3 about the centre at alpha 1 − p (D3); Dip: from (p < 0.5) or to (p ≥ 0.5), then the colour with `source-atop` at alpha 1 − |2p − 1|, so on an overlay track only the clips' own pixels dip (Q5). The main track's fade-in darkness and the video's fade-out stay as they are.

**§4 Sound (`engine/timeline.ts`, `engine/keyframes.ts`, `videoExport.ts`, `previewSound.ts`, AC-6).** A `SoundSource` gains `lead` / `trail` (seconds it plays before its start / after its end, its transitions' halves) and `edgeIn` / `edgeOut` (`power` or `dip`). `start`, `end`, `from` and `gain`'s times keep their meaning, so sources without transitions are 205's exactly. A pure `edgeGain(source, t)`: equal power (sin / cos of the eased progress) over the whole transition, or for a dip the outgoing sound down to 0 by the cut and the incoming up from it. `sourceGainAt` multiplies it in, so `gainCurve` and `mixWindow`'s single `setValueCurveAtTime` cover sources with transitions (as keyed ones); `previewSound` sets each element's volume from the same function on every tick (`soundPlan` already lists both clips, through `frameStack`).

**§5 Edits and the store (`state/video.ts`, `engine/edits.ts`, AC-3, AC-4, AC-7).** The store's `change()` runs `tidyTransitions` after packing, so every edit (move, trim, Roll, Slip, Slide, ripple, delete, Magnetic, move to track) keeps or drops transitions by the one rule; edits themselves don't change. Split moves a clip's outgoing transition to the right part; duplicate copies it to the copy (which ends at the old cut, so the transition stays there). New actions, each one undo step returning its refusal: `setTransition(clipId, patch)` (add or change; refused across a gap, on a locked track, past the videos-at-once limit, with the reason), `removeTransition(clipId)`, `transitionEveryCut(trackId, kind)` (where it fits), and a view-state selection `transitionSel` (the outgoing clip's id; not undone, not saved).

**§6 The Transitions panel (`VideoWorkspace.tsx`, new `studio/TransitionPanel.tsx`, AC-8, AC-10).** A **Transitions** item in the tool rail: the five kinds as buttons, each with a small looping preview drawn by `transitionOps` on two coloured cards (a still with reduced motion); choosing one applies it to the selected cut, else to the cut at the selected clip's end (the start for the last clip); **Apply to every cut** for that track; a note when there is no cut. With a transition selected, the inspector shows its kind, direction or colour, and length (a number field in seconds, whole frames) and **Remove transition**.

**§7 The timeline (`Timeline.tsx`, `timelineRows.ts`, AC-9, AC-10).** In each picture row every cut between touching clips is a small focusable button over the cut (`tl-cut`, as 202's gaps), and a transition is a block over its cut (`tl-trans`, its width the transition's length, its kind's icon): click selects it, Delete removes it, dragging either edge changes its length on both sides (whole frames, up to its room; one undo step), and with it focused ← / → change the length a frame (Shift: 0.5 s). A cut button's Enter opens the Transitions panel for it. `describeTransitionChange` (timelineRows.ts) announces adds, changes, removals, and transitions dropped by an edit.

**§8 The project document (`timeline.ts`, AC-5).** `DocClip.transition`, written only when present (documents without transitions byte-identical). `mergeProject` reads it through `mergeTransition` (unknown kind → dissolve, unknown `dir` → left, unknown `colour` → black, `dur` clamped and put on frames, a `to` that isn't a clip dropped) and runs `tidyTransitions` after placing the clips, each drop with a reason; it never throws.

**§9 Agent tools.** None in 206 (Q10): 212 adds the timeline's agent tools, transitions included.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/transitions.ts`, `src/engine/transitions.test.ts` | new | §1: the model, progress, room, `tidyTransitions`, `mergeTransition` |
| `src/engine/stack.ts`, `src/engine/stack.test.ts` | modify | §2: both clips during a transition (`mix`), `mostVideosAt` with halves |
| `src/engine/video.ts`, `src/engine/video.test.ts` | modify | §3: `transitionOps`, the pair drawn in `renderStack` |
| `src/engine/timeline.ts`, `src/engine/timeline.test.ts` | modify | §4, §8: `transition` on clips and in the document; `lead` / `trail` / edges in `audioPlan` |
| `src/engine/keyframes.ts`, `src/engine/keyframes.test.ts` | modify | §4: `edgeGain` in `sourceGainAt` / `gainCurve` |
| `src/engine/decodePool.ts`, `src/engine/decodePool.test.ts` | modify | §2: lanes with handles, `lanePlan` for a transition |
| `src/engine/videoExport.ts` | modify | §2, §4: the pair in the frame loop; sources with edges in `mixWindow` |
| `src/state/video.ts`, `src/state/video.test.ts` | modify | §5: `tidyTransitions` in `change()`, actions, split / duplicate, `transitionSel` |
| `src/components/studio/previewFrame.ts`, `src/components/studio/previewSound.ts` | modify | §2, §4: the preview draws the pair and sets each sound's volume with the edges |
| `src/components/studio/TransitionPanel.tsx` (new), `src/components/studio/VideoWorkspace.tsx` | new / modify | §6: the rail panel and the inspector for a selected transition |
| `src/components/studio/Timeline.tsx`, `src/components/studio/timelineRows.ts`, `src/components/studio/timelineRows.test.ts` | modify | §7: cut targets, transition blocks, keys, announcements |
| `src/styles/36-media-studio.css` | modify | §6, §7: the panel, cuts and blocks |
| `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `CHANGELOG.md`, `src/data/docs.ts` | modify | AC-15 |
| `specs/features/290-phase2-test-pass-release/feature.json` | modify | the deferred checks for AC-6 (sound), AC-8–AC-10, AC-12–AC-14 (D-033) |

## Data Structures & Interfaces

```ts
// engine/transitions.ts
export type TransitionKind = 'dissolve' | 'dip' | 'wipe' | 'slide' | 'zoom';
export type Direction = 'left' | 'right' | 'up' | 'down';
export interface Transition {
  kind: TransitionKind;
  /** Seconds, centred on the cut (Q2): 0.1–3, whole frames. */
  dur: number;
  /** The clip it leads into: it starts where this clip ends, on the same track (D1). */
  to: string;
  dir?: Direction;          // wipe, slide
  colour?: 'black' | 'white'; // dip
}
export const TRANSITION_LIMITS = { min: 0.1, max: 3, default: 0.5 };
export function tidyTransitions<C extends TimedClip>(clips: C[], fps: number): { clips: C[]; dropped: string[] };
export function progressAt(tr: Transition, cut: number, t: number): number | null;   // null outside it
export function roomFor(a: TimedClip, b: TimedClip, clips: TimedClip[]): number;

// engine/timeline.ts
interface TimedClip { /* … */ transition?: Transition }   // on the outgoing clip
interface SoundSource { /* … */ lead?: number; trail?: number; edgeIn?: 'power' | 'dip'; edgeOut?: 'power' | 'dip' }

// engine/stack.ts
export interface Mix { kind: TransitionKind; dir?: Direction; colour?: 'black' | 'white'; progress: number; role: 'from' | 'to' }
export interface StackItem<C> { clip: C; local: number; track: string; mix?: Mix }

// engine/video.ts
export interface DrawOp { alpha: number; clip?: { x: number; y: number; w: number; h: number }; dx: number; dy: number; scale: number }
export function transitionOps(mix: Mix, W: number, H: number): { op: DrawOp; colour?: { css: string; alpha: number } };

// state/video.ts
export function setTransition(clipId: string, patch: Partial<Omit<Transition, 'to'>>, key?: string): string | null;
export function removeTransition(clipId: string): string | null;
export function transitionEveryCut(trackId: string, kind: TransitionKind): string | null;
// view state: transitionSel: string | null (the outgoing clip's id)
```

## Techniques

- **One rule, run in one place.** `tidyTransitions` is pure and runs in the store's `change()` (after `pack`) and in `mergeProject`, as `pack` does for Magnetic: edits stay unaware of transitions and a seeded property test (1,000 random edits, as 202's) proves the invariant (AC-4).
- **Handles without new decoding paths.** The pool's lane for a clip in a transition is opened with its window widened by the halves, clamped to the source; past the source it holds its first / last frame as it already does at `head` / `tail` (a spike task proves this with the fake frame source first).
- **Ops as data.** `transitionOps` returns plain numbers, so every kind, direction and progress is unit-tested exactly (AC-1), and the canvas code that applies them is a few lines, checked by 290's golden frames.
- **Easing** reuses 205's Ease in and out solver (`valueAt` on two keys), so the motion matches keyframes' feel.
- **Equal-power sound**: gains sin(πp/2) and cos(πp/2) of the eased progress; their squares sum to 1 exactly, within floating point (AC-6). A dip uses the linear halves instead, so the sound is silent at the cut as the picture is black.
- **Announcements** through the timeline's live region, as 202–205 do.

## Test Approach

| AC | Proof | Test |
| --- | --- | --- |
| AC-1 | unit | `transitionOps` per kind, direction, colour at progress 0, 0.25, 0.5, 0.75, 1: from alone at 0, to alone at 1, a dissolve's alphas at 0.5 (`transitions.test.ts`, `video.test.ts`) |
| AC-2 | unit | `frameStack` inside a transition: both clips, locals past the out point / before the in point, held at the source's ends; project length and starts unchanged (`stack.test.ts`) |
| AC-3 | unit | `roomFor`, `tidyTransitions` clamping, refusals of `setTransition` (gap, locked, videos at once); `mostVideosAt` with halves (`transitions.test.ts`, `state/video.test.ts`) |
| AC-4 | unit | each edit kind keeps or drops as the rule says; split and duplicate; a seeded 1,000-edit property test (`state/video.test.ts`) |
| AC-5 | unit | ≥ 20 malformed documents, round trip, byte-identical without transitions (`timeline.test.ts`) |
| AC-6 | unit + self-test (290) | `edgeGain` equal power within 1 %, the dip shape; `audioPlan` sources for a fixture of every kind; `gainCurve` with edges; the exported sound measured in 290 |
| AC-7 | unit | undo-step counts for every action, a drag one step (`state/video.test.ts`) |
| AC-8, AC-9, AC-10 | e2e (290) | the panel, cut targets, blocks, inspector, keys, announcements, axe, 360 px, reduced motion |
| AC-11 | unit | a fixture (each kind between a video and a photo, main and overlay tracks, 30 and 60 fps): `frameStack` at every export frame equals the expected list (`stack.test.ts`) |
| AC-12 | self-test (290) | golden frames per kind / direction / colour at five progresses, 9:16 and 16:9, every backend; paused preview and export |
| AC-13 | self-test (290) | 201–205 fixtures pixel-identical with identical export inputs; existing video e2e unchanged |
| AC-14 | timing (290) | two-video dissolve playback, draw time per transition frame, export time with 10 transitions |
| AC-15 | review | the docs (T090) |

## Risks & Mitigations

- **Decoding past a clip's out point** (§2): the pool opens a lane for a clip's `in`–`out`; a transition needs frames up to d/2 beyond, and two lanes of one track at once. Mitigation: a spike task first, with the fake frame source: a lane asked for times before `in` and after `out` serves them (or holds at the source's ends), and two clips of one track decode side by side; if the pool can't, widen `PoolClip`'s window in `poolClip` / the export's `lane`.
- **Overlay transitions and see-through clips** (§3): mixing two clips that are themselves see-through (an opacity keyframe, a fade-in) on a scratch canvas could double-apply alpha. Mitigation: each clip is drawn on the scratch canvas exactly as `renderStack` draws it alone (its own alpha), the pair mixed there, and the result laid down at alpha 1; golden frames with see-through overlay clips in 290 (AC-12).
- **Edits silently dropping transitions** (§5, Q8): a trim or reorder can remove a transition the user made. Mitigation: the rule is announced ("Transition between clip 2 and clip 3 removed") and undo restores it; the property test proves no transition is ever left invalid (AC-4).
- **Playback cost** (AC-14): a transition draws two clips and a scratch canvas per frame. Mitigation: the scratch canvas is the one `renderStack` already keeps; the timing runs in 290 on the reference laptop, with the 4 ms budget per transition frame; if it is missed, the pair is drawn in place where both clips are opaque full-frame (the main track), skipping the scratch canvas.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec approved 2026-10-13 (Q1–Q12 accepted, D-035). |
| II. Test-Gated Delivery | ✅ | Unit tests first for every task (D-033); e2e, golden frames, sound and timing listed in 290. |
| III. Simplicity and Small Dependencies | ✅ | No new dependency; one rule (`tidyTransitions`) instead of transition logic in every edit; the 2D canvas, not a GPU path (Q4). |
| IV. Memory Is Maintained | ✅ | Decisions and gotchas logged as they come; progress at the end. |
| V. Free and Open Source, Always | ✅ | Every transition for everyone, web and desktop alike. |
| VI. On the User's Device, No Backend | ✅ | All drawing and mixing happen locally. |
| VII. Permissive Licences Only | ✅ | Nothing new to license. |
| VIII. What You See Is What You Get | ✅ | `frameStack` and `transitionOps` are shared by the preview and the export; sound through one `edgeGain`. |
| IX. Secure Desktop Shell | ✅ | No IPC or Electron change. |
| X. Budgets and Accessibility | ✅ | 4 ms per transition frame, export within 10 % (AC-14); keyboard, names, announcements, reduced motion (AC-10); entry chunk unchanged (the code loads with the studio). |
| XI. Agents Use the Same Code | ✅ | Store actions and pure functions, ready for 212's agent tools (Q10). |

## Decisions for the maintainer (accepted 2026-10-13: D1–D3 as recommended)

- **D1 — Where a transition lives.** _Recommended:_ on the outgoing clip, naming the clip it leads into (`to`): it is removed when that pair no longer touches (a reorder, a gap, a move to another track), as AC-4 and Q8 say, and split / duplicate carry it naturally. _Alternative:_ on the outgoing clip without `to` (it would stay on the clip's end whatever clip comes next after a reorder), or a project-level list of cuts (one more structure to keep in step with every edit).
- **D2 — Adding from the keyboard.** _Recommended:_ every cut is a focusable button on the timeline (like 202's gaps); Enter on it opens the Transitions panel for that cut, and the panel applies to the selected cut. _Alternative:_ no cut targets, the panel acting only on the cut at the selected clip's end (no way to pick a clip's start cut directly).
- **D3 — What Zoom looks like.** _Recommended:_ the outgoing clip grows from 1× to 1.3× about the centre while it dissolves into the incoming one (a "zoom into the next shot"). _Alternative:_ a zoom through: the outgoing clip grows out, then the incoming one shrinks in from 1.3× (more motion, harsher at Reel speed).
