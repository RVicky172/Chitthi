<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 408 — Saved photo and video projects · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-19, D1–D6 as recommended, D-059) <!-- Draft | Approved -->

## Approach

Half the work exists: the video project already has a JSON shape (`engine/projectDoc.ts`, `toDocument`) and one validator (`engine/projectGate.ts`, `mergeProject`), and the photo edits and layers have theirs (`mergeEdit`, `mergeLayers`). Nothing writes or reads them: `VState` and `IgState` live in memory, each clip, sound and photo holding a `Blob` from the file picker. 408 adds (a) the conversions between the stores and the documents, (b) one **project library** interface with two implementations, browser and desktop, chosen once in `lib/` as `lib/db.ts` already does for the print gallery, (c) a **media store** behind the same split, (d) autosave and the Projects panel. Under D-033 every task is proven by unit tests (pure conversions and gates, the library against an in-memory implementation, the Electron handlers in `tests/unit/electron`); e2e, self-test and timing go to 290.

**§1 Documents (`engine/projectDoc.ts`, new `engine/photoProjectDoc.ts`, AC-2, AC-6).** `videoDocument(state)` builds a `ProjectDoc` from `VState` (each `VClip` / `VSound` → `DocClip` / `DocAudio` with a media id, `DocMedia` for each file) plus the fields the document lacks today: `name`, `playhead`, `trackView`; `videoFromDocument(doc, media)` is the reverse, after `mergeProject`. The photo batch gets the same pair: `PhotoProjectDoc { version: 1, name, format, limit, fileType, quality, caption, selected, items: { id, name, media, w, h, edit, layers, raw? }[], media: DocMedia[] }` and `mergePhotoProject(raw)` (each item through `mergeEdit` and `mergeLayers`, unknown or newer versions handled as `mergeProject` does: what's valid opens, reasons listed). Both are pure, so AC-2's round trip (document → store → document identical; 201–208 fixtures) is a unit test.

**§2 Media ids and fingerprints (`engine/mediaKey.ts`, AC-4).** A file's media id is its fingerprint: size + type + an FNV-1a hash of its first and last 64 KB (as `lib/photoKey.ts` does for data URLs), read with `Blob.slice` so a 4 GB file costs 128 KB of reading. The same file added twice or in two projects has one id and is stored once. A collision would need the same size, type and 128 KB of ends; D3 offers a full hash instead.

**§3 The project library (`lib/projects.ts`, `lib/projectsWeb.ts`, `lib/projectsDesktop.ts`, AC-3, AC-7, AC-9).** One interface, `ProjectLibrary`: `list()` (entries: id, studio, name, kind, length or photo count, changed, bytes, thumbnail, readable), `read(id)`, `write(id, doc, entry)`, `writeCache(id, cache)`, `readCache(id)`, `remove(id)` (removes media no other project uses and returns the bytes freed), `usage()`. `lib/projectLibrary.ts` exports `projects = desktop ? desktopProjects(desktop.projects) : webProjects()` (its own module: the implementations import the shared helpers of `lib/projects.ts`), and an in-memory implementation used by every unit test. The **cache** is what's slow to rebuild and small: clip thumbnails, filmstrips, photo preview JPEGs, waveform peaks (Q14), written only when it changes.
- **Browser (`projectsWeb.ts`):** IndexedDB database `chitthi-projects` (its own, so the print `chitthi` database's version doesn't move, D5) with stores `entries`, `docs`, `cache`; each write is one transaction, so a save is all or nothing (AC-1).
- **Desktop (`projectsDesktop.ts` → IPC → `electron/projects.cjs`):** `library/projects/<id>.json` (the document), `<id>.entry.json`, `<id>.cache.json`, each written to `<name>.tmp` and renamed over the old one, so an interrupted save leaves the last complete file (AC-1).

**§4 The media store (`lib/mediaStore.ts`, `lib/mediaWeb.ts`, `lib/mediaDesktop.ts`, AC-4, AC-5, AC-7).** `MediaStore`: `keep(file, owned)` (returns the media id; runs in the background with progress), `open(id)` (a `MediaFile` to play and decode, or `missing`), `relink(id)`, `sweep(usedIds)`, `usage()`.
- **Browser (`mediaWeb.ts`, D2):** each file is copied into the Origin Private File System, `media/<id>`, streamed (`file.stream()` into a writable, in a worker with a sync access handle where the main-thread writable is missing, Safari), so a 4 GB video never sits in memory. Reopened, `getFile()` gives a disk-backed `File`: the existing Blob code (Mediabunny's `BlobSource`, `<video>` from an object URL) works unchanged. Before copying, `navigator.storage.estimate()` is checked and a file that doesn't fit is refused with the space left (AC-4); `navigator.storage.persist()` is asked once, and its answer shown (AC-4).
- **Desktop (`mediaDesktop.ts` → IPC → `electron/media.cjs`, D1):** a file the user added isn't copied. The preload turns the picked `File` into its path (`webUtils.getPathForFile`, so the page can only name files the user actually picked or dropped), and the main process records `id → { path, size, mtime }` in `library/media-index.json`, which **only the main process writes**; the page refers to media by id only, never by path. App-made files (209's recordings, generated music, AI images, Pexels downloads, pasted images: `keep(file, true)`) are written into `library/media/<id>` through the existing chunked write pattern. Playing and decoding go through a privileged scheme `chitthi-media://<id>` served by the main process with `Range` support from the indexed path; it answers only for ids in the index whose file still has the recorded size and mtime (else 404, and the clip is missing). **Find file…** is a main-process open dialog: the chosen file is checked (kind, length via the page after it plays) and replaces the index entry; other missing ids whose file name exists in the chosen folder are reconnected at once (AC-5).

**§5 Media in the stores (`engine/mediaFile.ts`, the decode sites, AC-2, AC-5).** `VClip.file`, `VSound.file` and `IgItem.file` become `MediaFile = Blob | DiskMedia` (`DiskMedia { id, url, size, type, name }`, desktop only). One helper, `mediaInput(file)`, returns Mediabunny's `BlobSource` for a Blob and its `UrlSource` (range requests) for disk media; the 14 decode sites (`frameSource`, `decodePool`, `poolLane`, `exportSound`, `soundScan.worker`, `videoExport`, `instagramExport`, previews …) call it instead of `new BlobSource(file)`. `<video>` / `<audio>` already play `url` (an object URL today, `chitthi-media://` for disk media). Photos are small: `blobOf(file)` fetches disk media once into a Blob for `createImageBitmap`. A missing file (`missing: true`) draws a hatched placeholder with its name in the preview, and the export is refused with “Find the missing files first: …” (D4).

**§6 Autosave (`state/projectSave.ts`, AC-1, AC-9).** Subscribes to both stores; a change that alters the document (not the playhead during play, selections or view state; `trackView` and the playhead are written with the next real save or on hide) schedules a save 2 s after the last one, and `visibilitychange` → hidden, `pagehide` and the desktop window's close (`before-quit` waits for a `flush()` over IPC, at most 2 s) save at once. Saving serialises with `videoDocument` / photo document and `JSON.stringify` (under 50 ms for 500 clips, measured in 290, AC-10) and calls `projects.write`. Status for the top bar: `saved | saving | failed(reason)`; a failure (quota, disk full) keeps the project in memory, says “Not saved: …”, logs with `logError('handled', …)` and retries on the next change or every 30 s (AC-9). Media is kept (§4) when it is added, before the save that references it.

**§7 Opening, new, current project (`state/projects.ts`, AC-3).** `openProject(id)`: read, gate (`mergeProject` / `mergePhotoProject`), `media.open` each id, then `loadVideoProject` (extended with the settings it doesn't take today: format, fps, quality, kind, fadeOut, playhead, name) or the photo equivalent, rebuilding previews from the cache or the file. The route follows the project's kind (a YouTube project opens `#/instagram/youtube`, D6). `newProject(studio, kind)` names it “Reel · 19 Oct 14:02”. The last project per studio is remembered in `localStorage` (`chitthi-projects-last`); opening a studio reopens it, else starts a new one. Rename (1–80 characters), duplicate (the document and cache copied; media shared by id) and delete (AC-7) go through the library.

**§8 One editor at a time (`lib/projectLock.ts`, AC-8).** A `BroadcastChannel('chitthi-projects')`: opening a project posts `{ open: id, by }`; a tab or window holding that id stops saving at once, shows “This project is open in another window” with **Open here again** (which posts the same and reloads the project from storage). Works across browser tabs and across Electron windows (same origin).

**§9 The UI (`components/studio/ProjectsPanel.tsx`, `Shell.tsx`, home, AC-3, AC-9, AC-11).** A **Projects** button at the left of the studio top bar (both studios, Q6) opens a lazy-loaded panel: New (with the kind for video), the list (thumbnail, name, kind, length or photos, changed, size; newest first), Open, Rename (F2), Duplicate, Delete (asks, showing the space freed), storage used and allowed, the persistent-storage note, and “can't be opened” entries with Delete only (AC-6). Arrow keys move, Enter opens; actions are announced. The top bar shows the save status (a polite live region that speaks only on failure). The home screen gets **Continue: <name>** for the most recent project. Missing files list with **Find file…** in the clip's inspector and in a bar over the timeline (desktop).

**§10 Agent tools (`src/agent/projectTools.ts`, AC-13).** `list_projects`, `new_project`, `open_project`, `rename_project`, `delete_project` (`confirm: true` required), calling `state/projects.ts`; registered in `tools.ts`; self-test checks and `test:mcp` steps written in 290.

**§11 Docs (AC-14).** `docs/MEDIA-STUDIO.md`, `docs/DESKTOP.md` (the table: projects and media rows; `projects/`, `media/`, `media-index.json`), `docs/TROUBLESHOOTING.md`, `specs/architecture.md` §6 and §7 (the media scheme), `specs/lld.md`, `docs/MCP.md`, `CHANGELOG.md`, in-app docs.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/projectDoc.ts`, `tests/unit/engine/projectDoc.test.ts` | modify | §1: `name`, `playhead`, `trackView` in the document; `videoDocument` / `videoFromDocument` (AC-2) |
| `src/engine/projectGate.ts`, `tests/unit/engine/projectGate.test.ts` | modify | §1: read the new fields; unreadable / newer documents (AC-6) |
| `src/engine/photoProjectDoc.ts`, `tests/unit/engine/photoProjectDoc.test.ts` | new | §1: the photo project document and `mergePhotoProject` (AC-2, AC-6) |
| `src/engine/mediaKey.ts`, `tests/unit/engine/mediaKey.test.ts` | new | §2: media ids from fingerprints (AC-4) |
| `src/engine/mediaFile.ts`, `tests/unit/engine/mediaFile.test.ts` | new | §5: `MediaFile`, `mediaInput`, `blobOf`, missing media |
| `src/engine/frameSource.ts`, `decodePool.ts`, `poolLane.ts`, `exportSound.ts`, `videoExport.ts`; `src/state/soundScan.worker.ts`, `videoMedia.ts`, `videoSound.ts`, `videoExportJob.ts`, `instagramExport.ts`, `instagramMedia.ts`; `src/components/studio/previewFrame.ts`, `VideoStage.tsx`, `PictureRow.tsx`, `ClipInspector.tsx` | modify | §5: decode through `mediaInput`; keep media when added; missing placeholder; export refused while files are missing (D4) |
| `src/lib/projects.ts`, `projectsWeb.ts`, `projectsDesktop.ts`, `tests/unit/lib/projects.test.ts` | new | §3: the project library, browser and desktop, and the in-memory one for tests (AC-3, AC-7, AC-9) |
| `src/lib/mediaStore.ts`, `mediaWeb.ts`, `mediaWeb.worker.ts`, `mediaDesktop.ts`, `tests/unit/lib/mediaStore.test.ts` | new | §4: media kept once, OPFS in the browser, referenced on desktop; quota checks; sweep (AC-4, AC-5, AC-7) |
| `src/lib/projectLock.ts`, `tests/unit/lib/projectLock.test.ts` | new | §8: one editor per project (AC-8) |
| `src/state/projects.ts`, `src/state/projectSave.ts`, `tests/integration/state/projects.test.ts` | new | §6, §7: autosave, open / new / rename / duplicate / delete, the current project (AC-1–AC-3, AC-7, AC-9) |
| `src/state/videoStore.ts`, `src/state/instagram.ts` | modify | §5, §7: `MediaFile` in clips, sounds and photos; loading every saved setting; the project name |
| `src/platform/desktop.ts`, `electron/preload.cjs` | modify | §3, §4: `projects` and `media` on the bridge; `getPathForFile` in the preload |
| `electron/projects.cjs`, `electron/media.cjs`, `tests/unit/electron/projects.test.ts`, `tests/unit/electron/media.test.ts` | new | §3, §4: project files with atomic writes; the media index (main-written only), app-made media, the `chitthi-media://` scheme with Range, Find file… (AC-1, AC-5, AC-7) |
| `electron/main.cjs`, `electron-builder.yml` | modify | Register the scheme and the handlers (through `electron/ipc.cjs`); CSP `media-src` / `connect-src` gain `chitthi-media:`; flush on quit; new files in `files:` |
| `src/components/studio/ProjectsPanel.tsx`, `Shell.tsx`, the home screen, `src/styles/` (a new numbered file at the end) | new / modify | §9: Projects button and panel, save status, Continue link, Find file… (AC-3, AC-9, AC-11) |
| `src/agent/projectTools.ts`, `src/agent/tools.ts` | new / modify | §10 (AC-13) |
| Docs (§11); `specs/features/290-phase2-test-pass-release/feature.json` | modify | AC-14; 408's deferred checks: e2e (AC-11, AC-12), self-test and MCP (AC-13), timing (AC-10) |

## Data Structures & Interfaces

```ts
// engine/projectDoc.ts (version stays 1: the new fields are optional, missing = today's defaults)
export interface ProjectDoc extends Project<DocClip> { /* … as today … */ name?: string; playhead?: number; trackView?: Record<string, TrackHeight> }
export function videoDocument(video: VState, name: string): { doc: ProjectDoc; files: Map<string, MediaFile> };
export function videoFromDocument(doc: ProjectDoc, media: Map<string, OpenedMedia>): LoadedProject;

// engine/photoProjectDoc.ts
export interface PhotoProjectDoc { version: 1; name?: string; format: IgFormatId; limit: number; fileType: IgFileType; quality: number; caption: string; selected: string | null; items: DocPhoto[]; media: DocMedia[] }
// a photo's name and size are its media entry's, as a clip's are; IgItem extends EditorPhoto<Blob>
export interface DocPhoto extends Pick<EditorPhoto<MediaLike>, 'id' | 'edit' | 'layers'> { media: string; raw?: true }
export function mergePhotoProject(raw: unknown, desktop: boolean): { doc: PhotoProjectDoc; dropped: string[] };

// engine/mediaKey.ts, engine/mediaFile.ts
export function mediaKey(file: Blob): Promise<string>;              // "m<size36>-<type hash>-<ends hash>"
export interface DiskMedia { id: string; url: string; size: number; type: string; name: string }   // desktop: url = chitthi-media://<id>
export type MediaFile = Blob | DiskMedia;
export type OpenedMedia = { file: MediaFile; url: string } | { missing: true; name: string };
export function mediaInput(file: MediaFile): Source;              // Mediabunny BlobSource | UrlSource
export function blobOf(file: MediaFile): Promise<Blob>;

// lib/projects.ts
export type Studio = 'photo' | 'video';
export interface ProjectEntry { id: string; studio: Studio; name: string; kind: VKind | 'photo'; length: number; photos: number; changed: number; bytes: number; thumb: string; readable: boolean }
export interface ProjectCache { thumbs: Record<string, string>; strips: Record<string, string[]>; previews: Record<string, string>; peaks: Record<string, string /* base64 Int8 */> }
export interface ProjectLibrary {
  list(): Promise<ProjectEntry[]>;
  read(id: string): Promise<unknown>;            // unvalidated: the gates check it
  write(id: string, doc: ProjectDoc | PhotoProjectDoc, entry: ProjectEntry): Promise<void>;
  readCache(id: string): Promise<unknown>;
  writeCache(id: string, cache: ProjectCache): Promise<void>;
  remove(id: string): Promise<number>;           // bytes freed
  usage(): Promise<{ used: number; allowed: number | null; persisted: boolean | null }>;
}

// lib/mediaStore.ts
export interface MediaStore {
  keep(file: MediaFile, owned: boolean, progress?: (share: number) => void): Promise<string | { error: string }>;   // disk media: kept already
  open(id: string, name: string, type?: string): Promise<OpenedMedia>;   // OPFS keeps no type: given back so the id holds
  relink(id: string, name?: string, type?: string): Promise<OpenedMedia | null>;    // desktop: Find file…
  sweep(used: ReadonlySet<string>): Promise<number>;  // bytes freed
}

// state/projectSave.ts
export type SaveStatus = { state: 'saved' | 'saving' } | { state: 'failed'; reason: string } | { state: 'elsewhere' };
export function flush(): Promise<void>;

// DesktopBridge additions (electron/projects.cjs, electron/media.cjs; every handler validates ids /^[A-Za-z0-9_-]{1,100}$/)
projects: { list(): Promise<unknown[]>; read(id): Promise<string | null>; write(id, doc: string, entry: string): Promise<void>; readCache(id): Promise<string | null>; writeCache(id, cache: string); remove(id): Promise<number>; usage(): Promise<{ used: number }> };
media: { register(id, file: File): Promise<boolean /* false: no path, kept as owned */>; writeOwned(id, position, data: ArrayBuffer); finishOwned(id, keep: boolean): Promise<void>; status(ids: string[]): Promise<Record<string, { state: 'ok' | 'missing' | 'changed'; size: number }>>; freeSpace(): Promise<number>; findFile(id): Promise<{ found: string[] } | null>; sweep(used: string[]): Promise<number> };   // the page computes the id (mediaKey)
```

## Techniques

- **Storage split chosen once** (as `lib/db.ts`): `desktop ? desktopX(desktop.x) : webX`. Callers never branch on the platform.
- **Browser media in OPFS** (`navigator.storage.getDirectory()`), streamed: `file.stream().pipeTo(handle.createWritable())`, or in a worker with `createSyncAccessHandle` where `createWritable` is missing (Safari). The `File` from `getFile()` is disk-backed, so reopened media behaves like a picked file. Quota from `navigator.storage.estimate()`, `persist()` asked once.
- **Desktop media by reference**, secured by keeping paths out of the page: the preload's `webUtils.getPathForFile` only works on real picked or dropped files; the main process writes `media-index.json`; the page only ever sees ids and `chitthi-media://<id>` URLs. The scheme is registered privileged (`stream`, `supportFetchAPI`, `secure`, `corsEnabled`, `bypassCSP: false`) and served with `Range` / `206` from `fs.createReadStream(start, end)`, checking size and mtime first. Mediabunny's `UrlSource` reads it with range requests in the page and in the scan worker.
- **Atomic writes**: desktop `tmp` + `rename` (same folder, so same volume); browser one IndexedDB transaction per save.
- **Autosave** is a debounce on the document-changing actions (the stores already know undo steps: `change()` / `commit()`), plus immediate saves on `visibilitychange` / `pagehide` and an IPC `flush` before the desktop window closes.
- **Reference counting by sweep**: after a delete, the media ids still used are collected from every project's document, and the rest is deleted (browser copies; desktop only app-made files and index entries, never the user's files). No counters to drift.
- **No new dependency.** Mediabunny (MPL-2.0, already shipped) has `UrlSource`; everything else is the platform.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `tests/integration/state/projects.test.ts` (fake clock: saved 2 s after the last change, once per drag, at once on hide; status; a write that throws mid-way leaves the last document, using the in-memory library's failure switch); `tests/unit/electron/projects.test.ts` (tmp + rename: a crash between them leaves the old file) | integration, unit |
| AC-2 | `tests/unit/engine/projectDoc.test.ts` and `photoProjectDoc.test.ts`: store → document → store → document identical for the 201–208 fixtures and photo fixtures (edits, masks, layers, RAW); `projects.test.ts`: every setting back after open, history empty. Export byte-identity after reopening: **290** (self-test) | unit; self-test in 290 |
| AC-3 | `projects.test.ts`: new (names), open, rename (1–80), duplicate, delete, newest first, the last one reopens, first visit new | integration |
| AC-4 | `tests/unit/engine/mediaKey.test.ts` (same file → same id; one byte at an end changes it); `tests/unit/lib/mediaStore.test.ts` with an in-memory OPFS stand-in: stored once, progress, refusal with the space left, persist answer | unit |
| AC-5 | `tests/unit/electron/media.test.ts`: register only from a path the preload gave, index written by main only, the scheme's 206 ranges, 404 for unknown / changed / moved files, owned files in `media/`, Find file… reconnects the folder's other files (dialog faked) | unit |
| AC-6 | `projectGate.test.ts` / `photoProjectDoc.test.ts`: damaged, newer and out-of-range documents; `projects.test.ts`: an unreadable entry stays listed as can't be opened, the others load | unit, integration |
| AC-7 | `mediaStore.test.ts` and `media.test.ts`: sweep keeps media used by another project, deletes the rest, never a user file (desktop), bytes freed reported | unit |
| AC-8 | `tests/unit/lib/projectLock.test.ts` with a fake channel: the first holder stops saving, Open here again takes it back | unit |
| AC-9 | `projects.test.ts`: usage shown, 90 % warning once, a quota failure keeps the project, says “Not saved: storage is full”, retries; print data untouched (a test that the print stores aren't opened) | integration |
| AC-10 | Timing run (500-clip save < 50 ms, 60-clip open < 2 s / plays < 3 s) and the entry chunk: **290**; `npm run build` at the end of 408 | timing in 290; build |
| AC-11 | Playwright + axe on the Projects panel: **290** | e2e in 290 |
| AC-12 | Playwright (browser reload, delete frees space) and the desktop app on Windows and macOS (restart, move a file, Find file…): **290** | e2e, manual in 290 |
| AC-13 | Self-test checks for the five tools and `test:mcp` steps: **290** | self-test in 290 |
| AC-14 | Review at the end of 408 | review |

## Risks & Mitigations

- **R1 Desktop media through `chitthi-media://`** (D1): `<video>` seeking, Mediabunny `UrlSource` range reads in the page and the scan worker, the decode pool's speed compared with a `File`, and the CSP. Mitigation: spike task first: a 4 GB local video through the scheme plays, seeks, scans, exports at the speed of today's `File` path (within 10 %); if `UrlSource` is too slow, a `StreamSource` reading ranges over IPC instead.
- **R2 OPFS across browsers** (Safari's missing main-thread `createWritable`, Firefox quotas, private windows without OPFS). Mitigation: the spike also copies a 1 GB file in Chrome, Firefox and Safari; the worker path for Safari; where OPFS is missing (private windows), projects save without media and say “files aren't kept in a private window”.
- **R3 Touching every decode site** (§5) risks regressions in 204–208. Mitigation: one helper (`mediaInput`) and a mechanical change per site, done in one task before anything else; the existing unit tests and 290's self-test cover the paths; `MediaFile` is a Blob on the web, so the web path is unchanged in behaviour.
- **R4 Quota surprises**: the browser may evict non-persisted storage. Mitigation: `persist()` asked and shown (AC-4); the cache and documents are small; TROUBLESHOOTING explains it.
- **R5 Saving on close**: `pagehide` gives no time for async work in some browsers. Mitigation: saves are already at most 2 s old; the desktop app waits for `flush()` before closing (bounded at 2 s); the 2 s loss bound of AC-1 holds without the close save.
- **R6 Security of the new IPC and scheme** (Constitution IX). Mitigation: paths never come from the page; ids validated; the scheme answers only indexed ids with matching size and mtime; unit tests for refusal cases (AC-5); reviewed against `specs/architecture.md` §7 in the docs task.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec approved 2026-10-19 (Q1–Q15 accepted). |
| II. Test-Gated Delivery | ✅ | Conversions, gates, library, media store, lock and Electron handlers unit-tested with in-memory stand-ins and a fake clock; e2e, self-test, MCP and timing in 290 (Q11, D-033). |
| III. Simplicity and Small Dependencies | ✅ | No new dependency: IndexedDB, OPFS, BroadcastChannel, Electron APIs, Mediabunny's `UrlSource` (already shipped). |
| IV. Memory Is Maintained | ✅ | D1–D6 into `memory/decisions.md` when approved; spike findings into `learnings.md`. |
| V. Free and Open Source, Always | ✅ | No project limit; the browser/desktop difference (copy vs reference) is technical (file paths, 50 GB files), as Q3/Q4 say. |
| VI. On the User's Device, No Backend | ✅ | All storage on the device; `chitthi-media://` is a local scheme, not a network destination. |
| VII. Permissive Licences Only | ✅ | Nothing new. |
| VIII. What You See Is What You Get | ✅ | Reopened projects use the same render and export paths; loading goes through the validators (`mergeProject`, `mergePhotoProject`); missing media blocks the export rather than exporting something else (D4). |
| IX. Secure Desktop Shell | ⚠️ | New IPC handlers (projects, media) and a privileged scheme: all through `electron/ipc.cjs`, ids validated, paths only from the preload's `getPathForFile` or a main-process dialog, never from the page (R6). Sandbox, context isolation and fuses unchanged. |
| X. Budgets and Accessibility | ✅ | Projects code lazy-loaded; entry ≤ 350 KB; keyboard and screen reader for the panel (AC-11 in 290); memory: media streams to storage, never held whole. |
| XI. Agents Use the Same Code | ✅ | Five project tools calling `state/projects.ts` (AC-13). |

## Decisions for the maintainer (accepted 2026-10-19: D1–D6 as recommended)

**D1 How the desktop app plays and decodes files it only references.** **Recommended:** a privileged `chitthi-media://<id>` scheme served by the main process with Range support, read by `<video>` / `<audio>` and by Mediabunny's `UrlSource`; paths stay in the main process. Alternative: a `StreamSource` reading byte ranges over IPC (no scheme, but every decode read crosses IPC and `<video>` still needs a URL). The spike (R1) confirms the speed.

**D2 How the browser keeps media.** **Recommended:** the Origin Private File System (disk-backed `File`s, streamed copies, no size cap of its own). Alternative: Blobs in IndexedDB (simpler, but large Blobs are slower and some browsers buffer them in memory on write).

**D3 Media ids.** **Recommended:** a fingerprint of size, type and the first and last 64 KB (fast for 4 GB files). Alternative: a full SHA-256 (no collision risk, but hashing a 4 GB file takes ~10–20 s).

**D4 Exporting with missing files.** **Recommended:** refused with the list of missing files until they are found or their clips removed. Alternative: export with black frames and silence in their place.

**D5 The browser database.** **Recommended:** a new database `chitthi-projects`, so the print `chitthi` database's version and upgrade code don't change. Alternative: new stores in `chitthi` (version 6).

**D6 One video list for all kinds.** **Recommended:** the video studio's list holds Reels, Shorts and YouTube projects together (with their kind shown); opening one switches the studio to its mode. Alternative: a list per mode.
