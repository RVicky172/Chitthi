# 202 — Edit operations: ripple, roll, slip, slide, magnetic main track, snapping (P2.2) · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-07, D1–D4 as recommended) <!-- Draft | Approved -->

## Approach

What the code is today (read for this plan, at `a3adea2`): `src/engine/timeline.ts` holds the track model; `pack()`
places the main track's clips end to end and runs in one place, the store's `change()` (`src/state/video.ts`), so the
video track can't have gaps. Every edit in the store (`removeClip`, `updateClip` for trims, `moveClipTo`,
`duplicateClip`, `splitAtPlayhead`) edits the clip list in order and relies on `pack` for the starts.
`components/studio/Timeline.tsx` does the dragging: the clip body reorders (a drop marker, `moveClipTo` on release),
the edges trim through `updateClip` with a per-drag undo key, and `snap()` (inside the component) snaps to clip edges,
layer edges and the playhead within `SNAP_PX = 8`. Two model functions assume no gaps: `videoAt` returns the last clip
for any time not inside a clip (a gap would show the wrong picture), and `framePlan` makes frames only inside clips (a
gap would shorten the export). `mergeProject` always packs.

**§1 Gaps in the model (`timeline.ts`).** The main track's clips stay sorted by `start` (an invariant every operation
keeps). `videoAt` clamps only before the first clip's start when it starts at 0 (2.x: before 0 → first clip) and at or
past the end (→ last clip); a time inside a gap, or before a first clip that starts later, gives null (black, as a
hidden track). `framePlan` emits a `{ clip: null }` span for each gap's frames, so the frames always run 0 → total
without holes. `gaps(p, track)` lists a track's gaps. For a packed track nothing changes: the 201 equivalence tests
(frozen 2.x reference) keep passing and prove it.

**§2 The operations, pure (`src/engine/edits.ts`, new).** Each takes the project (or a track's clips), the clip, an
amount and options, and returns `{ clips } | { error }`: never throws, never returns an invalid track. One module so
the UI, the keyboard and the agent tools of `212` call the same code (Q7).

- `rippleDelete(p, id)`, `lift(p, id)` (leaves a gap), `closeGap(p, at)`, `closeGaps(p)` (= pack by start order).
- `trim(p, id, side, delta, { ripple })`: end: ripple moves later clips by delta; no ripple: lengthening stops at the
  next clip (fills the gap only). Start: ripple keeps the start and moves later clips (2.x's start trim); no ripple
  keeps the end, moves the start. Limits: 0.3 s minimum (`MIN_LEN`, moved here from the UI), source bounds for video,
  60 s for photos, the project length limit (passed in).
- `roll(p, leftId, delta)`: the cut between `left` and the clip right after it, adjacent only (a cut with a gap
  between isn't a roll: refused with a message).
- `slip(p, id, delta)`: video only (`in` and `out` together, inside `[0, srcDur]`); photos refused (spec AC-7).
- `slide(p, id, delta)`: the previous clip's end and the next clip's start move by delta (through `in` / `out` or
  `dur`); a missing neighbour or a gap next to it bounds the move (sliding into a gap only moves the clip).
- `moveTo(p, id, start)` (Magnetic off): to the nearest free spot that fits around the wanted start, else
  `{ error: 'No room here: make a gap first or switch Magnetic on' }` (Q2). `reorder(p, id, index)` (Magnetic on) is
  today's `moveClipTo`.
- `nudge(p, id, tool, frames, fps, magnetic)`: the keyboard's Alt + arrows (Q5): Select moves (off) or reorders (on,
  one place per press), Roll moves the clip's end cut, Slip slips, Slide slides; one frame = 1 / fps.
- `snapTime(t, targets, tolerance)` and `snapTargets(p, layers, playhead)` (clip and gap edges, layer edges, the
  playhead, 0, the end): moved out of the component, pure, unit-tested.
- Every result goes through `checkTrack()` in development builds and tests (sorted, no overlap, lengths ≥ 0.3 s
  except 2.x clips already shorter, inside sources, within the length limit).

**§3 Magnetic in the store and the document.** `VState.magnetic` (default true) is a project setting (Q1): carried
across Reel ↔ YouTube, in the document as an optional `magnetic` field (version stays 1; missing = true). `change()`
packs only when magnetic. Undo snapshots carry `magnetic` (D1). `setMagnetic(true)` is one undo step that also closes
the gaps; `setMagnetic(false)` changes no clip and isn't recorded. The store's existing actions call the §2
operations: with Magnetic on they give exactly today's results (AC-1, proven against the 201 store behaviour in unit
tests on the fixtures); with it off: `removeClip` lifts, trims don't ripple unless asked (Shift, Q3), `duplicateClip`
puts the copy in the first gap after the original that fits, else after the last clip (D2), `addMedia` appends after
the last clip as today. `mergeProject` reads `magnetic`; with it off it sorts the main track by start and resolves
overlaps by moving a clip to the end of the one it overlaps, with a reason (D3); with it on it packs as today.

**§4 Tools, switches and keys (UI).** View settings in the store, not undone, not saved (D4): `tool` (`select` /
`roll` / `slip` / `slide`) and `snapping` (default on). Transport: a tool picker (four radio buttons in a
`radiogroup`, icons from lucide-react with names and the key in the tooltip: V, R, Y, U), and two toggle buttons
(`aria-pressed`) **Magnetic** and **Snap**. Pointer, in `Timeline.tsx`:

| Gesture | Select | Roll | Slip | Slide |
| --- | --- | --- | --- | --- |
| Drag a clip | Magnetic on: reorder (today); off: move to a time (`moveTo`, live) | — | slip | slide |
| Drag an edge | trim; ripple with Magnetic on, or Shift (Q3) | roll the cut (the edge between two adjacent clips) | — | — |

Alt held while dragging skips snapping (Q4). Gaps are drawn in the video row as focusable buttons ("Gap, 1.5 s, from
3.0 s"): click selects, Delete closes. Keys with the timeline focused (Q5): V / R / Y / U tools; Alt + ← / → nudge one
frame, Shift + Alt one second; Q / W ripple trim start / end to the playhead; Shift + Delete ripple delete; Delete is
lift with Magnetic off. Refusals (locked track, no room, a photo can't slip) go to the toast as in 201. Each change
is announced in a polite live region ("Clip 2, 3.0 s to 5.5 s"). The preview already draws `NO_PICTURE` where
`videoAt` gives null, so gaps show black with the layers; the export follows `framePlan`.

**§5 Proving it.** Unit (`edits.test.ts`): a table per operation (normal, at each limit, zero room, locked, photo /
video, first / last clip, next to a gap); AC-1: with Magnetic on, every store-level edit on the 12 fixtures equals
the 201 result (pack-based expectation); AC-11 property tests: 1,000 seeded random edits per operation on the
fixtures, each result passing `checkTrack` and `mergeProject(toDocument(...))` unchanged; AC-12 timing on 500 clips.
`timeline.test.ts`: gaps in `videoAt` / `framePlan` (45 black frames for a 1.5 s gap at 30 fps), and the 201
equivalence still green. Self-test: an export with a 1.5 s gap decodes black with the layer in the gap and the
picture either side (AC-4). e2e: the tools by mouse and keyboard, Magnetic and Snap, gaps, Shift-ripple, refusals,
announcements, axe and 360 px; the existing video e2e unchanged.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/edits.ts` | new | §2 operations, snapping, `checkTrack` |
| `src/engine/edits.test.ts` | new | AC-1, AC-2, AC-3, AC-5–AC-9, AC-11, AC-12 |
| `src/engine/timeline.ts` (+ test) | modify | §1 gaps in `videoAt` / `framePlan`, `gaps()`; `magnetic` in the document and `mergeProject` (§3) |
| `src/state/video.ts` | modify | `magnetic`, `tool`, `snapping`; actions through §2; `setMagnetic`, `nudgeClip`, `rippleTrimToPlayhead`, gap actions |
| `src/components/studio/Timeline.tsx` | modify | tool picker, Magnetic / Snap, gestures per tool, gaps, keys, live region |
| `src/components/icons.tsx` | modify | tool and switch icons (lucide-react) |
| `src/styles/36-media-studio.css` | modify | tool picker, gaps, roll / slip / slide cursors |
| `src/dev/videoChecks.ts` | modify | AC-4 gap export check |
| `e2e/editors.e2e.ts` | modify | new `describe('video edit tools')` |
| `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `CHANGELOG.md`, `src/data/docs.ts` | modify | AC-13 |

## Data Structures & Interfaces

```ts
// src/engine/edits.ts
export const MIN_LEN = 0.3;            // seconds; a clip is never trimmed below it
export const PHOTO_MAX = 60;           // seconds a photo may show
export type Tool = 'select' | 'roll' | 'slip' | 'slide';
export type Edit<C> = { clips: C[] } | { error: string };
export interface EditCtx { maxLength: number; locked: (track: string) => string | null }

export function rippleDelete<C extends TimedClip>(clips: C[], id: string, ctx: EditCtx): Edit<C>;
export function lift<C extends TimedClip>(clips: C[], id: string, ctx: EditCtx): Edit<C>;
export function closeGap<C extends TimedClip>(clips: C[], at: number, ctx: EditCtx): Edit<C>;
export function closeGaps<C extends TimedClip>(clips: C[]): C[];
export function trim<C extends TimedClip>(clips: C[], id: string, side: 'start' | 'end', delta: number, o: { ripple: boolean }, ctx: EditCtx): Edit<C>;
export function roll<C extends TimedClip>(clips: C[], leftId: string, delta: number, ctx: EditCtx): Edit<C>;
export function slip<C extends TimedClip>(clips: C[], id: string, delta: number, ctx: EditCtx): Edit<C>;
export function slide<C extends TimedClip>(clips: C[], id: string, delta: number, ctx: EditCtx): Edit<C>;
export function moveTo<C extends TimedClip>(clips: C[], id: string, start: number, ctx: EditCtx): Edit<C>;
export function reorder<C extends TimedClip>(clips: C[], id: string, index: number, ctx: EditCtx): Edit<C>;
export function nudge<C extends TimedClip>(clips: C[], id: string, tool: Tool, frames: number, fps: number, magnetic: boolean, ctx: EditCtx): Edit<C>;
export function snapTargets(clips: TimedClip[], layers: Layer[], playhead: number, total: number): number[];
export function snapTime(t: number, targets: number[], tolerance: number, skip?: number[]): number;
export function checkTrack(clips: TimedClip[], maxLength: number): string | null;

// src/engine/timeline.ts
export function gaps(p: Project, track: string): { start: number; end: number }[];
export interface ProjectDoc { /* … */ magnetic?: boolean }

// src/state/video.ts
interface VState { /* … */ magnetic: boolean; tool: Tool; snapping: boolean }
export function setMagnetic(on: boolean): void;
export function nudgeClip(id: string, frames: number): string | null;   // the refusal, if any
export function rippleTrimToPlayhead(side: 'start' | 'end'): string | null;
export function deleteGap(at: number): string | null;
```

## Techniques

- **Operations as pure functions on sorted clip lists**, O(n) per call, no allocation beyond the new list; the store
  wraps each in one `change()` with the per-drag undo key (201's coalescing).
- **Magnetic as a rule, not a mode in every function:** with it on, results are packed afterwards (today's
  behaviour by construction, AC-1); with it off, the operations themselves guarantee no overlap.
- **Seeded property tests** (the 201 tests' `mulberry32`) for AC-11; `checkTrack` is the invariant.
- **Timing in unit tests** (AC-12): median of 100 runs with `performance.now()`; generous bar (2 ms) so CI noise
  doesn't flake.
- Accessibility: tools as a `radiogroup` (arrow keys), switches as `aria-pressed` buttons, gaps as buttons, one
  polite live region; 24 px targets.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `edits.test.ts`: Magnetic on, every store edit on 12 fixtures equals the pack-based 201 result; existing video e2e unchanged | unit + e2e |
| AC-2 | `edits.test.ts` lift / no-ripple trims / `moveTo` (fits, nearest spot, refused); e2e drag to a time with Magnetic off | unit + e2e |
| AC-3 | `edits.test.ts` `closeGaps`, `closeGap`; e2e Magnetic on closes gaps (one undo), gap select + Delete | unit + e2e |
| AC-4 | `timeline.test.ts` `framePlan` 45 null frames for 1.5 s at 30 fps, `videoAt` null in gaps; self-test decoded gap black with the layer | unit + self-test |
| AC-5 | `edits.test.ts` ripple delete / trim table incl. limits; e2e Shift-drag and Shift+Delete | unit + e2e |
| AC-6 | `edits.test.ts` roll table (length unchanged, limits, non-adjacent refused); e2e roll by drag and Alt+arrow | unit + e2e |
| AC-7 | `edits.test.ts` slip (bounds, photo refused); e2e slip drag and keys, message on a photo | unit + e2e |
| AC-8 | `edits.test.ts` slide (neighbours, bounds, next to a gap); e2e slide | unit + e2e |
| AC-9 | `edits.test.ts` `snapTime` / `snapTargets`; e2e snapping on, off and Alt | unit + e2e |
| AC-10 | e2e: tools by mouse and keys (V/R/Y/U, Alt + arrows, Q/W, Shift+Delete), live region text, axe, Pixel 7 at 360 px | e2e |
| AC-11 | `edits.test.ts`: undo-step keys in the store test; locked refusals; 1,000 seeded edits per operation pass `checkTrack` and `mergeProject` unchanged | unit |
| AC-12 | `edits.test.ts` timing: every operation on 500 clips, median of 100 < 2 ms | unit timing |
| AC-13 | docs reviewed at verification | manual |

## Risks & Mitigations

- **Changing `videoAt` / `framePlan` breaks "nothing changes" (201 AC-3).** → The 201 equivalence tests and the
  self-test's 200-frame pixel check run unchanged; they cover packed tracks, which Magnetic on guarantees.
- **The drag code in `Timeline.tsx` grows four ways.** → Gestures call one pure operation each; the component only
  maps pointer deltas to seconds (snap, Alt) and picks the operation by tool. The existing drag e2e tests run after
  each UI task.
- **Undo consistency with Magnetic** (undoing a gap-close while Magnetic is on would show gaps on a magnetic track).
  → `magnetic` lives in the snapshots (D1).
- **Keyboard conflicts** (letters typed into fields; Alt + arrows in browsers / Electron menus). → Keys only with
  the timeline focused (today's `typingIn` guard); spike: check Alt + ← doesn't navigate back in Chrome or trigger
  the Electron menu on Windows when the timeline has focus (`preventDefault` on keydown) before building on it.
- **Live-preview of `moveTo` while dragging with Magnetic off** (the clip jumps to a free spot mid-drag). → During
  the drag the block follows the pointer (as reorder does with `dx`); the operation runs on release, with the drop
  spot shown (a marker).

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Spec approved (Q1–Q8) |
| II. Test-gated delivery | ✅ | Operations test-first (tables, property tests), e2e per UI task, gap export self-test |
| III. Small dependencies | ✅ | None new (icons from lucide-react) |
| IV. Memory maintained | ✅ | D1–D4 to `decisions.md` once accepted |
| V. Free and open source | ✅ | Same tools on web and desktop |
| VI. On device, no backend | ✅ | No network |
| VII. Permissive licences | ✅ | Nothing new |
| VIII. WYSIWYG, one code path | ✅ | Preview and export both read `videoAt` / `framePlan` (gaps included); `mergeProject` stays the gate (overlaps resolved) |
| IX. Secure desktop shell | ✅ | No IPC or Electron change (the Alt-key spike only reads behaviour) |
| X. Budgets and accessibility | ✅ | AC-12 timing; keyboard for every tool, radiogroup, live region, axe, 360 px; studio chunk only |
| XI. Agents use the same code | ⚠️ | No tools yet (Q7, `212`); the pure operations are what the tools will call |

## Decisions for the maintainer (accepted 2026-10-07: D1–D4 as recommended)

- **D1** — Undo and Magnetic: snapshots carry `magnetic`; switching it on (which closes gaps) is one undo step,
  switching it off isn't recorded (no clip changes). Undoing the close restores the gaps *and* Magnetic off, so a
  magnetic track never shows gaps. Recommended.
- **D2** — Duplicate with Magnetic off: the copy goes into the first gap after the original that fits, else after the
  last clip (nothing moves). Alternative: insert right after and ripple. Recommended: no ripple (Magnetic off means
  nothing moves unless asked).
- **D3** — The validator with Magnetic off resolves overlapping clips by moving the later one to the end of the clip
  it overlaps (keeping every clip, with a reason in `dropped`) rather than dropping it. Recommended.
- **D4** — The tool and the Snap switch are view settings for the session (not undone, not saved); Magnetic is part
  of the project (Q1). Recommended.
