<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 208 — Audio tracks, waveforms, ducking, loudness · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-18, D1–D6 as recommended, D-052) <!-- Draft | Approved -->

## Approach

Today the sound is two separate things: the video clips' own sound (204's <audio> elements in the preview, \`audioPlan\` + \`mixWindow\` in the export) and **one song** (\`state.music: VMusic\`, its own <audio> element in VideoStage, \`musicClips()\` turning it into one \`AudioClip\` with \`toEnd\`). 208 makes the song an ordinary **sound clip**, lets audio tracks hold many, and puts **one gain chain** in \`engine/\` that the export and the preview both evaluate: clip volume × fades × volume keys × track volume × ducking × loudness gain, then one limiter (Constitution VIII). Under D-033 every task is proven by unit tests; the UI, listening and timing checks go to 290.

**§1 The audio model (\`engine/timeline.ts\`, \`engine/tracks.ts\`, new \`engine/soundClips.ts\`, AC-1–AC-3).** \`AudioClip\` gains \`out\` (source seconds; missing on a \`toEnd\` clip), \`fadeIn\` / \`fadeOut\` (0–10 s, missing = 0), \`keys?: Keyframes<'volume'>\` (205) and \`name\`; \`toEnd\` stays (Q7). \`Track\` gains, for audio tracks only, \`role?: 'music' | 'voice' | 'effects'\`, \`volume?\` (0–2), \`solo?\`, \`voice?: false\` (Counts as voice off, Q10) and \`duck?: { amount, threshold }\` (Q9, Q11); missing fields mean today's behaviour, so old documents stay byte-identical (AC-3). \`TRACK_LIMITS\` audio becomes 8 on web as on desktop (D2). \`tracks.ts\` gets \`addAudioTrack\` ("Audio N", role Effects, placed after the last audio track), and \`moveTrack\` / \`deleteTrack\` learn audio tracks (reorder only among audio tracks; the last one can't go). \`soundClips.ts\` holds the pure sound clip edits: \`addSound\` (at the playhead on the chosen track, else the first with room, else a new track below 8), \`moveSound\`, \`trimSound\`, \`splitSound\`, \`duplicateSound\`, \`deleteSound\`, \`slipSound\`, \`rollSound\`, \`rippleSound\`, \`slideSound\`, \`setFades\` — each refusing overlaps on the track, running past the source, fades longer than the clip, and locked tracks with the reason, as 202's edits do; Snap targets gain sound clip edges (\`timeSnap.ts\`). A sound clip's length is \`out − in\`, or for \`toEnd\` the video's end minus its start (capped by the source). Trimming a \`toEnd\` clip's end turns \`toEnd\` off (Q7). Sound past the video's end is cut by \`audioPlan\`, never lengthening \`projectLength\` (Q6).

**§2 The gain chain (\`engine/soundPlan.ts\`, \`engine/keyframes.ts\`, new \`engine/mixGain.ts\`, AC-5, AC-12).** \`SoundSource\` gains \`track\` and \`role\`; \`audioPlan\` emits every sound clip of every unmuted audio track (with its fades, keys and \`toEnd\` fade-out of min(1.5 s, a third), exactly as today for migrated music) after the clip sounds, in track order, so a project without new audio yields exactly 207's list (AC-3). \`mixGain.ts\` is the one place the chain is evaluated: \`sourceGainAt\` (today's: keys or volume × edges × fades) × \`trackGain\` (track volume) × \`duckGain\` (§3) — with sound clip volume keys on a 0–2 range (\`SOUND_RANGES\`; video clips stay 0–1, D6). \`gainCurve\` keeps its 5 ms step, so every change is a ramp of at most 5 ms (AC-5). The loudness gain and the limiter (§4) act on the summed mix, after the chain.

**§3 Waveforms, voice and ducking (new \`engine/soundScan.ts\`, \`engine/ducking.ts\`, new \`state/soundScan.ts\` + \`state/soundScan.worker.ts\`, AC-4, AC-6, AC-7).** Each media file with sound is **scanned once** in the background (D5): a module Worker streams its sound through Mediabunny's \`AudioBufferSink\` (as the export does, so a 3-hour file is never decoded whole) and \`soundScan.ts\` folds the samples into a \`SoundScan\`: peaks (max |sample|, 100 per second, as Uint8 dB steps) for the waveform and RMS in 50 ms steps (Float32, dBFS) for voice detection. 3 hours = 1.08 M peaks + 216 k RMS ≈ 2 MB (< 10 MB, AC-4). Scans are kept per media id in memory and dropped with the media. **Waveforms** are drawn from the scan through the clip's mapping (\`sourceAt\` for video clips at speed, 207) and scaled by \`mixGain\` at each column; silent clips (\`soundMuted\`, muted tracks) draw flat with the reason as their title. **Voice** on the timeline is computed, not measured again: for each 50 ms step, the power sum of every voice source's scanned RMS × its chain gain (without ducking) at that time (\`voiceLevel(plan, scans, step)\`); **speaking** = above the track's threshold, pauses < 0.5 s bridged; \`duckCurve(speaking, amount)\` ramps down over 0.3 s *before* speech (look-ahead: we know the future) and up over 0.8 s after, as dB, sampled every 10 ms. Because it reads cached scans only, an edit's new curve takes milliseconds (AC-7's 1 s), and the export and the preview call the same \`duckGain(curve, time)\`. The curve is cached per (project sound edit, scans) and recomputed on change.

**§4 Loudness and the limiter (new \`engine/loudness.ts\`, \`engine/limiter.ts\`, AC-8, AC-9).** \`loudness.ts\` is BS.1770-4: the K-weighting filters (the standard's two biquads at 48 kHz), 400 ms blocks with 75 % overlap, the −70 LUFS absolute and −10 LU relative gates, channel weights 1.0 for L / R, and true peak by 4× oversampling (the standard's 48-tap polyphase FIR); a streaming \`LoudnessMeter\` takes window after window. \`limiter.ts\` is a streaming true-peak limiter: 5 ms look-ahead, instant attack to hold the oversampled peak at −1 dBTP, 100 ms release, state carried across windows (Q13). **Measuring the mix** (\`measureMix(job)\` in \`videoExport.ts\`, sharing \`mixWindow\`): render the mix window by window (sound only, no pictures), feed the meter, keep nothing else. The loudness gain is \`target − measured\` (clamped to ±24 dB); when that gain plus the measured true peak goes over −1 dBTP by more than 1 dB, a second pass measures *with* gain and limiter and corrects the gain once, so heavy limiting still lands within 0.5 LU (D4). **The panel readout** (AC-9) runs \`measureMix\` in the background 500 ms after the last sound edit (cancelled by the next), and stores \`{ key, lufs, peak, gain, reduction }\` keyed by a hash of the sound plan; **the export** reuses it when its key matches, else measures first ("Measuring loudness…"). Loudness Off: no gain, no limiter, the mix exactly as today.

**§5 The export (\`engine/videoExport.ts\`, \`state/videoExportJob.ts\`, AC-12).** \`ExportJob\` carries the sound clips with their files (\`ExportAudio\` already has a file), the tracks' audio fields, the duck curves and the loudness gain. \`mixWindow\` schedules each source's gain as one \`setValueCurveAtTime\` of the full chain (\`gainCurve\` over \`mixGain\`), then the window's output (still 10 s, interleaved with the frames, so memory is the same whatever the number of tracks) passes through the loudness gain and the streaming limiter before \`SoundFeed\` adds it; the limiter's 5 ms delay is compensated by starting the mix 5 ms early and flushing at the end, so sound stays on the frame.

**§6 The preview (\`components/studio/previewSound.ts\`, \`VideoStage.tsx\`, D3, AC-7, AC-9).** Element volume can't go over 1 or carry curves, so the preview routes its <audio> elements through **one \`AudioContext\`**: each element → \`MediaElementAudioSourceNode\` → its gain (the chain from \`mixGain\`, set each tick with a ≤ 1-frame ramp) → the master gain (loudness gain) → an \`AudioWorkletNode\` running \`limiter.ts\` → the speakers. \`soundPlan\` (preview) learns sound clips: those under the playhead on unmuted (and, when any is soloed, soloed) audio tracks play, the next within 2 s are loaded, as video clip sound is today; the music's separate element in VideoStage goes. Solo is preview-only (Q2). The context is resumed on Play (a user gesture). The worklet loads from a same-origin module URL (CSP \`script-src 'self'\` covers worklets; a spike proves it in the production build and Electron, risk 1).

**§7 State and undo (\`state/videoStore.ts\`, new \`state/videoSound.ts\`, \`state/videoMedia.ts\`, \`state/videoTracks.ts\`, AC-10).** \`state.music\` becomes \`state.sounds: VSound[]\` (an \`AudioClip\` with its \`file\`, \`url\` and media id, D1) and \`projectOf\` passes them as \`audio\`; \`state.loudness\` (\`'off' | number\`) and the per-track fields live on \`tracks\`. \`videoSound.ts\` has the actions (\`addSoundFiles\`, \`moveSound\`, \`trimSound\`, \`splitSound\`, \`duplicateSound\`, \`deleteSound\`, \`setSoundVolume\`, \`setSoundFades\`, \`setTrackVolume\`, \`setTrackRole\`, \`setDucking\`, \`setLowerMusicUnderVoice\`, \`setLoudness\`), each one \`change()\` with a coalescing key so a drag is one step; \`updateMusic\` (not recorded for undo today) goes. \`setMusicFile\` becomes \`addSoundFiles\` (same formats and 100 MB limit, Q4) and starts the scan instead of \`measurePeaks\`; video imports start a scan too. A seeded property test runs 1,000 random sound clip, track, ducking and picture edits and checks AC-10's invariants after each.

**§8 Saving (\`engine/projectDoc.ts\`, \`engine/projectGate.ts\`, AC-3, AC-11).** \`toDocument\` writes the new fields only when set; \`readAudio\` reads \`out\`, fades, keys and \`name\` (clamped; overlapping clips on a track dropped with the reason, later one first to go), \`readTracks\` the audio fields and keeps at most 8 audio tracks; the document's \`loudness\` is read with its range, missing = Off (Q12: pre-208 projects stay Off; new projects start at −14 in the store). 2.x documents go through \`fromSequence\` as today.

**§9 UI (\`VideoPanels.tsx\` → new \`AudioPanel.tsx\`, new \`SoundRow.tsx\`, \`TrackHead.tsx\`, \`ClipInspector.tsx\` → new \`SoundInspector.tsx\`, \`PictureRow.tsx\`, \`Timeline.tsx\`, \`36-media-studio.css\`, AC-13, AC-14).** The Audio panel: Add sound (several files), the tracks (role, volume, ducking), **Lower music under voice**, the Loudness setting and readout with the limiter warning. Audio track headers: name, Mute, Solo, Lock, volume, role, ducking; **Add audio track**. \`SoundRow\` replaces \`MusicRow\`: one bar per sound clip with name, waveform canvas, fade handles at its top corners, the volume line, the ducking curve, dimmed past the video's end; drag, trim and the edit tools go through \`timelineDrag.ts\` as picture clips do. Video clips draw their waveform under the filmstrip. The sound clip inspector: volume (0–200 %), fades, its volume keyframes (205's \`KeyframeButton\` / lane), Play to the end of the video, source. Pure helpers (waveform columns, bar geometry, announcements) are unit-tested; the UI is checked in 290.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/timeline.ts`, `src/engine/tracks.ts`, `tests/unit/engine/tracks.test.ts` | modify | §1: `AudioClip` and audio track fields, `addAudioTrack`, 8 audio tracks on web (D2) |
| `src/engine/soundClips.ts`, `tests/unit/engine/soundClips.test.ts` | new | §1: sound clip edits and refusals |
| `src/engine/timeSnap.ts`, `src/engine/edits.ts` | modify | §1: Snap to sound clip edges; shared refusal texts |
| `src/engine/soundPlan.ts`, `src/engine/keyframes.ts`, `src/engine/mixGain.ts` (new), `tests/unit/engine/mixGain.test.ts` (new) | new / modify | §2: sound clips in `audioPlan`, the gain chain, `SOUND_RANGES` |
| `src/engine/soundScan.ts`, `tests/unit/engine/soundScan.test.ts` | new | §3: peaks and 50 ms RMS from streamed samples |
| `src/engine/ducking.ts`, `tests/unit/engine/ducking.test.ts` | new | §3: voice level, speaking, the duck curve |
| `src/engine/loudness.ts`, `src/engine/limiter.ts`, `tests/unit/engine/loudness.test.ts`, `tests/unit/engine/limiter.test.ts` | new | §4: BS.1770-4 meter, true peak, streaming limiter |
| `src/engine/videoExport.ts`, `src/state/videoExportJob.ts`, `tests/integration/engine/videoExport.test.ts` | modify | §4, §5: `measureMix`, the chain, loudness gain and limiter in the export |
| `src/state/soundScan.ts`, `src/state/soundScan.worker.ts` | new | §3: the background scanner (Worker, Mediabunny streaming), scans per media id |
| `src/components/studio/limiter.worklet.ts` | new | §6: the preview limiter (wraps `engine/limiter.ts`) |
| `src/components/studio/previewSound.ts`, `src/components/studio/VideoStage.tsx`, `tests/unit/components/previewSound.test.ts` | modify | §6: the Web Audio graph, sound clips in the preview, Solo; the music element goes |
| `src/state/videoStore.ts`, `src/state/videoSound.ts` (new), `src/state/videoMedia.ts`, `src/state/videoTracks.ts`, `tests/integration/state/video.test.ts` | new / modify | §7: `sounds` replaces `music`, actions, undo keys, the property test |
| `src/engine/projectDoc.ts`, `src/engine/projectGate.ts`, `tests/unit/engine/timeline.test.ts` | modify | §8: saving and validating the new fields |
| `src/components/studio/AudioPanel.tsx` (new), `src/components/studio/VideoPanels.tsx` | new / modify | §9: the Audio panel (`MusicPanel` goes) |
| `src/components/studio/SoundRow.tsx` (new), `src/components/studio/TimelineBars.tsx`, `src/components/studio/Timeline.tsx`, `src/components/studio/TrackHead.tsx`, `src/components/studio/PictureRow.tsx`, `src/components/studio/timelineRows.ts`, `src/components/studio/timelineDrag.ts`, `src/components/studio/timelineActions.ts` | new / modify | §9: sound rows, waveforms, fade handles, volume line, duck curve, audio track headers |
| `src/components/studio/SoundInspector.tsx` (new), `src/components/studio/ClipInspector.tsx` | new / modify | §9: the sound clip inspector |
| `src/styles/36-media-studio.css` | modify | §9: sound rows and handles |
| `docs/MEDIA-STUDIO.md`, `specs/lld.md`, `specs/testing-strategy.md`, `CHANGELOG.md`, `src/data/docs.ts` | modify | AC-17 |
| `specs/features/290-phase2-test-pass-release/feature.json` | modify | the deferred checks for AC-13–AC-16 (D-033) |

## Data Structures & Interfaces

\`\`\`ts
// engine/timeline.ts
export interface AudioClip {
  id: string; track: string; start: number;
  in: number; out?: number;            // out missing only on a toEnd clip
  volume: number;                      // 0–2 (Q, AC-2)
  fadeIn?: number; fadeOut?: number;   // 0–10 s; missing = 0
  keys?: Keyframes<'volume'>;          // 205, values 0–2
  toEnd: boolean; srcDur: number; name?: string;
}

// engine/tracks.ts
export type SoundRole = 'music' | 'voice' | 'effects';
export interface Ducking { amount: number /* dB 3–30 */; threshold: number /* dBFS −60…−20 */ }
interface Track { /* … */ role?: SoundRole; volume?: number; solo?: boolean; voice?: false; duck?: Ducking }
export const DUCK_DEFAULTS: Ducking = { amount: 12, threshold: -40 };
export function addAudioTrack(tracks: Track[]): TrackAdded | Refusal;

// engine/soundClips.ts
export function addSound(audio: AudioClip[], tracks: Track[], clip: NewSound, at: number, ctx: SoundCtx): SoundEdit;
export function trimSound(audio: AudioClip[], id: string, edge: 'start' | 'end', by: number, ctx: SoundCtx): SoundEdit;
// moveSound, splitSound, duplicateSound, deleteSound, slipSound, rollSound, rippleSound, slideSound, setFades …
export function soundLength(clip: AudioClip, videoEnd: number): number;

// engine/mixGain.ts
export function chainGainAt(source: SoundSource, tracks: Track[], ducks: DuckCurves, time: number): number;

// engine/soundScan.ts
export interface SoundScan { rate: 100; peaks: Uint8Array /* dB steps */; rms: Float32Array /* dBFS per 50 ms */; dur: number }
export class ScanBuilder { constructor(sampleRate: number); add(channels: Float32Array[]): void; finish(): SoundScan }

// engine/ducking.ts
export function speaking(level: Float32Array, threshold: number, bridge = 0.5): Uint8Array; // per 50 ms step
export function duckCurve(speaking: Uint8Array, amount: number): Float32Array;          // dB per 10 ms
export function duckGain(curve: Float32Array, time: number): number;

// engine/loudness.ts
export class LoudnessMeter { constructor(sampleRate: number); add(left: Float32Array, right: Float32Array): void; integrated(): number; truePeak(): number }
export const LOUDNESS_PRESETS = { youtube: -14, quiet: -16 } as const; // range −24…−9

// engine/limiter.ts
export class Limiter { constructor(sampleRate: number, ceilingDb = -1, lookahead = 0.005, release = 0.1); process(left: Float32Array, right: Float32Array): void; reduction(): number }

// state/videoStore.ts
interface VSound extends AudioClip { media: string; file: Blob; url: string }
interface VState { /* … */ sounds: VSound[]; loudness: 'off' | number }
\`\`\`

## Techniques

- **One chain, two players.** `chainGainAt` is the only place gains are multiplied; the export samples it into `setValueCurveAtTime` (5 ms steps), the preview sets it each tick. `limiter.ts` is plain TypeScript run by the export directly and by the preview's worklet, so both limit alike.
- **Scan once, compute the rest.** Waveforms, voice level and ducking read the per-file scan; nothing is decoded again for an edit. Voice level is a power sum of scaled RMS (sources assumed uncorrelated, which a voice under music is); loudness is measured on the real mix, not estimated (D4).
- **BS.1770-4 to the letter**, tested against EBU Tech 3341 signals 1–5 synthesised in the test (stereo 1 kHz sines and the gating cases): integrated within 0.1 LU, true peak by the standard's 4× polyphase FIR.
- **Streaming everything:** the scanner, `measureMix`, the meter and the limiter take one chunk or window at a time with state carried, so memory is per window, never per project (AC-12).
- **Old projects untouched:** missing fields mean today's behaviour; `audioPlan` lists clip sounds first as today; Loudness Off skips the gain and limiter, so 201–207 fixtures give bit-identical export inputs (AC-3, AC-16).
- **Announcements** through the timeline's live region, as 202–207 do ("Audio 2: Whoosh, fade in 0.5 s").
- **No new dependency** (Constitution III): Mediabunny (already used) decodes; filters, meter, limiter and FIR are ~400 lines of our own.

## Test Approach

| AC | Proof | Test |
| --- | --- | --- |
| AC-1 | unit | add / rename / reorder / mute / solo / lock / delete audio tracks, the 8 limit on web and desktop, the last track kept, default roles (`tests/unit/engine/tracks.test.ts`) |
| AC-2 | unit | every sound clip edit and its refusals (overlap, past the source, locked, fades too long), add at the playhead / first track with room / new track (`tests/unit/engine/soundClips.test.ts`) |
| AC-3 | unit | 2.x and 201–207 fixtures: `audioPlan` and export sources equal the old lists; byte-identical documents (`timeline.test.ts`, `tests/integration/engine/videoExport.test.ts`) |
| AC-4 | unit | `ScanBuilder` on tone bursts at known times / levels: peaks within 1 dB and 10 ms; waveform columns through speed and gains; 3 h scan size < 10 MB (`soundScan.test.ts`) |
| AC-5 | unit | `chainGainAt` at 1,000 times vs a hand-computed chain within 0.01 dB; no curve step > 5 ms (`mixGain.test.ts`) |
| AC-6 | unit | speech fixture 2.0–5.0 s and 8.0–8.6 s: the curve every 10 ms within 0.1 dB; pauses < 0.5 s bridged; no voice = unchanged; roles and Counts as voice (`ducking.test.ts`) |
| AC-7 | unit | after moving / trimming / muting a voice clip the curve changes, computed from cached scans in < 1 s for a 10-minute project; export and preview read the same function (`ducking.test.ts`, `previewSound.test.ts`) |
| AC-8 | unit | EBU Tech 3341 signals 1–5 within 0.1 LU; a fixture mix exported (fake encoder) measures the target within 0.5 LU and ≤ −1 dBTP at 4×; Off leaves samples as before (`loudness.test.ts`, `limiter.test.ts`, `videoExport.test.ts`) |
| AC-9 | unit | the readout text from a measurement; the 6 dB warning; the background measurement is cancelled by a new edit and keyed by the plan hash; the preview's master gain = the export's (`tests/integration/state/video.test.ts`) |
| AC-10 | unit | undo-step counts per action, a drag one step; the seeded 1,000-edit property test (`tests/integration/state/video.test.ts`) |
| AC-11 | unit | ≥ 20 malformed documents, round trip, clamping, overlap drops with reasons, 8-track cap (`timeline.test.ts` gate tests) |
| AC-12 | unit | an 8-track fixture: export sources and gain curves equal the expected list; window memory independent of track count (`videoExport.test.ts`) |
| AC-13, AC-14 | e2e (290) | the Audio panel, track headers, sound rows, inspector, keyboard, announcements, axe, 360 px |
| AC-15 | manual (290) | the listening test and YouTube's content loudness, noted in `specs/testing-strategy.md` |
| AC-16 | timing (290) | 4-track Reel export vs one song, preview drops, 10-minute waveform time; 207 fixtures unchanged |
| AC-17 | review | the docs task |

## Risks & Mitigations

- **The preview's Web Audio graph** (§6, D3): `createMediaElementSource` takes an element for good, the context needs a gesture, and the limiter worklet must load under the production CSP and in Electron. Mitigation: a spike task first (worklet module from the Vite build, `app://` origin, autoplay on Play, 207's `preservesPitch` still working through the graph); if the worklet can't load, the preview falls back to a `DynamicsCompressorNode` set as a limiter and says the preview's peaks are approximate (export unchanged).
- **Scanning long files** (§3, AC-4, AC-16): a 3-hour video's sound streamed in a Worker may take long and compete with the decoder pool. Mitigation: the scan runs at low priority (one file at a time, yielding between chunks), waveforms fill in as it goes, ducking waits for its voice scans and says "measuring"; measured in 290.
- **Loudness accuracy with heavy limiting** (§4, AC-8): one gain then a limiter lands below the target when the limiter works hard. Mitigation: the second, corrective pass when predicted reduction exceeds 1 dB (D4); the panel warns over 6 dB.
- **Correlated voices** (§3): the power sum overestimates two copies of the same sound. Mitigation: it only moves the threshold crossing slightly; the threshold slider tunes it; noted in the docs.
- **Removing `state.music`** (§7, D1) touches the stage, the timeline, the panel, the export job and tests. Mitigation: one task migrates the store with `projectOf` producing the same `Project` as today (the 201–207 fixtures prove it) before any UI changes.
- **Waveforms on every clip** (§9) could slow the timeline at high zoom. Mitigation: canvas per visible bar, columns from the scan by index (no per-sample work), redrawn only on change.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec approved 2026-10-18 (Q1–Q18 accepted). AC-3's wording about the migrated music's fade-out is corrected with the plan (it keeps its min(1.5 s, a third) fade, as `audioPlan` does today). |
| II. Test-Gated Delivery | ✅ | Every engine part test-first with unit tests (fixtures, EBU signals, property test); e2e, listening and timing in 290 (D-033). |
| III. Simplicity and Small Dependencies | ✅ | No new dependency: Mediabunny already decodes; meter, filters, limiter and FIR are our own. |
| IV. Memory Is Maintained | ✅ | D1–D6 go to `memory/decisions.md` on approval; gotchas (Web Audio, worklets) to `learnings.md`. |
| V. Free and Open Source, Always | ✅ | Everything for everyone; the web gets 8 audio tracks like the desktop (D2). |
| VI. On the User's Device, No Backend | ✅ | All analysis and mixing on the device; no network. |
| VII. Permissive Licences Only | ✅ | Nothing new to licence; BS.1770 / EBU R 128 are public standards implemented from the text. |
| VIII. What You See Is What You Get | ✅ | One gain chain, one duck curve, one loudness gain and one limiter for preview and export (§2–§6). |
| IX. Secure Desktop Shell | ✅ | No IPC change; the worklet is same-origin under the existing CSP. |
| X. Budgets and Accessibility | ⚠️ | Entry chunk: the scanner, meter and limiter load with `import()` (the Worker and worklet are separate chunks); keyboard, names and announcements for every control, checked in 290. |
| XI. Agents Use the Same Code | ⚠️ | Agent tools for audio come in 212 with the other timeline tools (Q18), as for 206 and 207. |

## Decisions for the maintainer (accepted 2026-10-18: D1–D6 as recommended)

- **D1 — The song becomes a sound clip.** `state.music: VMusic` is replaced by `state.sounds: VSound[]`; the music's own <audio> element, `musicClips()`, `updateMusic` and `MusicRow` go. *Recommended*: one model for every sound; the alternative (keeping `music` beside a new list) doubles every rule.
- **D2 — 8 audio tracks on the web too.** `TRACK_LIMITS` has 4 sound tracks on the web today (201); the spec (Q1) says 8 everywhere. Audio tracks cost no decoders by themselves (the videos-at-once limit still bounds video clips). *Recommended*: raise the web to 8; picture tracks stay 4 / 8.
- **D3 — The preview through Web Audio.** Clip and sound elements go through one `AudioContext` (gains, master, limiter worklet) instead of `element.volume`, which can't pass 100 % or follow the duck curve exactly. *Recommended*; spike first (risk 1).
- **D4 — Loudness measured on the real mix.** A sound-only pass before the export (or the panel's background measurement when still valid), plus one corrective pass only when the limiter would reduce more than 1 dB. *Recommended*: exact and cheap next to encoding pictures; the alternative (estimating from per-file scans) can be off by several LU for correlated sounds.
- **D5 — One background scan per file**, in a module Worker, streamed with Mediabunny: peaks (100 / s) and 50 ms RMS, kept in memory per media id (not saved). *Recommended*; ducking and waveforms then cost no decoding per edit.
- **D6 — Volume ranges.** Sound clips 0–200 % (with keys on 0–2); video clips' own sound stays 0–100 % as today (205 Q8). *Recommended*: the spec only asks 200 % for sound clips; widening video clips can come with "Extract sound" (Q15).
