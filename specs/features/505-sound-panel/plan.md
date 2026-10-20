<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 505 — Sound panel: recordings and voice listed for choosing · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (D1–D4 A; 2026-10-20, D-070) <!-- Draft | Approved -->

## Approach

After 503 and 504 the Audio panel (`studio/AudioPanel.tsx`) has Add sound above three folding sections (Record voice, Sound tracks, Loudness), a take is a sound clip whose file is marked `recorded` (504 D3) and listed under Recordings in the media pool, and the role colours `--sound-music`, `--sound-voice`, `--sound-fx` exist in both themes (501) but only the timeline's music bars use one. 505 adds what a take lacks (when and with which microphone it was recorded), a Recordings list, and the kind of every sound wherever sound is shown.

**§1 Take details (AC-1, Q1).** A take's file gets two more fields beside `recorded`: `recordedAt` (ms since 1970, the recorder's start) and `microphone` (the device's label as the browser gives it). They travel the same way `recorded` does since 504: set by the recorder on the `TakeToPlace` → the take's `VSound` → `poolOf`'s item, and saved on the take's media entry (`DocMedia`), which the gate reads (a number in range, a string of at most 200 characters; anything else is dropped). One type, `TakeDetails = Pick<DocMedia, 'recorded' | 'recordedAt' | 'microphone'>`, is shared by `VSound`, `PoolItem`, `EditorSound` and `EditorPoolItem`. `videoDocument` merges these fields into an entry another use already listed, so details aren't lost to the order files are listed in. Takes from before 505 show "—" for both.

**§2 Takes in the store (AC-1).** A new `state/videoTakes.ts` (pure selectors plus two actions): `takesOf(state)` lists every recorded file of `poolOf`, newest first (takes without a time last, by name), each with its uses (`usesOf`) and where its first use sits (track name and start time); `renameTake(key, name)` renames the file's pool item and every sound clip using it in one undo step (the clip shows its file's name, 208). Adding a take again is `addFromPool` (504: onto a Voice track at the playhead); deleting is `removeFromPool`, through the pool's question when it is used (504 D4).

**§3 The Recordings section (AC-1).** In the Audio panel, a `ListRow` per take (`studio/TakeList.tsx`): the name, then "0:41 · 20 Oct 14:02 · MacBook Microphone" and the place ("Voice at 0:12", "Voice at 0:12 and 1 more", "Not used"); controls Play / Stop, Rename (the row's name becomes a field: Enter keeps, Esc cancels, as the Projects list does, 408), Add at the playhead, Delete. Choosing a row selects the take's first clip (`selectSound`) and reveals it: a `revealOnTimeline(time, track)` event the timeline listens for, scrolling the clip's start and row into view (the timeline follows the playhead only while playing today). Play previews the take alone through one `<audio>` element shared by the list (one plays at a time; leaving the panel stops it); it plays the whole file, not the clip's trimmed part. An empty list says how takes are made (Record voice).

**§4 Kinds and colours (AC-2).** One rule, `soundKind(track)` → Music / Voice / Effects (the track's role, 208), and one class per kind, `kind-music`, `kind-voice`, `kind-fx`, which sets `--kind` from the role tokens; the parts use `var(--kind)`. Shown: the track header (a colour bar at its left edge and the role in its accessible name), the timeline's sound bars (today all music-coloured: each takes its track's kind), the Audio panel's track settings (a colour chip by the name), the Recordings rows (Voice), the sound inspector ("Music 1 · Music" with the chip), and the media pool's detail line (D2). Colour is never the only cue: the kind's name is written beside it.

**§5 The Audio panel (AC-3).** Sections, in order: Add sound (D1), Record voice, Recordings, Tracks (Lower music under voice and each track's settings; the old Sound tracks section), and Loudness (D3). Record voice and the microphone (D4): a user opening the section opens the microphone (`openRecordVoice`), closing it or opening another section closes it (`onClosed`, 503), and a section opened by itself (remembered from last time, or as the default) shows the Record voice… button instead, so the microphone never opens unasked (209 AC-7). This needs one more `FoldSection` callback, `onOpened`, called only when the user opens the section. Record voice is never the panel's default section.

**§6 Agent tools.** None (D-069 D5 stands: the video editor's tools are a feature of their own).

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/projectDoc.ts`, `src/engine/projectGate.ts` | modify | `recordedAt`, `microphone` on a take's media entry; `TakeDetails`; merged on listing; read by the gate (§1) |
| `src/state/voiceRecorder.ts`, `src/state/videoSound.ts`, `src/state/videoStore.ts`, `src/state/videoPool.ts` | modify | A take's details from the recorder to its sound clip and pool item (§1) |
| `src/state/videoTakes.ts` | new | `takesOf`, `renameTake` (§2) |
| `src/components/studio/TakeList.tsx` | new | The Recordings section: rows, play, rename, add, delete, select and reveal (§3) |
| `src/components/studio/soundKinds.ts` | new | `soundKind`, the names and classes (§4) |
| `src/components/studio/{AudioPanel,TrackHead,SoundRow,SoundInspector,MediaPool}.tsx`, `src/components/studio/poolList.ts`, `src/components/studio/Timeline.tsx` | modify | The sections (§5), kinds and colours (§4), revealing a take (§3) |
| `src/components/panel/FoldSection.tsx` | modify | `onOpened` (the user's own open, §5) |
| `src/styles/36-media-studio.css` | modify | `kind-*` classes, the colour bar, chips and sound bars by kind, the take rows |
| `tests/integration/state/videoTakes.test.ts`, `tests/unit/components/studio/{soundKinds,audioPanel}.test.ts`, `tests/unit/engine/{projectDoc,projectGate}.test.ts`, `tests/unit/components/panel/foldMarkup.test.ts` | new / modify | AC-1–AC-3 |
| `docs/MEDIA-STUDIO.md`, `docs/DESIGN.md`, `specs/lld.md`, `CHANGELOG.md` | modify | Recordings, kinds and colours, the Audio panel's sections |

## Data Structures & Interfaces

```ts
// engine/projectDoc.ts
interface DocMedia { /* … */ recorded?: true; recordedAt?: number; microphone?: string }
export type TakeDetails = Pick<DocMedia, 'recorded' | 'recordedAt' | 'microphone'>;
// EditorSound, EditorPoolItem, VSound, PoolItem: … & TakeDetails

// state/videoTakes.ts (new)
export interface TakeRow {
  key: string;            // poolKey
  item: PoolItem;
  uses: PoolUse[];
  /** Where its first use sits: "Voice at 0:12", or null when unused. */
  place: { track: string; start: number } | null;
}
export function takesOf(video: VState): TakeRow[];       // newest first
export function renameTake(key: string, name: string): string | null; // one undo step; why not

// components/studio/soundKinds.ts (new)
export type SoundKind = 'music' | 'voice' | 'fx';
export const KIND_NAMES: Record<SoundKind, string>;     // Music, Voice, Effects
export function soundKind(track: Track): SoundKind;
export const kindClass = (kind: SoundKind): string => `kind-${kind}`;

// components/panel/FoldSection.tsx
interface FoldSectionProps { /* … */ onOpened?: () => void }  // only when the user opens it

// components/studio/timelineActions.ts (or CutMarks-style event)
export function revealOnTimeline(time: number, track: string): void;
```

Saved: a take's media entry gains `recordedAt` and `microphone`; a document from before 505 opens unchanged (no details).

## Techniques

- **File details ride with the file:** the take's details go wherever `recorded` already goes (504), one shared type, so no second list of takes is kept in step.
- **Merge on listing:** `videoDocument`'s `listed()` fills a take's detail fields into an entry already listed by another use, so the first use's order doesn't decide what is saved.
- **User intent, not state:** the microphone follows the user's click on the section (`onOpened`), never the section's open state, which can come back from storage.
- **One colour rule:** `kind-*` classes set `--kind` once; every part reads `var(--kind)`, so a new place to colour by kind is one class.

## Test Approach

| AC | Test | Kind |
| --- | --- | --- |
| AC-1 | `tests/integration/state/videoTakes.test.ts`: a placed take carries `recordedAt` and `microphone` into the pool; `takesOf` newest first (undated last), with uses and the first use's place; `renameTake` renames the pool item and every clip in one undo step, refuses an empty name. `projectDoc.test.ts` / `projectGate.test.ts`: the details round-trip, merge into an entry listed by another use, wrong values dropped. Selecting, revealing and playing a take are checked by eye | unit |
| AC-2 | `tests/unit/components/studio/soundKinds.test.ts`: `soundKind` per role, the names; a CSS check that `kind-music`, `kind-voice`, `kind-fx` set `--kind` from the role tokens and that the three tokens exist in the light and dark themes; `poolDetail` names a sound's kind (D2) | unit |
| AC-3 | `tests/unit/components/studio/audioPanel.test.ts` (source scan): the Audio panel's sections in order with their ids; Record voice has `onOpened` / `onClosed` and isn't the default; `foldMarkup.test.ts`: `onOpened` isn't called by rendering a section open | unit |
| AC-4 | The Audio panel with 8 tracks and 20 takes at 1280 × 720 | manual (590) |

## Risks & Mitigations

- **The microphone opens without the user asking** (a remembered Record voice section). Mitigation: D4 A, `onOpened` fires only on the user's click; a test checks rendering a section open doesn't call it; Record voice is never the default.
- **A take's details are lost when another use lists its file first.** Mitigation: `listed()` merges the detail fields; a test saves a take used twice and reopens it.
- **Microphone labels leak personal names** ("Asha's AirPods"). Mitigation: kept only in the project on the device (spec Privacy), never sent anywhere; shown only in the Recordings list.
- **Colour alone marks the kind.** Mitigation: the kind's name is always written beside the colour (track header's accessible name, chips with text); contrast checked in 590's screenshots.
- **Previewing a take while the video plays mixes two sounds.** Mitigation: Play pauses the video first; starting the video stops the preview.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec Approved 2026-10-20; this plan waits for D1–D4. |
| II. Test-Gated Delivery | ✅ | AC-1–AC-3 unit tests, test-first; AC-4 deferred to 590 (already listed there). |
| III. Simplicity and Small Dependencies | ✅ | No new dependency; details ride with the file as `recorded` does. |
| IV. Memory Is Maintained | ✅ | D1–D4 into `memory/decisions.md` when chosen. |
| V. Free and Open Source | ✅ | Same on web and desktop. |
| VI. On the User's Device | ✅ | Microphone names stay in the project on the device. |
| VII. Permissive Licences Only | ✅ | Nothing new. |
| VIII. What You See Is What You Get | ✅ | No preview or export path changes; documents still through the gate (two optional fields). |
| IX. Secure Desktop Shell | ✅ | No `electron/` changes; the microphone permission rules (209) unchanged. |
| X. Budgets and Accessibility | ✅ | In the studio's lazy chunk; rows and controls are buttons; kind never by colour alone. |
| XI. Agents Use the Same Code | ⚠️ | No video agent tools yet (D-069 D5); takes join that feature. |

## Decisions for the maintainer

_Chosen (the maintainer, 2026-10-20): A for all four (D-070)._

**D1 Add sound: a section, or above the sections?** The spec's AC-3 makes Add sound a folding section; 503's D-068 D1 kept a panel's main action above its sections. **A (recommended)** follow the spec for the Audio panel: Add sound is the first section (and the panel's default), so the panel is only titles when nothing is open; D-068 D1 still holds elsewhere. **B** keep Add sound above (D-068 D1) and amend AC-3 to three sections plus it.

**D2 How the media pool names a sound's kind.** A file isn't Music or Voice; the track it is on is. **A (recommended)** a recording is "Voice", a sound in use takes the kind of the track of its first use ("Music", "Effects"), an unused sound file says "Sound"; the pool's filter chips stay as 504 made them. **B** add Music / Voice / Effects filter chips to the pool in place of Sound / Recordings.

**D3 Loudness.** The spec lists four sections; Loudness is a section today. **A (recommended)** keep it as a fifth section after Tracks: it is the whole mix's setting and is looked for by name. **B** put it at the end of Tracks.

**D4 Opening Record voice and the microphone.** AC-3 says opening the section opens the microphone; a section can also open by itself (remembered from last time). **A (recommended)** only the user's own click on the section opens the microphone; a section opened by itself shows the Record voice… button; closing always closes it. **B** any open of the section opens the microphone (the browser asks the first time; afterwards the microphone could open whenever the Audio panel does).
