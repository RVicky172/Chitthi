# 201 — Track model and migration (P2.1) · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-06, D1–D3 as recommended) <!-- Draft | Approved -->

## Approach

What the code is today (read for this plan): `src/state/video.ts` keeps `clips: VClip[]` in play order, `music:
VMusic | null` (not in undo) and `layers: Layer[]` (timed by their own `start` / `end`); `src/engine/video.ts`
places clips end to end on every read (`timeline()`, `clipAt()`, `totalLength()`); `src/engine/videoExport.ts` walks
`timeline(job.clips)` for frames and opens the clips' sound plus the music (start 0, end = video length, offset,
fade-out over `min(1.5, total / 3)` s) for the 10-second mixing windows. Only `components/studio/Timeline.tsx` and
`VideoWorkspace.tsx` read the store. The self-test has no video checks; the three video e2e tests
(`e2e/editors.e2e.ts:103–237`) cover add, trim, reorder, split, delete, music, export. Nothing is saved between
sessions, and there is no layers validator (`mergeLayers`) yet.

**§1 The model, pure (`src/engine/timeline.ts`, new).** Types and functions with no DOM, tested in Vitest:
- `Track { id, kind: 'video' | 'overlay' | 'audio', name, hidden, muted, locked }`; ids `V1` (main video) and `A1`
  (music) for the two tracks every 201 project has. Height is a view setting, kept outside the model (§4).
- A clip gains `track: string` and `start: number` (seconds, full precision, Q6) next to today's `ClipTiming`. Music
  becomes an **audio clip** `{ id, track: 'A1', start: 0, in: offset, volume, toEnd: true }`: `toEnd` keeps today's
  rule that the song plays to the end of the video whatever its length, so nothing changes (AC-2).
- `pack(clips)`: on the main video track, starts are the running sum of lengths in order (the gapless rule of Q3).
  Every state change that touches clips ends with `pack`, so starts are always exact and the 2.x order logic
  (reorder by index, split, duplicate) keeps working unchanged.
- `projectLength(p)`, `videoAt(p, t)` (the clip showing at t on the topmost visible video / overlay track, or null;
  same clamping as today's `clipAt`), `framePlan(p, fps)` (per clip on visible video tracks: `[f0, f1)`, as today's
  loop) and `audioPlan(p)` (the sources the mixer opens: each video clip's sound at its volume with 0.03 s ramps,
  the music unless its track is muted, with today's fade-out).
- `TRACK_LIMITS(desktop)`: 8 + 8 on desktop, 4 + 4 on the web (Q4); 201 projects use 1 + 1.

**§2 Document and validator (`timeline.ts` + `mergeLayers` in `engine/layers.ts`).**
- `toDocument(project)` → JSON-safe `{ version: 1, kind, format, fps, quality, fadeOut, tracks, clips, audio, layers,
  media }`: media files are referenced by id with name, kind, type, size, pixel size and source length (no blobs,
  object URLs, thumbnails or filmstrips; Q1 leaves where media lives to the Save / Open feature).
- `mergeProject(raw, desktop)` → `{ project, dropped: string[] }`, the single gate: a document **without a version**
  is read as the 2.x shape (`clips` in order, `music`, `layers`) and converted (`fromSequence`); version 1 is
  validated field by field: numbers checked finite and clamped to their ranges (not rounded, Q6), enums checked, `edit` through `mergeEdit()`,
  layers through the new `mergeLayers()` (each kind's fields, `start` / `end`, mask parts through `mergePart()`, image
  layers kept only when the project's media has their picture: they name a picture by id, T013), clips without a known track or media dropped with a reason, track and
  clip limits enforced (`TRACK_LIMITS`, `limitsFor()`), unknown fields dropped, and finally `pack`. It never throws
  (one `try` around the whole read, falling back to an empty project with the reason).
- `fromSequence(state)` is also what the store uses, once, to turn today's shape into tracks (§3), so the migration
  and the runtime share one function.

**§3 The store (`src/state/video.ts`).** `VState` gains `tracks: Track[]` (`V1`, `A1` at start) and each `VClip`
gains `track` and `start`; the music gains `track: 'A1'`. Every function that changes clips calls `pack` (one
place: `change()`), so `addMedia`, `removeClip`, `moveClipTo`, `duplicateClip`, `splitAtPlayhead`, `updateClip`
behave as today. `total()` reads `projectLength`. Undo snapshots gain `tracks` (hide / mute / lock are undo steps,
AC-11); music stays outside undo, as today. New actions: `setTrack(id, patch: { hidden | muted | locked })`
(undoable, key `track:<id>:<field>`) and `setTrackHeight(id, size)` (not undoable, §4). Lock guards: every clip
action refuses (returns false with a reason) when its track is locked; `addMedia` refuses with a message when `V1`
is locked; music offset / volume changes refuse when `A1` is locked. The export job (`exportVideo`) is built from
the project: `tracks` plus clips with `start`.

**§4 UI (`Timeline.tsx`, `VideoWorkspace.tsx`, `styles/36-media-studio.css`).**
- Track headers: the `Video` and `Music` header cells (today `aria-hidden` labels) become a `role="group"` named after
  the track, holding three buttons with `aria-pressed`: **Hide** (video) / **Mute** (audio), **Lock**, and a
  **Height** menu button with Small / Medium / Large (40 / 64 / 96 px, Q5; a menu with arrow keys like `MoreMenu`).
  The layers rows keep their plain label (Q2). Icons from lucide-react (already a dependency); text labels for screen
  readers; at ≤ 600 px the header shows icons only with the same accessible names.
- Height: `trackView: Record<trackId, 'small' | 'medium' | 'large'>` in the store, a `PURE` key (not undo, not
  stale-making); default medium = today's row heights, so nothing moves at first.
- Lock: clip blocks on a locked track show a lock badge, their pointer handlers don't start drags or select, and
  Delete / S / Ctrl+D say "This track is locked" in a toast; the inspector shows the clip read-only.
- Preview (`VideoStage`): picks the frame with `videoAt(project, t)` (null when `V1` is hidden → black frame with
  layers, as the export does); playback mutes the music `<audio>` when `A1` is muted. Clip sound keeps playing
  when the video track is hidden (hiding is about pictures; decision D2).
- Export (`videoExport.ts`): the frame loop runs over `framePlan`, frames of a hidden track drawn with `src = null`
  (black + layers); `openAudio` runs over `audioPlan`. `renderFrame()` is unchanged.

**§5 Proving "nothing changes" (AC-3–AC-5).** The 2.x placement code is copied, frozen, into the tests as the
reference (`legacyTimeline`, `legacyClipAt`, the 2.x export loop's frame list and audio sources).
- Unit (`timeline.test.ts`): for the fixture shapes of AC-7, the new `pack` / `videoAt` / `framePlan` / `audioPlan`
  give exactly the reference's clip, local time, frame ranges and audio sources (start, end, from, volume, ramps) at
  every frame boundary and at 1,000 random times. Equal inputs to the unchanged `renderFrame()`, encoder and mixer
  mean equal frames and sound: this is the main proof (decision D1).
- Self-test (`src/dev/selftest.ts`, new "video" section): fixture projects built from generated photos and a short
  generated video (canvas → Mediabunny, no files added to the repo), rendered at 10 sample times each through the
  reference path and the new path on Canvas 2D in the same run: pixel-identical. Hidden `V1` → black + layers; muted
  `A1` → no music source (AC-9).
- e2e: the three existing video tests pass unchanged (AC-4); new test for the headers (AC-8, AC-10, AC-11), with axe
  and at the phone size.
- Speed (AC-5): before any code changes, the self-test's new timing check records the 2.x numbers for a 60-clip
  1080p fixture (preview frame at 60 times; export to memory); after, the same check must be within 5%.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/timeline.ts` | new | §1, §2: tracks, clips with start, `pack`, `videoAt`, plans, document, `mergeProject`, `fromSequence` |
| `src/engine/timeline.test.ts` | new | AC-1, AC-2, AC-6, AC-7 and the reference equivalence (§5) |
| `src/engine/layers.ts` (+ `layers.test.ts`) | modify | `mergeLayers()` (§2) |
| `src/engine/video.ts` | modify | `timeline()` / `clipAt()` / `totalLength()` callers move to `timeline.ts`; formats, motion, `renderFrame` stay |
| `src/engine/videoExport.ts` | modify | frame loop over `framePlan`, sound over `audioPlan`, hidden tracks (§4) |
| `src/state/video.ts` | modify | `tracks`, `start` / `track`, `pack` in `change()`, track actions, lock guards, `trackView` (§3) |
| `src/components/studio/Timeline.tsx` | modify | track headers, heights, lock behaviour, clip positions from `start` (§4) |
| `src/components/studio/VideoWorkspace.tsx` | modify | preview via `videoAt`, music mute, read-only inspector when locked |
| `src/styles/36-media-studio.css` | modify | header controls, three heights, lock badge |
| `src/dev/selftest.ts` | modify | video section: pixel identity, hidden / muted, timing (§5) |
| `e2e/editors.e2e.ts` | modify | track headers test (AC-8, AC-10, AC-11) |
| `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `CHANGELOG.md` | modify | AC-12 |

## Data Structures & Interfaces

```ts
// src/engine/timeline.ts
export type TrackKind = 'video' | 'overlay' | 'audio';
export interface Track { id: string; kind: TrackKind; name: string; hidden: boolean; muted: boolean; locked: boolean }
export const MAIN_VIDEO = 'V1', MUSIC = 'A1';
export interface TimedClip extends ClipTiming { id: string; track: string; start: number }
export interface AudioClip { id: string; track: string; start: number; in: number; volume: number; toEnd: boolean }
export interface Project<C extends TimedClip = TimedClip, A extends AudioClip = AudioClip> {
  tracks: Track[]; clips: C[]; audio: A[]; layers: Layer[]; fadeOut: boolean;
}
export function pack<C extends TimedClip>(clips: C[]): C[];
export function projectLength(p: Project): number;
export function videoAt<C extends TimedClip>(p: Project<C>, t: number): { clip: C; local: number } | null;
export function framePlan<C extends TimedClip>(p: Project<C>, fps: number, total: number): { clip: C | null; f0: number; f1: number; start: number }[];
export function audioPlan(p: Project, total: number): { ref: string; start: number; end: number; from: number; volume: number; fadeIn: number; fadeOut: number }[];
export const TRACK_LIMITS: (desktop: boolean) => { visual: number; audio: number };

export interface ProjectDoc { version: 1; kind: VKind; format: VFormatId; fps: VFps; quality: VQuality; fadeOut: boolean;
  tracks: Track[]; clips: DocClip[]; audio: DocAudio[]; layers: Layer[]; media: DocMedia[] }
export function toDocument(p: …): ProjectDoc;
export function fromSequence(seq: { clips: ClipTiming-like[]; music: … | null; layers: Layer[] }): Project;
export function mergeProject(raw: unknown, desktop: boolean): { project: Project; doc: ProjectDoc; dropped: string[] };

// src/engine/layers.ts
export function mergeLayers(raw: unknown): Layer[];
```

## Techniques

- **One packing rule, applied in one place** (`change()`), so 2.x behaviour of the main track is preserved by
  construction and `202` replaces just that rule (magnetic track, ripple) later.
- **Frozen reference** for equivalence: the 2.x functions copied into the test file; they never change again, so any
  drift in the new code shows up as a failing comparison, not as a subtly different export.
- **Validator style** as `mergeDesign` / `mergeEdit` / `mergeMasks`: unknown → defaults, clamp, drop, never throw.
- Times at full precision (Q6 as changed): `pack` adds lengths in the same order and with the same float operations
  as 2.x, so starts are bit-identical; frame mapping keeps today's
  `frameRange` with its `1e-6` guard.
- Accessibility: header controls are real buttons with `aria-pressed`; the height menu follows `MoreMenu`'s keyboard
  pattern (arrows, Home / End, Escape).

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `timeline.test.ts`: types hold limits; 500-clip and 8 + 8 track projects valid; 501 / 9 trimmed | unit |
| AC-2 | `timeline.test.ts`: `fromSequence` fixtures → starts to 1 ms, music clip fields, empty music track | unit |
| AC-3 | `timeline.test.ts` reference equivalence (frames, local times, audio sources); self-test pixel identity at 10 times per fixture | unit + self-test |
| AC-4 | existing `e2e/editors.e2e.ts` video tests unchanged + full e2e | e2e |
| AC-5 | self-test timing check, baseline recorded before the refactor (T-first task) | self-test |
| AC-6 | `timeline.test.ts`: ≥ 30 malformed documents (wrong types, NaN / Infinity, negative and huge times, `in ≥ out`, unknown track, missing media, 600 clips, 20 tracks, bad layers, `null`, strings, arrays); `layers.test.ts` for `mergeLayers` | unit |
| AC-7 | `timeline.test.ts`: round trips for empty, photo-only, video-only, mixed, music + offset, timed layers, 20 / 60 / 500 clips | unit |
| AC-8 | `e2e/editors.e2e.ts` new test: header buttons by role and name, keyboard, height menu, axe, Pixel 7 project | e2e |
| AC-9 | unit (plans with hidden / muted tracks) + self-test (hidden → black frame with layers) | unit + self-test |
| AC-10 | new e2e: locked track refuses drag, trim, split, delete, duplicate; playback and export still work | e2e |
| AC-11 | new e2e: hide / mute / lock undo and redo; height survives undo | e2e |
| AC-12 | docs reviewed in the verify task | manual |

## Risks & Mitigations

- **Hidden behaviour in the 2.x code** (e.g. `clipAt` clamping, the 0.1 s minimum length, `t` clamped to the end,
  the music's fade length). → The frozen reference and the equivalence tests at every boundary catch it; write them
  first, against the unchanged code (they must pass before the refactor starts).
- **The self-test needs a video clip without a file in the repo.** → Spike first: make a 2-second 320 × 240 clip in
  the self-test with Mediabunny's `CanvasSource` (already a dependency); if encoding isn't available in the test's
  Electron, fall back to photo-only fixtures for the pixel check and keep video clips in the unit equivalence only.
- **`mergeLayers` is bigger than it looks** (5 kinds, masks, drawings with point lists, image data URLs). → Its own
  tasks and tests; cap point counts and data-URL sizes as the editors already do.
- **UI regressions in drag code** when positions come from `start` instead of `timeline()`. → Positions stay equal by
  construction (`pack`); the existing e2e drag tests run after each UI task.
- **Scope creep into `202`/`203`** (gaps, add track). → Not in the UI; the model allows them, tests cover the model
  only.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Spec approved (Q1–Q7) |
| II. Test-gated delivery | ✅ | Reference-equivalence tests written first against unchanged code; e2e after each UI task; timing baseline before the refactor |
| III. Small dependencies | ✅ | No new dependency (icons from lucide-react, test clip via Mediabunny, both present) |
| IV. Memory maintained | ✅ | Decisions D1–D3 recorded; learnings as they come |
| V. Free and open source | ✅ | Same features on web and desktop; only the track limits differ (Q4, memory) |
| VI. On device, no backend | ✅ | No network use |
| VII. Permissive licences | ✅ | Nothing new |
| VIII. WYSIWYG, one code path | ✅ | `renderFrame()` unchanged; preview and export both read `videoAt` / `framePlan`; `mergeProject` is the single gate for project data |
| IX. Secure desktop shell | ✅ | No IPC or Electron change |
| X. Budgets and accessibility | ✅ | AC-5 speed; header controls keyboard / screen reader / axe / 360 px; nothing added to the entry chunk (studio chunk only) |
| XI. Agents use the same code | ⚠️ | No video tools yet (`000` G1 → `212`, spec Q7); the store functions the tools will call are the ones the UI uses |

## Decisions for the maintainer (accepted 2026-10-06: D1 (a), D2 pictures only, D3 yes)

- **D1** — Proof of "the exported MP4 is identical" (AC-3): (a) **equal inputs**: unit tests that the new frame plan
  and audio sources equal the frozen 2.x ones exactly, plus pixel identity of rendered frames in the self-test
  (recommended: deterministic, no hardware dependence); or (b) additionally decode two real exports and compare them,
  which is slower and flaky with hardware encoders (not bit-exact even for equal input). With (a), AC-3's
  "exported MP4's frames are identical and sound within ±1 LSB" is read as "made from identical frames and mixing
  inputs"; the spec gets that wording.
- **D2** — Hiding the video track hides the pictures only; the clips' own sound still plays (to silence it, lower the
  clip volume). Alternative: hide also mutes the clips' sound. Recommended: pictures only, as in Premiere and Resolve,
  where video and audio are separate.
- **D3** — `mergeLayers()` is new and also useful to the photo studio (whose batches aren't saved either). Recommended:
  write it once in `engine/layers.ts` for both, tested there, used only by `mergeProject` for now.
