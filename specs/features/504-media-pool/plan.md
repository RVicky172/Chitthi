<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 504 — Media pool for Reels and YouTube · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (D1–D5 A; 2026-10-20, D-069) <!-- Draft | Approved -->

## Approach

Today a file exists in a video project only as the clips and sound clips that use it: `addMedia` (`state/videoMedia.ts`) reads files into clips and places them in one go, `addSoundFiles` (`state/videoSound.ts`) does the same for sound, and the saved document lists each file once in `media` (`engine/projectDoc.ts`), only when something uses it. The Media panel (`studio/VideoPanels.tsx`) is a drop zone. 504 gives files a life of their own in the project.

**§1 The pool in the store (AC-1).** `VState` gains `pool: PoolItem[]`: the files imported into the project that no clip may use yet. The pool the user sees is derived, never kept in step by hand: `poolOf(state)` (a selector) is every `pool` item plus one item for each file a clip or sound clip uses that isn't there, keyed by the file's URL (its media id in the editor, D-053), so files added by dropping on the timeline, by the empty stage's button, by recording (209) or by opening an older project are in it without each path knowing. `pool` is part of `Snap`, so an import and a removal are undone like any edit (D2).

**§2 Reading and placing split.** `addMedia` becomes two steps: `readMedia(files)` turns files into pool items (the size and type checks, the thumbnail and filmstrip, the sound scan and `keepMedia`, as today) and `placeMedia(items, place)` turns items into clips with today's placement rules (append, insert, place; the limits; videos at once). `addMedia` = read + place, so the timeline's drop and the empty stage's **Add videos or photos** keep placing files (Q1). The Media panel's drop zone, its **Choose videos, photos or sound** button and **Use the photos from Photos** call `importToPool` = read only (one undo step). Sound files go through the same split (`readSound` / `placeSound` from `addSoundFiles`).

**§3 Memory.** A pool item holds what the list shows and what a clip needs that is cheap: name, file, URL, kind, size, length, a 160 px thumbnail, a video's filmstrip; never a photo's 1080 px preview copy (200 photos would hold ~900 MB). A photo item is read again (`mediaIO.photo`, through `blobOf` for disk media) when it is placed, so placing a photo from the pool is async; videos and sounds place at once.

**§4 Saved with the project (AC-1).** `videoDocument` lists the pool's unused files after the clips', sounds' and images' (`media` already holds one entry per file, so the document's shape doesn't change: an unused entry is simply one no clip names). `videoFromDocument` returns the entries no clip, sound or image layer uses as `pool`; `openVideo` (`state/projects.ts`) opens them like the others (their thumbnails and strips from the cache, which `videoCache` now writes for pool videos too; photos' thumbnails made again; sounds' scans from the cache). `editorMediaIds` counts pool files, so deleting another project never sweeps an unused pool file in the browser. Recordings: a take's media entry gains `recorded: true` (D3), read by the gate (`readMedia` in `engine/projectGate.ts`) and carried on the editor's `VSound` and pool item.

**§5 The list (AC-2).** The Media panel becomes the pool: the import row stays above (503 D1), then filter chips **All · Video · Photo · Sound · Recordings**, a search field, and the items as `ListRow`s (501): a thumbnail (the video's thumbnail, the photo, or a waveform drawn from the sound's scan, 208 cache), the name, the length (video, sound), the kind and the use count ("Used 2×" / "Not used"), and the add and remove buttons. Filtering, searching, counting and the length text are pure (`components/studio/mediaPool.ts`). An empty pool shows `EmptyState`; a filter with no match says so. The list scrolls inside the panel; at 200 items it renders every row (no virtual list: a row is a 48 px image and text), checked in 590 (AC-5).

**§6 Adding from the pool (AC-3).** `addFromPool(id, place)`: a video or photo goes on the main video track, a sound on a sound track of its kind (a recording on a Voice track, another sound on the Music track, made if missing, as `addSound` does), each one undo step with the messages of today's limits. Where: **double-click** or **Enter** on a row, and the row's add button, put it at the playhead (D1); **dragging** a row onto the timeline puts it on the row and time dropped, through the timeline's existing drop marker: the row's drag carries `application/x-chitthi-pool` with the item's id, and `Timeline.tsx`'s `onFilesOver` / `onFilesDrop` accept it beside files (a picture on a sound row, or sound on a picture row, is refused with today's "Photos and videos go on a picture track." and its sound twin).

**§7 Tidying (AC-4).** The row's remove button takes an unused item out of `pool` (one undo step). A used item asks first (`confirm`, as Clear batch does) listing where it is used ("Clip 2 on Video, Clip 1 on Overlay 1, a sound on Music 1", from `clipPlace` / the track names); confirmed, the item and every clip and sound clip using it go in one undo step (D4). A missing file's row shows **Find file…** (`FindFileButton`, 408), which relinks every clip using it.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/state/videoStore.ts` | modify | `PoolItem`, `pool` in the state and in `Snap`, `poolOf`, `usesOf`; `loadVideoProject` takes a pool (§1) |
| `src/state/videoMedia.ts`, `src/state/videoSound.ts` | modify | `addMedia` / `addSoundFiles` split into read and place; reading gives pool items (§2, §3) |
| `src/state/videoPool.ts` | new | `importToPool`, `addFromPool`, `removeFromPool` (§2, §6, §7) |
| `src/state/voiceRecorder.ts`, `src/state/videoSound.ts` (`addTake`) | modify | A take's sound is marked `recorded` (§4, D3) |
| `src/engine/projectDoc.ts`, `src/engine/projectGate.ts` | modify | Unused pool files in `media`, `pool` from a document, `recorded` (§4) |
| `src/state/projectSave.ts`, `src/state/projects.ts` | modify | Save the pool's files and their cache; open the pool; `editorMediaIds` counts it (§4) |
| `src/components/studio/mediaPool.ts` | new | Filter, search, use counts, the row's detail text (§5, AC-2) |
| `src/components/studio/VideoPanels.tsx`, `src/components/studio/MediaPool.tsx` (new), `src/styles/36-media-studio.css` | modify / new | The Media panel as the pool: import row, filters, search, rows (`ListRow`), drag, keys, remove, Find file… (§5–§7) |
| `src/components/studio/Timeline.tsx` | modify | Accept a pool item dropped on a row, with the drop marker (§6) |
| `tests/integration/state/videoPool.test.ts`, `tests/unit/components/studio/mediaPool.test.ts`, `tests/unit/engine/projectDoc.test.ts`, `tests/unit/engine/projectGate.test.ts` | new / modify | AC-1–AC-4 |
| `docs/MEDIA-STUDIO.md`, `docs/DESIGN.md` (panel map), `specs/lld.md`, `CHANGELOG.md` | modify | The pool for users; the panel map; the store and document |

## Data Structures & Interfaces

```ts
// state/videoStore.ts
/** A file in the project's media pool (504): what the list shows and what placing it needs. */
export interface PoolItem {
  /** The file's URL: its media id in the editor (D-053), shared with the clips that use it. */
  url: string;
  kind: 'video' | 'photo' | 'audio';
  name: string;
  file: MediaFile;
  /** Pixels (0 for sound). */
  w: number;
  h: number;
  /** Seconds (0 for photos). */
  srcDur: number;
  /** 160 px JPEG (pictures); '' for sound, drawn from its scan. */
  thumb: string;
  /** A video's filmstrip. */
  strip: string[];
  /** A voice take recorded in the app (209). */
  recorded?: true;
}
interface VState { /* … */ pool: PoolItem[] }
interface Snap { /* … */ pool: PoolItem[] }
export function poolOf(video: VState): PoolItem[];          // pool ∪ files in use, by url
export function usesOf(video: VState, url: string): Use[];   // the clips and sound clips using a file

// state/videoPool.ts (new)
export async function importToPool(files: File[]): Promise<string[]>;            // messages
export async function addFromPool(url: string, place?: PoolPlace): Promise<string[]>;
export function removeFromPool(url: string): void;                               // with its uses, one step
export interface PoolPlace { track?: string; at?: number }                       // default: the playhead

// components/studio/mediaPool.ts (new, pure)
export type PoolFilter = 'all' | 'video' | 'photo' | 'sound' | 'recordings';
export function filterPool(items: readonly PoolItem[], filter: PoolFilter, query: string): PoolItem[];
export function useCounts(video: VState): Map<string, number>;
export function poolDetail(item: PoolItem, uses: number): string;             // "0:12 · Video · Used 2×"

// engine/projectDoc.ts
interface DocMedia { /* … */ recorded?: true }
interface EditorVideo<F> { /* … */ pool: EditorPoolItem<F>[] }
```

The document's shape is unchanged apart from the optional `recorded`: an unused file is a `media` entry nothing names. A project from before 504 opens with an empty `pool` (its files are all in use, so the derived pool shows them).

## Techniques

- **Derived, not synchronised:** the visible pool is `pool` ∪ files in use, so no add, delete, undo or open path has to keep a second list in step; removing an unused item is the only write that needs `pool` alone.
- **Read once, place many:** reading a file (decode, thumbnail, filmstrip, scan, keep) is separated from placing it, so a pool item placed five times is read once (a photo's preview copy excepted, §3).
- **Drag data type:** the pool's drag uses its own MIME type, so the timeline tells a pool item from files and other drags; the item's URL is the payload, looked up again on drop (a removed item drops nothing).
- **Stand-ins for media:** tests use `mediaIO` / `soundIO` stand-ins as today (Node decodes no media).

## Test Approach

| AC | Test | Kind |
| --- | --- | --- |
| AC-1 | `tests/integration/state/videoPool.test.ts`: importing puts files in the pool and not on the timeline; `addMedia` (timeline drop, stage button) still places and the file is in the pool; a recorded take is in the pool as a recording; undo of an import. `tests/unit/engine/projectDoc.test.ts`: an unused pool file is listed in `media` and comes back as `pool`; `recorded` round-trips; a document from before 504 opens with an empty pool. `tests/unit/engine/projectGate.test.ts`: `recorded` kept, a wrong value dropped | unit |
| AC-2 | `tests/unit/components/studio/mediaPool.test.ts`: `filterPool` by each filter and by name (case-insensitive, accents as typed), `useCounts`, `poolDetail` (lengths, kinds, "Not used") | unit |
| AC-3 | `videoPool.test.ts`: a video and a photo go on the main track at the playhead, a sound on Music, a recording on Voice, each one undo step; a given track and time (the drop); a sound on a picture track refused; the limits' messages | unit |
| AC-4 | `videoPool.test.ts`: removing an unused item is one undo step; `usesOf` lists the clips and sounds; removing a used item takes its clips and sounds with it in one step, undo brings all back | unit |
| AC-5 | Dragging a row onto the timeline places it where dropped; 200 items scroll without delay | e2e (590) |

## Risks & Mitigations

- **Splitting `addMedia` changes how the timeline's drop and the stage's button place files** (many 203/207 tests cover them). Mitigation: `addMedia` keeps its signature and messages and becomes read + place; the existing `videoMedia` tests run unchanged and must pass before the pool uses the parts.
- **Memory with many photos in the pool.** Mitigation: §3, pool items keep only a 160 px thumbnail; the preview copy is made when a photo is placed, as today.
- **The derived pool and the saved one disagree** (a file both in `pool` and used, or a clip's file not listed). Mitigation: `poolOf` dedupes by URL; `videoDocument` lists each file once whatever lists it; a test saves and reopens a project with used, unused and recorded files.
- **A browser sweep deletes an unused pool file's stored copy.** Mitigation: `editorMediaIds` includes `pool`, and saved documents list unused files in `media`, which `mediaInUse` already reads.
- **Removing a used item by mistake.** Mitigation: it asks first and names the uses (D4), and it is one undo step.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec Approved 2026-10-20; this plan waits for D1–D5. |
| II. Test-Gated Delivery | ✅ | AC-1–AC-4 unit tests, test-first; AC-5 deferred to 590 (already listed there). |
| III. Simplicity and Small Dependencies | ✅ | No new dependency; the pool is derived from the clips plus one list. |
| IV. Memory Is Maintained | ✅ | D1–D5 into `memory/decisions.md` when chosen. |
| V. Free and Open Source | ✅ | Same on web and desktop. |
| VI. On the User's Device | ✅ | No network; files stay where 408 keeps them. |
| VII. Permissive Licences Only | ✅ | Nothing new. |
| VIII. What You See Is What You Get | ✅ | Preview and export unchanged; documents still go through the gate (one optional field). |
| IX. Secure Desktop Shell | ✅ | No `electron/` changes; disk media read as today. |
| X. Budgets and Accessibility | ✅ | Pool code in the studio's lazy chunk; rows are buttons with Enter, the drag has a keyboard twin; 200-item scroll in 590. |
| XI. Agents Use the Same Code | ⚠️ | The video editor has no agent tools yet (pre-existing); D5 asks whether the pool's come now or with the video tools feature. |

## Decisions for the maintainer

_Chosen (the maintainer, 2026-10-20): A for all five (D-069)._

**D1 Where the add button and Enter put an item.** The spec's summary says "at the playhead or at the end". **A (recommended)** double-click, Enter and the add button all put it at the playhead (AC-3); the playhead is where the user is working, and one rule is easy to learn. **B** Enter and double-click at the playhead, the add button at the end of the main track (as importing did before 504).

**D2 Is importing into the pool an undo step?** **A (recommended)** yes: Ctrl + Z takes back an import like any change, and a removal (AC-4) is one anyway. **B** no: only removals are undone; an import stays until removed.

**D3 How recordings are told apart.** **A (recommended)** the take's media entry is saved with `recorded: true` (one optional field the gate reads); takes recorded before 504 show under Sound, not Recordings. **B** no new field: a sound whose file the app recorded is found by its name pattern ("Voice 1 take 3"), which a renamed file breaks.

**D4 Removing a used item.** **A (recommended)** ask, listing where it is used, then remove the item and its clips and sound clips in one undo step (AC-4's "asks first"). **B** refuse while it is used ("Delete its clips first") and remove only unused items.

**D5 Agent tools.** The video editor has no agent tools yet (Principle XI: none of 201–209 added one). **A (recommended)** none in 504 either; the video editor's tools are a feature of their own (to put on the roadmap), so the pool's list / add / remove join them there. **B** add `list_media_pool`, `add_from_pool`, `remove_from_pool` now, the first video tools.
