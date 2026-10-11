<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 203 — Compositing many tracks, picture-in-picture (P2.3) · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-11, D1–D3 as recommended, D-031) <!-- Draft | Approved -->

## Approach

What the code is today (read for this plan on `main` after 204, `5ff8fab`):

- **Model** (`engine/timeline.ts`): tracks of kind video / overlay / audio already exist (201); only `V1` (main video)
  and `A1` (music) are ever made. `videoAt(p, t)` returns the single topmost visible clip; `framePlan` walks the main
  track's clips; `audioPlan` mixes main-track clip sound and the music. `patchTrack` lets only audio tracks mute.
- **Drawing** (`engine/video.ts`): `renderFrame` fills black, draws one clip with `renderIg` into the whole frame
  (its framing: fill / whole picture, zoom, position; a photo's motion), the layers, then the darkness of the clip's
  fade-in and the video's fade-out.
- **Edits** (`engine/edits.ts`, 202): pure, per track; Magnetic packs only the main track (`pack`).
- **Preview** (`previewFrame.ts`, `VideoStage`): one shown clip and one picture; the pool (204) with
  `poolLimits(1)`; `lanePlan` already plans every visible picture track. Sound: `previewSound.ts`, one current clip.
- **Export** (`videoExport.ts`): `framePlan` spans, one clip at a time through the export's pool.
- **Timeline** (`Timeline.tsx`): rows hard-wired as main video, layers, music; `TrackHead` has Hide or Mute, Lock and
  the height menu.
- **Limits**: `limitsFor().videosAtOnce` is 3 on the web and 5 on the desktop app (1 without `VideoDecoder`), set by
  204's measurements by Q2 / Q6's rule (Q6's "6 on the desktop app" was a proposal; 204 measured 5).

**§1 The clip transform (engine/timeline.ts, AC-4).** Every picture clip may carry `tf?: ClipTransform` = `{ x, y, w,
rot, opacity, radius }`: the box's centre as a share of the frame (−0.5…1.5), its width as a share of the frame width
(0.05…4), rotation in degrees (−180…180), opacity (0…1) and corner radius (0…0.5 of the box's shorter side, Q2). The
names and meanings are the layers' (`engine/layers.ts`: x, y, w, rot, opacity), so the stage reuses the layers' box
geometry and handles. Missing = `IDENTITY` (`{0.5, 0.5, 1, 0, 1, 0}`). The box has the frame's aspect ratio (D1): at
identity it is the frame, so a clip without a transform draws exactly as today, and the clip's own framing (fill /
whole picture with blurred background, zoom, position) works inside the box unchanged; nothing is ever stretched.
`clampTransform` clamps every field; `PRESETS` = Full frame and the four corners (w 0.35, 4 % margin of the frame
width from the two nearest edges, Q4). A new overlay clip gets no `tf` (full frame); main-track clips likewise.

**§2 Tracks (engine/timeline.ts, AC-1, AC-2).** Pure functions on the track list, each returning the new list or a
reason: `addTrack(tracks, desktop)` (an empty overlay track at the top, named "Overlay N" with the lowest free N, Q12;
refused at `TRACK_LIMITS` with the message the button shows), `renameTrack` (1–40 characters), `moveTrack(id, ±1)`
(only among overlay tracks: the main track stays the bottom picture track, Q10), `deleteTrack(tracks, clips, id)`
(overlay only, with its clips). `patchTrack` lets overlay tracks mute too (Q7); the main track keeps Hide only (201 D2).
Track order in `tracks` is drawing order (bottom first), as today.

**§3 What shows at a time (engine/timeline.ts, AC-6, AC-7, AC-9).** `frameStack(p, t)` is the picture clips drawn at
`t`, bottom to top: the visible main track's clip at `t`, then each visible overlay track's clip at `t`. The main
track keeps `videoAt`'s clamp only where 201 / 202 had it (before 0; at or past the **video's** end its last clip), so
after the main track ends but before an overlay clip does, its area is black (Q9). Frame-exactness is `frameRange`'s
(a clip starting at 2.0 s first shows in frame 60). `videoAt` stays (the topmost item of the stack) for its callers.
`mostVideosAt(clips, tracks)` is the most video clips on screen at once (a sweep over clip intervals on every picture
track, hidden tracks included so unhiding can't break the limit, D3); photos don't count.

**§4 Drawing (engine/video.ts, AC-6, AC-7, AC-10).** `renderStack(ctx, W, H, items, layers, t, total, fadeOut)`, items
= `{ clip, src, sw, sh, local }[]` bottom first: black; each item with its picture; the layers; the darkness. An item
at identity draws through exactly today's call (`renderIg(ctx, src, sw, sh, edit, W, H)`), so a project without
transforms is pixel-identical (AC-10). Otherwise `save`, `globalAlpha = opacity`, `translate(x·W, y·H)`, `rotate`,
`scale(w)`, `translate(−W/2, −H/2)`, a rounded-rectangle clip (`roundRect`, `arcTo` where missing), `renderIg(…, W, H)`,
`restore`. Fades (D2): the main track clip's fade-in darkens the whole frame as today (layers included, 2.x's look);
an overlay clip's fade-in ramps its own opacity from 0 over `V_FADE`; the video's fade-out darkens everything as
today. `renderFrame` becomes `renderStack` with one item (its callers unchanged until §5 / §6 move them).

**§5 Preview (previewFrame.ts, VideoWorkspace.tsx).** `StageFrame` carries `items: { clip, local, pic }[]` instead of
one `shown` / `pic`. `pausedAt` / `pausedFrame` use `frameStack` on the export's grid and resolve every item's
picture together (photos' stills at once, videos from the pool, latest wins per lane). Playing, each tick `peek`s
every visible video (holds counted per lane as in 204). `drawPreview` calls `renderStack`. The stage's pool becomes
`poolLimits(limitsFor().videosAtOnce)` (decoders = limit + 2; the byte budget unchanged: 3 × 1080p × 5 frames ≈
124 MB of 256 MB). The paused "held picture" is kept per clip, so an overlay arriving doesn't blank the main clip.

**§6 Export (videoExport.ts, AC-6, AC-10, AC-13).** The frame loop walks frames 0…N and draws `frameStack(p, i / fps)`:
videos through the export's pool (`poolLimits(videosAtOnce)`, `maxWidth` as 204 D5), every visible video's frame
awaited together; photos decoded once per clip and released after its last frame; `want` = `lanePlan(t, 2)` (visible
and next), `prepare` for the next, `forget` once a clip has passed. A video's last frame is held past a short
source's end, per clip, as today. `framePlan` stays (tests, and AC-10's oracle: the new loop's (frame, clip, source
time) list for a project without overlays must equal what `framePlan` gives).

**§7 Sound (timeline.ts audioPlan, previewSound.ts, AC-8).** `audioPlan` adds each video clip of an overlay track that
isn't muted (hidden keeps the sound: Hide is pictures, Q7) with the same 0.03 s ramps as main-track clips; the main
track's entries and their order don't change (AC-10's identical sound sources). `soundPlan` returns `current` as a
list (every clip sounding at `t`: the main clip and each unmuted overlay clip) and `previewSound` keeps one element per
current clip; D1's bound becomes current + next + covered, still bounded by the visible-video limit.

**§8 Limits and edits (engine/edits.ts, state/video.ts, AC-3, AC-9).** `EditCtx` gains `maxVideos`; the store's
`apply` refuses an edit whose result has `mostVideosAt > maxVideos` (and more than before) with "At most N videos can
show at the same time here (the desktop app allows M)": the message names the limit and why (memory and decoding).
New pure edit `moveToTrack(clips, id, track, start, ctx)`: onto an overlay track as `moveTo` places (nearest free
spot, never overlapping); onto the main track with Magnetic on, inserted at its time's index and packed; locks checked
on both tracks. Overlay tracks are never packed (`pack` already touches only the main track, Q8). Every 202 operation
already works per track. Clip limits count every track's clips (already `state.clips.length`); the length is
`projectLength` (already every picture track, Q9).

**§9 Store actions (state/video.ts).** `addTrack`, `renameTrack`, `moveTrack`, `deleteTrack`, `setTrack` (Mute for
overlays), `addMedia(files, { track?, at? })` (overlay: at the playhead or the drop time, after the clips already there
if it doesn't fit; dropping above the top track first adds a track), `moveClipToTrack`, `setClipTransform(id, patch,
key)` (one undo step per drag via the 800 ms key coalescing), `applyPreset(id, preset)`. Each is one undo step.

**§10 Timeline UI (Timeline.tsx, AC-1–AC-3, AC-14).** The main row's clip rendering, trims, tools and drags move into a
`PictureRow` used for every picture track; rows are listed top track first (overlays above the main track), then the
layers and music rows as today. `TrackHead` for overlays: the name as a button that turns into a text field (Enter /
Escape), ↑ / ↓ buttons, Delete (a confirmation when it holds clips), Hide, Mute, Lock and the height menu. **Add track**
sits under the track headers (disabled with the reason at the limit). A clip dragged up or down onto another picture
row moves there (`moveClipToTrack`); files dropped on a row land at the drop time, above the top row in a new track.
Keyboard: the clip menu gets "Move to track…" (the picture tracks), so nothing needs a mouse.

**§11 Stage UI (VideoWorkspace.tsx, new `studio/useClipTransform.ts`, AC-5, AC-14).** A selected overlay clip (or a
main clip with a transform) shows its box with the layers' handles (`drawSelection`, `handleAt`, `rotationFor` from
`engine/layers.ts`). Layers are drawn on top, so a press goes to a layer first, then to the selected clip's box.
Move snaps the box's centre and edges to the frame's centre lines and edges within 8 screen px (`snapBox`, pure,
in engine/timeline.ts; off with the Snap switch or Alt as 202 Q4); corner handles resize keeping the aspect; the rotate
handle turns (Shift: 15° steps). Arrow keys with the stage focused move it 1 % (Shift 10 %). Each change is announced
in 202's live region ("Overlay 1 clip: x 72 %, y 20 %, size 35 %"). The inspector (ClipPanel) gets a **Position and
size** group: Full frame and the four corner presets, number fields for X, Y, size, rotation, opacity and corner
radius. Locked tracks: no box, fields disabled with the reason. Reduced motion: no animated outlines.

**§12 Project document (engine/timeline.ts, AC-11).** `DocClip.transform?: ClipTransform`, written by `toDocument` only
when not identity (so 201 / 202 documents round-trip byte-identical); `mergeProject` clamps it, keeps overlay tracks
and their clips, and the overlap rule of 202 D3 applies to every picture track (`unpacked` generalised: a clip that
overlaps another on its track moves to that clip's end, never dropped). Version stays 1 (Q11): a 2.10 reader drops the
unknown `transform` field and shows overlay clips full frame, a degraded but not misread picture.

**§13 Measurements (AC-12, AC-13).** `playbackChecks` gains the AC-12 timing (main + 2 overlay 1080p30 videos, Reel
and YouTube projects, 300 frames, median and p95; and a no-overlay project against `main`, fastest of 3) in
`CHITTHI_TEST_ONLY=pooltiming`; the Chrome figure (main + 1) is a manual run (`?selftest&only=pooltiming`). AC-13's
2-minute export with main + 2 overlays runs in the self-test with `openFrames()` 0 after it and its time recorded.

**§14 Agent tools.** None in 203 (Q14): tracks, overlay clips and transforms are plain store actions and pure functions,
which `212` exposes. Constitution XI's gap stays recorded.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/timeline.ts` | modify | §1 ClipTransform, presets, clamp; §2 track functions; §3 frameStack, mostVideosAt, snapBox; §7 audioPlan overlays; §12 document field and gate |
| `src/engine/video.ts` | modify | §4 renderStack (renderFrame = one item), overlay fade as opacity (D2) |
| `src/engine/edits.ts` | modify | §8 moveToTrack, maxVideos in EditCtx, tooManyVideos |
| `src/engine/videoExport.ts` | modify | §6 per-frame stack, pool at videosAtOnce, photos per clip |
| `src/state/video.ts` | modify | §9 track and transform actions, addMedia to a track, the limit in apply |
| `src/components/studio/previewFrame.ts` | modify | §5 StageFrame items, pausedFrame for a stack, stage pool at videosAtOnce |
| `src/components/studio/previewSound.ts` | modify | §7 several current clips |
| `src/components/studio/VideoWorkspace.tsx` | modify | §5 stage draws stacks; §11 box on the stage, Position and size in the inspector |
| `src/components/studio/useClipTransform.ts` | new | §11 pointer and keys for a clip box (layers' geometry) |
| `src/components/studio/Timeline.tsx` | modify | §10 PictureRow per picture track, overlay TrackHead, Add track, drops, drags between rows |
| `src/styles/36-media-studio.css` | modify | §10 / §11 overlay rows, header buttons, stage box |
| `src/engine/timeline.test.ts`, `src/engine/edits.test.ts`, `src/engine/timeline.testkit.test.ts`, `src/components/studio/previewSound.test.ts` | modify | unit tests (AC-1, AC-3, AC-4, AC-7–AC-11) |
| `src/dev/videoChecks.ts`, `src/dev/playbackChecks.ts`, `src/dev/poolChecks.ts` | modify | golden frames (AC-6, AC-7, AC-10), timing (AC-12), export (AC-13) |
| `e2e/editors.e2e.ts` | modify | AC-1–AC-3, AC-5, AC-9, AC-14 |
| `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `docs/PERFORMANCE.md`, `CHANGELOG.md`, in-app docs | modify | AC-15; PERFORMANCE: decoders = limit + 2 now in use |

## Data Structures & Interfaces

```ts
// engine/timeline.ts
export interface ClipTransform {
  x: number; y: number;      // box centre, share of the frame (−0.5…1.5)
  w: number;                 // box width, share of the frame width (0.05…4); the box has the frame's aspect (D1)
  rot: number;               // degrees, clockwise (−180…180)
  opacity: number;           // 0…1
  radius: number;            // 0…0.5 of the box's shorter side (Q2)
}
export const IDENTITY: ClipTransform;                          // { x: 0.5, y: 0.5, w: 1, rot: 0, opacity: 1, radius: 0 }
export type Preset = 'full' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export function presetTransform(p: Preset, W: number, H: number): ClipTransform;   // corners: w 0.35, 4 % margin
export function clampTransform(t: Partial<ClipTransform> | undefined): ClipTransform;
export const isIdentity: (t?: ClipTransform) => boolean;
export interface TimedClip extends ClipTiming { id: string; track: string; start: number; tf?: ClipTransform }

export function addTrack(tracks: Track[], desktop: boolean): { tracks: Track[]; id: string } | { error: string };
export function renameTrack(tracks: Track[], id: string, name: string): Track[] | { error: string };
export function moveTrack(tracks: Track[], id: string, by: 1 | -1): Track[] | { error: string };
export function deleteTrack<C extends TimedClip>(tracks: Track[], clips: C[], id: string): { tracks: Track[]; clips: C[] } | { error: string };

export interface StackItem<C extends TimedClip> { clip: C; local: number; track: string }
export function frameStack<C extends TimedClip>(p: Project<C>, t: number): StackItem<C>[];   // bottom first
export function mostVideosAt(clips: TimedClip[], tracks: Track[]): number;
export function snapBox(box: Box, W: number, H: number, tolerance: number): { x: number; y: number; guides: number[] };
export interface DocClip extends TimedClip { /* … */ transform?: ClipTransform }

// engine/video.ts
export interface StackDraw { clip: FrameClip & { tf?: ClipTransform; overlay: boolean }; src: CanvasImageSource | null; sw: number; sh: number; local: number }
export function renderStack(ctx: CanvasRenderingContext2D, W: number, H: number, items: StackDraw[],
  layers: Layer[], t: number, total: number, fadeOut: boolean): void;   // renderFrame = renderStack with one item

// engine/edits.ts
export interface EditCtx { maxLength: number; locked(track: string): string | null; maxVideos: number }
export function moveToTrack<C extends EditClip>(clips: C[], id: string, track: string, start: number, ctx: EditCtx & { magnetic: boolean }): Edit<C>;
export const tooManyVideos: (n: number, desktop: boolean) => string;

// components/studio/previewFrame.ts
export interface StageFrame<C extends FrameClip = FrameClip> { at: number; items: { clip: C; local: number; pic: Picture | null }[] }

// components/studio/previewSound.ts
export function soundPlan<C extends TimedClip>(p: Project<C>, t: number, ahead?: number):
  { current: { clip: C; local: number }[]; next: C[]; held: C[] };

// state/video.ts (each one undo step; errors returned as the message to show)
addTrack(): string | null; renameTrack(id, name): string | null; moveTrack(id, by): string | null; deleteTrack(id): string | null;
addMedia(files, o?: { track?: string; at?: number }): Promise<string[]>;
moveClipToTrack(id, track, start?): string | null;
setClipTransform(id, patch: Partial<ClipTransform>, key?): string | null; applyPreset(id, preset: Preset): string | null;
```

## Techniques

- **Canvas transforms around the existing draw.** `renderIg` draws into the context it is given at (0, 0, W, H), so
  the transform is a `save` / `translate` / `rotate` / `scale` / clip / `restore` around today's call: no second
  renderer, one path for preview and export (Constitution VIII). Whether the whole-picture framing's blurred
  background (a canvas `filter`) and the GPU-drawn looks behave under a transformed, clipped context is checked first
  (spike T001).
- **Identity is a fast path, not a special case of maths.** An item without `tf` (or at identity) calls exactly
  today's code, so AC-10's pixel equality is structural, then proven on 201's fixtures.
- **`roundRect`** (Chromium 99, Safari 16, Firefox 112) with an `arcTo` path where missing; radius 0 skips the clip.
- **A sweep for the videos-at-once limit:** sort the video clips' start / end events, count, keep the maximum (O(n log
  n), cheap at 500 clips); run on every edit's result.
- **Reuse the layers' geometry** (`Box`, `handleAt`, `rotationFor`, `drawSelection`) so overlay boxes handle like
  layers; snapping is a pure function so it is unit-tested.
- **Every visible video awaited together** in the export (`Promise.all` on the pool's lanes), so two videos decode in
  parallel; the pool's latest-wins and byte budget hold as in 204.
- **Performance:** one extra `save`/`restore` and clip per overlay item; a project with no overlays runs the same code
  as today (AC-12's 5 % check).

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `src/engine/timeline.test.ts` (addTrack names and limits, renameTrack, moveTrack among overlays only, deleteTrack with clips; main track fixed); `e2e/editors.e2e.ts` (add, rename, move, delete with confirmation, the limit message; each an undo step) | unit + e2e |
| AC-2 | `e2e/editors.e2e.ts` (overlay header: Hide not drawn, Mute silent, Lock refuses timeline and stage edits, height) | e2e |
| AC-3 | `src/engine/edits.test.ts` (moveToTrack both ways, never overlapping, locks; every 202 op on an overlay track, never packed); `e2e/editors.e2e.ts` (add at playhead, drop on a row, drop above the top row, drag between rows) | unit + e2e |
| AC-4 | `src/engine/timeline.test.ts` (IDENTITY, clampTransform ranges, presets at 9:16 and 16:9, new clips untransformed) | unit |
| AC-5 | `e2e/editors.e2e.ts` (drag, resize, rotate on the stage; snap on / off / Alt; number fields; arrows ±1 % / ±10 %; one undo step per drag; the announcement) + `snapBox` unit tests | e2e + unit |
| AC-6 | `src/dev/videoChecks.ts` (golden frames: main + 2 overlays fixture at 9:16 and 16:9, 8 times, against references on every backend; export frames equal preview frames from the same inputs) | self-test |
| AC-7 | `src/engine/timeline.test.ts` (frameStack: first frame 60, gone after the last; hidden and 0 % draw nothing); self-test (a full-frame opaque overlay leaves no main-clip pixel) | unit + self-test |
| AC-8 | `src/engine/timeline.test.ts` (audioPlan with overlays equals the expected list; muted adds nothing; hidden keeps sound); `previewSound.test.ts` (several current clips); self-test (export sound sources) | unit + self-test |
| AC-9 | `src/engine/timeline.test.ts` (projectLength across tracks; mostVideosAt); `edits.test.ts` (an edit over the limit refused, message); `e2e/editors.e2e.ts` (the refusal shown) | unit + e2e |
| AC-10 | `src/engine/timeline.testkit.test.ts` (201 / 202 fixtures: frameStack = videoAt, export inputs = framePlan's, sound sources unchanged); self-test (pixel-identical preview frames at 10 times on every 201 fixture); every existing video e2e unchanged | unit + self-test + e2e |
| AC-11 | `src/engine/timeline.test.ts` (30+ malformed documents: transform clamping, missing tracks, overlaps moved, limits, never throws; round trip of the AC-6 fixture; 202 documents byte-identical) | unit |
| AC-12 | `src/dev/playbackChecks.ts` (`CHITTHI_TEST_ONLY=pooltiming`: main + 2 overlays, Reel and YouTube, median ≤ 33 ms; no overlays within 5 % of `main`); Chrome main + 1 by hand (T0xx 👤) | self-test timing |
| AC-13 | `src/dev/poolChecks.ts` or `videoChecks.ts` (2-minute 1080p main + 2 overlays export, desktop; `openFrames()` 0; time recorded); web by hand | self-test |
| AC-14 | `e2e/editors.e2e.ts` (keyboard-only: tracks, overlay clip, every transform field; axe on timeline + inspector; 360 px no sideways scroll; reduced motion) | e2e + axe |
| AC-15 | Docs review (MEDIA-STUDIO, lld, CHANGELOG, in-app keys) | manual |

## Risks & Mitigations

- `renderIg` under a transformed, clipped context: the whole-picture framing's blurred background (`filter`) and GPU-drawn looks may ignore the transform or the clip, or cost more. → Spike T001 first: a rotated, rounded, 35 % box with each framing mode and a look, preview and export, on every backend; if one fails, draw that item into an offscreen canvas of the box's size and place that (still one path).
- AC-10 regressions while the main row, the stage frame and the export loop are rewritten. → Identity fast path; the testkit oracles (`videoAt`, `framePlan`, `audioPlan` of 201 / 202) compared on every fixture before any UI work; all existing video e2e tests run unchanged after each UI task.
- Several 1080p videos at once on the web (3) within 33 ms. 204 measured the pool far under the bar (p95 ≤ 5.7 ms for 6), but drawing transformed, clipped frames adds GPU work. → AC-12 timing early (right after the preview task); if over, lower the web limit by Q2's rule, recorded in the spec.
- Memory: the stage pool at videosAtOnce + 2 decoders (7 on desktop) with 4K sources: 5 × 4K × 5 frames ≈ 830 MB, under the 1 GB budget; `makeRoom` drops read-ahead first (204). → AC-13 records peak bytes; 4K proxies are `211`.
- Timeline complexity: drag between rows, drops above the top row and the overlay header add pointer paths to a large component. → `PictureRow` extracted first behaviour-neutral (main track only, all e2e green), then overlays.
- Hit-testing on the stage: layers and clip boxes overlap. → Layers first (drawn on top), then the selected clip, then the topmost clip under the pointer (a click selects it); e2e covers each.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Approved spec; Q6's desktop number updated to 204's measurement (5) in the spec's changelog with this plan. |
| II. Test-gated delivery | ✅ | Test-first for every pure function (§1–§4, §7, §8, §12); self-test for drawing; e2e for UI; a test per AC. |
| III. Small dependencies | ✅ | No new dependency. |
| IV. Memory maintained | ✅ | Decisions D1–D3 to decisions.md on approval; progress per session. |
| V. Free and open source | ✅ | Same features on web and desktop; fewer tracks / videos on the web for memory only, said in the editor. |
| VI. On device, no backend | ✅ | Nothing leaves the device. |
| VII. Permissive licences | ✅ | No new component. |
| VIII. WYSIWYG, one code path | ✅ | `renderStack` for preview and export; the document gate clamps transforms; edits non-destructive. |
| IX. Secure desktop shell | ✅ | No IPC change. |
| X. Budgets and accessibility | ✅ | No entry-chunk growth expected (the studio is lazy); AC-14; memory within 204's pool budgets. |
| XI. Agents use the same code | ⚠️ | No tools in 203 (Q14); plain actions and pure functions so `212` exposes them. The gap stays recorded. |

## Decisions for the maintainer (accepted 2026-10-11: D1–D3 as recommended)

- **D1 — The box's shape.** _Recommended:_ the box has the **frame's** aspect ratio; the clip's own framing (fill,
  or whole picture with blurred background) decides what shows inside, as it does today for the full frame. Identity =
  today's look (AC-10 by construction), one model for main and overlay clips. _Alternative:_ the box takes the clip's
  own aspect (a 16:9 face-cam in a 9:16 Reel is a 16:9 box, nothing cropped), but Full frame then needs its own fill
  rule and main clips change model. With D1, a 16:9 face-cam in a corner shows cropped until its framing is set to
  "whole picture"; the corner preset could set that for videos whose aspect differs from the frame's.
- **D2 — Fade-in on an overlay clip.** _Recommended:_ it fades the clip in (opacity 0 → its opacity over 0.5 s); the
  main clip's fade-in keeps darkening the whole frame from black as today.
- **D3 — What the videos-at-once limit counts.** _Recommended:_ video clips on every picture track, hidden tracks
  included, so unhiding a track can never exceed it; photos don't count (Q6).
- **Q6's number.** The desktop limit is **5** (204's measurement by Q2's rule), not the proposed 6; the web stays 3.
