<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 209 — Voice-over · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (D1: C, 408 implemented; D2, D3 as recommended, 2026-10-19) <!-- Draft | Approved -->

## Approach

Today a voice can only come in as a file (208's **Add sound**). 209 adds a recorder that turns the microphone into the same thing: a `VSound` with a `Blob` and an object URL, placed on a Voice track by a pure engine function and committed with one `change()` (one undo step). Everything after the take ends (waveform, ducking, edits, export) is 208's code, unchanged. The browser's own pieces do the hard parts: `getUserMedia` for the microphone, `MediaRecorder` for encoding (Opus in WebM, AAC in MP4 on Safari, Q7), an `AnalyserNode` for the meter. No new dependency. Under D-033 every task is proven by unit tests on pure functions and on the recorder with injected fakes; the fake-microphone e2e, the clap test and the timing run go to 290.

**§1 Where a take goes (`engine/voiceTake.ts`, AC-1).** `recordTarget(tracks, chosen, selected)` picks the Voice track (the button's, else the selected Voice track, else the first Voice track) or adds one named **Voice** with role Voice (`addAudioTrack` + `setAudioTrack`), or returns 208's eight-track refusal. `takeName(sounds)` is “Voice N”, N one more than the highest “Voice N” already in the project. `canRecord(video)` refuses with the reason when the video is empty, the playhead is at its end, or the track is locked.

**§2 Punch-in (`engine/soundClips.ts`, AC-2).** `punchIn(audio, track, start, end, ctx)` clears `[start, end)` on one track: a clip inside it is deleted, one overlapping an edge is trimmed (its keys stay on the same sound, as `trimSound` does), one covering the whole span is split around it (`splitKeys`), a `toEnd` clip is first turned into a fixed length (as `moveSound` does past the end). `placeTake(audio, tracks, take, start, track, ctx)` = `punchIn` + the take on exactly that track, never another; it returns the new clips and what was replaced (seconds per clip name) for the announcement. Pure, so AC-2 is a unit test, and one `change('', { sounds, tracks })` makes the take, the punch-in and a new Voice track one undo step.

**§3 Sync (`engine/voiceTake.ts`, AC-3).** The preview's clock is wall time: `usePlayback` (VideoStage.tsx) maps `performance.now()` to the playhead from a `(startTime, startWall)` pair. Recording starts playback from the recorder's `start` event, and the recorder reads that pair (§5). `takeStart({ playStart, playWall, captureWall, inputLatency, offset })` returns the timeline second of the take's first sample: the playhead at the moment capture began, minus the input latency (the microphone hears a word that much before the recorder gets it), plus the user's **Recording offset** (−250 to +250 ms, per microphone, Q10). Output latency matters only for the video's sound, which is muted by default (Q3), and the picture is drawn in the same frame as the playhead, so the input side is what is compensated. `inputLatency` comes from the track's `getSettings().latency` where the browser reports it, else the audio context's `baseLatency`, else 0. The take's length is measured from its file (§6), not the wall clock, and checked against it (within 20 ms, AC-1).

**§4 The microphone (`lib/microphone.ts`, `engine/voiceLevel.ts`, AC-4, AC-5).** `lib/microphone.ts` wraps `navigator.mediaDevices`: `listMicrophones()` (default first), `openMicrophone(deviceId, cleanUp)` (audio only, mono; `echoCancellation`, `noiseSuppression`, `autoGainControl` all equal to the **Voice clean-up** switch, Q6), `onDevicesChanged()`, and `micFailure(error)` mapping `NotAllowedError`, `NotFoundError`, `NotReadableError`, `SecurityError` / no secure context, and a missing `MediaRecorder` to the messages of AC-6 (desktop: “Allow Chitthi Studio under Privacy → Microphone in System Settings” on macOS, “Settings → Privacy & security → Microphone” on Windows). The meter is an `AnalyserNode` on its own `AudioContext`; `engine/voiceLevel.ts` has `peakDbfs(samples)` and `tooLoud(history, now)` (≥ −1 dBFS, held 2 s) as pure functions, read at least 20 times a second (a rAF loop throttled to 30 Hz). Choices (microphone, clean-up, count-in, offset per microphone, Hear the video) are saved in `localStorage` (`chitthi.voice`, try/catch) and validated on read.

**§5 The recorder (`state/voiceRecorder.ts`, AC-1, AC-5–AC-7).** A small store (`useSyncExternalStore`, like the others, no undo) with phases `closed → ready → countIn → recording → finishing`, and the current level, elapsed time and message. Its IO is injected (`recorderIO`: microphone, `MediaRecorder` maker, clock, timers, the take store), so unit tests drive it with fakes, time as input (Constitution II). `openControls(track)` opens the microphone for the meter (AC-7); `closeControls()`, leaving the workspace, and `visibilitychange` to hidden while not recording stop every input track at once (well under 1 s). `record()` runs the count-in (Off / 3 / 5 s, Esc or Stop cancels with nothing recorded), then `recorder.start(1000)`, and on its `start` event sets `recording` in the video store and starts playback (§3). It stops on Stop / Shift + R / Space, when playback reaches the end of the video (`playing` turns false), at 60 min, or when the track ends (unplugged, background tab on a phone, Q13), keeping what was recorded (AC-6). Then §6, §2, one `change()`, `scanMedia()` (208's waveform and ducking scan) and the announcement.

**§6 Takes on the device (`lib/takeStore.ts`, AC-8, AC-9, D1, re-read against 408).** A take **in progress** is kept for crash recovery only: each `dataavailable` chunk (every second) is appended to IndexedDB, database `chitthi-takes` (its own, so `chitthi`'s version doesn't change), store `takes`: `{ id, name, startedAt, track, start, mime, chunks: Blob[], done }`. In the desktop app this IndexedDB lives in the pinned data folder (`%APPDATA%\Chitthi`, Q8), so no new IPC is needed. On stop the chunks are joined into one `Blob`; its length is the decoded length (Mediabunny's `Input.computeDuration()` misses the last packet in WebM: 60 ms on Chromium, 20 ms on Firefox, T001) (MediaRecorder's WebM has no duration header, so the `<audio>` element reads Infinity: R1), which also proves the file decodes before it is placed. The finished take is then kept as the project's own media with 408's `keepMedia(file, true)` (owned: copied into OPFS in the browser, written into `library/media/<id>` on desktop) before `addTake()` places it, and its entry in `chitthi-takes` is deleted once the clip is on the timeline: from then on the project (408's autosave) holds it. A full disk (`QuotaExceededError`, or the media store's 'no room') keeps the take on the timeline in memory and says it can't be kept. Takes in progress older than 30 days are deleted when the store opens. Recovery of an interrupted take: AC-9, D1.

**§7 The preview while recording (`state/videoStore.ts`, `components/studio/VideoStage.tsx`, `previewSound.ts`, AC-5).** `VState.recording: { track: string; hear: boolean } | null` (not saved, not undone, leaves the last export current). `soundsAt` skips the recorded track while `recording` is set, and the stage sets the master gain to 0 unless `hear`. `usePlayback` writes its `(startTime, startWall)` to `playClock` in the store, which the recorder reads (§3). The **Recording** sign (red dot, elapsed time, `role="status"`) shows on the stage and on the track's row.

**§8 The UI (`components/studio/RecordVoice.tsx`, `AudioPanel.tsx`, `TrackHead.tsx`, `VideoWorkspace.tsx`, AC-1, AC-10, AC-12).** A **Record voice** group in the Audio panel (Q1), loaded with `lazy()` so the recorder and the meter stay out of every other chunk: microphone menu, meter (a bar with −60…0 dBFS, Too loud), Voice clean-up, Hear the video (use headphones), count-in (Off / 3 / 5 s), Recording offset, the target track, **Record** / **Stop**, and the messages. Voice tracks' headers get a record button that opens the Audio panel with that track chosen. VideoWorkspace's key handler gets Shift + R (record / stop) and Esc (cancel a count-in); Space stops a take (Q11). Announcements go through 208's `tell()` live region (AC-10's wording, Too loud at most every 5 s).

**§9 Permissions (`nginx/security-headers.conf`, `electron/permissions.cjs`, `electron/main.cjs`, `electron-builder.yml`, `build/entitlements.mac.plist`, AC-7, AC-11).** Web: `microphone=(self)`; camera, geolocation and payment stay `()` (vite preview reads the CSP from the same file; it is changed to send the Permissions-Policy too, so e2e sees it: T001 found it sends only the CSP). Desktop: the request and check handlers move into a new `electron/permissions.cjs` with one pure predicate, `allowed(permission, details, appOrigin)`: today's two permissions, plus `media` only when the requesting origin is `app://chitthi` and the media types are exactly `['audio']` (the check handler: `mediaType === 'audio'`). On macOS the request handler first asks the system (`systemPreferences.getMediaAccessStatus('microphone')`, `askForMediaAccess`), and the build adds `NSMicrophoneUsageDescription` (`mac.extendInfo`) and the `com.apple.security.device.audio-input` entitlement, which the hardened runtime needs. No IPC handler is added. The new file goes into `files:` in `electron-builder.yml`. The CSP needs nothing: `media-src 'self' blob:` already covers playing the takes.

**§10 Docs (AC-13).** `docs/MEDIA-STUDIO.md` (Record voice section, keys, limits, privacy, recovery; “Still to do” drops voice-over), `docs/DESKTOP.md` (microphone permission on Windows and macOS), `specs/lld.md` (recorder phases, placement formula, take store, permission predicate), `CHANGELOG.md`, the in-app docs (`src/data/docs.ts`).

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/engine/voiceTake.ts`, `tests/unit/engine/voiceTake.test.ts` | new | §1, §3: `recordTarget`, `takeName`, `canRecord`, `takeStart` (AC-1, AC-3) |
| `src/engine/soundClips.ts`, `tests/unit/engine/soundClips.test.ts` | modify | §2: `punchIn`, `placeTake` (AC-2) |
| `src/engine/voiceLevel.ts`, `tests/unit/engine/voiceLevel.test.ts` | new | §4: `peakDbfs`, `tooLoud` (AC-4) |
| `src/lib/microphone.ts`, `tests/unit/lib/microphone.test.ts` | new | §4: devices, constraints, `micFailure` messages, saved choices (AC-4, AC-6) |
| `src/lib/takeStore.ts`, `tests/unit/lib/takeStore.test.ts` | new | §6: chunks in IndexedDB `chitthi-takes`, list, join, delete, 30-day sweep (AC-9) |
| `src/state/voiceRecorder.ts`, `tests/integration/state/voiceRecorder.test.ts` | new | §5: the recorder store and its phases with injected IO (AC-1, AC-5–AC-9) |
| `tests/support/fakeMicrophone.ts` | new | Fake media stream, track, MediaRecorder and clock for the recorder tests |
| `src/state/videoStore.ts`, `src/state/videoSound.ts` | modify | §5, §7: `recording`, `playClock`; `addTake()` committing a placed take (one undo step) |
| `src/components/studio/previewSound.ts`, `src/components/studio/VideoStage.tsx` | modify | §7: the recorded track silent, the mix muted unless Hear the video; the play clock; the Recording sign |
| `src/components/studio/RecordVoice.tsx`, `src/components/studio/AudioPanel.tsx` | new / modify | §8: the Record voice group (lazy), recovery list (D1) |
| `src/components/studio/TrackHead.tsx`, `src/components/studio/VideoWorkspace.tsx` | modify | §8: record button on Voice tracks; Shift + R, Esc, Space |
| `src/styles/36-media-studio.css` | modify | §8: meter, Recording sign, record button |
| `electron/permissions.cjs`, `tests/unit/electron/permissions.test.ts` | new | §9: the permission predicate and handlers, macOS system prompt (AC-7) |
| `electron/main.cjs`, `electron-builder.yml`, `build/entitlements.mac.plist` | modify | §9: use permissions.cjs; `files:`; `NSMicrophoneUsageDescription`; audio-input entitlement |
| `nginx/security-headers.conf`, `vite.config.ts` | modify | §9: `microphone=(self)`; preview sends the Permissions-Policy (T001) |
| `docs/MEDIA-STUDIO.md`, `docs/DESKTOP.md`, `specs/lld.md`, `CHANGELOG.md`, `src/data/docs.ts` | modify | §10 (AC-13) |
| `specs/features/290-phase2-test-pass-release/feature.json` | modify | Deferred checks: fake-microphone e2e (AC-10, AC-11), clap test (AC-3), timing run (AC-12) |

## Data Structures & Interfaces

```ts
// engine/voiceTake.ts
export type RecordTarget = { track: string; tracks: Track[] } | Refusal; // tracks: with a new Voice track when one was added
export function recordTarget(tracks: Track[], chosen: string | null, selected: string | null): RecordTarget;
export function takeName(sounds: readonly Pick<AudioClip, 'name'>[]): string; // "Voice 3"
export function canRecord(video: Pick<VState, 'tracks'> & { length: number; playhead: number }, track: string): string | null;
export interface TakeTiming {
  playStart: number;    // the playhead when playback began, s
  playWall: number;     // performance.now() then, ms
  captureWall: number;  // performance.now() at the recorder's start event, ms
  inputLatency: number; // s
  offset: number;       // the Recording offset, s (−0.25…0.25)
}
export function takeStart(timing: TakeTiming): number; // s on the timeline, ≥ 0

// engine/soundClips.ts
export interface Replaced { name: string; seconds: number }
export function punchIn<A extends AudioClip>(audio: A[], track: string, start: number, end: number, ctx: SoundCtx): SoundDone<A> & { replaced: Replaced[] } | Refusal;
export function placeTake<A extends AudioClip>(audio: A[], take: A, ctx: SoundCtx): SoundDone<A> & { replaced: Replaced[] } | Refusal;

// engine/voiceLevel.ts
export function peakDbfs(samples: Float32Array): number; // −Infinity for silence
export function tooLoud(lastLoudAt: number | null, now: number): boolean; // within 2 s of a peak ≥ −1 dBFS

// lib/microphone.ts
export interface Microphone { id: string; label: string }
export interface VoicePrefs { device: string | null; cleanUp: boolean; countIn: 0 | 3 | 5; hear: boolean; offsets: Record<string, number> }
export function micFailure(error: unknown, where: { desktop: boolean; platform: string; secure: boolean }): string;

// lib/takeStore.ts
export interface StoredTake { id: string; name: string; startedAt: number; track: string; start: number; mime: string; chunks: Blob[]; done: boolean }
export const takeStore: { begin(take: Omit<StoredTake, 'chunks' | 'done'>): Promise<void>; append(id: string, chunk: Blob): Promise<void>; finish(id: string): Promise<void>; list(): Promise<StoredTake[]>; remove(id: string): Promise<void>; sweep(now: number): Promise<void> };

// state/voiceRecorder.ts
export type RecorderPhase = 'closed' | 'ready' | 'countIn' | 'recording' | 'finishing';
export interface RecorderState { phase: RecorderPhase; track: string | null; level: number; loud: boolean; countdown: number; elapsed: number; microphones: Microphone[]; message: string }
export const recorderIO: { /* microphone, makeRecorder, now, setTimer, store */ };
export function openControls(track?: string): Promise<void>;
export function closeControls(): void;
export function record(): Promise<void>;
export function stop(reason?: string): Promise<void>;

// state/videoStore.ts (VState, not saved, not undone)
recording: { track: string; hear: boolean } | null;
playClock: { startTime: number; startWall: number } | null;
```

## Techniques

- **MediaRecorder with a 1 s timeslice** (`start(1000)`): each `dataavailable` chunk is appended to IndexedDB at once, so a crash loses at most the chunk in flight (≤ 2 s, AC-9). The chunks of one recording joined in order form a valid file (WebM clusters; Safari's fragmented MP4): R2's spike checks both. MIME: the first of `audio/webm;codecs=opus`, `audio/mp4;codecs=mp4a.40.2`, `audio/mp4` that `MediaRecorder.isTypeSupported` accepts, at 128 kb/s mono.
- **Length and decodability from Mediabunny** (already shipped, MPL-2.0, loaded with `import()`): `Input.computeDuration()` on the joined blob. If it can't read the file, the take is kept as a recovery entry with “couldn't be read” and **Save as file** (nothing recorded is lost, AC-6).
- **Placement** is the pure `takeStart` (§3) fed by one clock: `performance.now()` for both playback and the recorder's `start` event. The `start` event fires when capture begins, so the wall time read there is the take's sample 0.
- **No audio thread**: the meter reads an `AnalyserNode` (`getFloatTimeDomainData`, 2048 samples) on the main thread at 30 Hz; MediaRecorder encodes off the main thread. Nothing runs per sample in JavaScript, so the preview isn't slowed (AC-12).
- **Releasing the microphone**: every path out (close, leave, hidden tab, failure, unmount) goes through one `release()` that stops each `MediaStreamTrack` and closes the meter's context; the browser's own recording indicator goes out with it (AC-7).
- **Security**: the desktop predicate checks the requesting origin and the exact media types; `getUserMedia` for video, `getDisplayMedia`, and every other origin stay refused. No IPC, no new host, no CSP change.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `tests/unit/engine/voiceTake.test.ts` (target track, new Voice track, 8-track refusal, names, can't record); `tests/integration/state/voiceRecorder.test.ts` (count-in Off / 3 / 5 and cancel, stop by Stop, at the end of the video, at 60 min; clip start and length within 20 ms with the fake clock) | unit, integration |
| AC-2 | `tests/unit/engine/soundClips.test.ts`: `punchIn` / `placeTake` for inside, each edge, covering, several clips, a `toEnd` clip, keyframes kept, other tracks untouched; `voiceRecorder.test.ts`: one undo step, undo restores exactly, redo | unit, integration |
| AC-3 | `voiceTake.test.ts`: `takeStart` with a known latency and a simulated input delayed by it (within 5 ms), offset ±250 ms, clamped at 0. Clap test on real hardware: **290** (manual) | unit; manual in 290 |
| AC-4 | `tests/unit/engine/voiceLevel.test.ts` (tone bursts at −40, −20, −6, −1, 0 dBFS within 0.5 dB; Too loud held 2 s); `tests/unit/lib/microphone.test.ts` (default first, saved choice, unplugged → default and message, clean-up constraints, prefs validated) | unit |
| AC-5 | `tests/unit/components/studio/previewSound.test.ts` (or the integration test): the recorded track not in the plan while recording; the mix silent unless `hear` | unit |
| AC-6 | `microphone.test.ts`: each failure → its message (web, macOS, Windows); `voiceRecorder.test.ts`: the track ending mid-take keeps the recording and says so, `logError('handled')` called, project unchanged on failures before recording | unit, integration |
| AC-7 | `voiceRecorder.test.ts`: every track stopped on close, leaving, hidden tab (fake clock: within 1 s); `tests/unit/electron/permissions.test.ts`: audio from `app://chitthi` allowed; video, audio+video, display capture, other origins refused; check handler; a test reads `nginx/security-headers.conf` for `microphone=(self)` and `camera=()` | unit |
| AC-8 | `voiceRecorder.test.ts`: the take is a `VSound` with the take's blob, scanned (`scanMedia` called), editable by 208's edits, role Voice counts for ducking | integration |
| AC-9 | `tests/unit/lib/takeStore.test.ts` (an in-memory backend behind the same interface, D3): chunks appended each second, list after a “crash”, join order, remove, 30-day sweep; `voiceRecorder.test.ts`: Add to the timeline places at the stored start with punch-in, one undo step | unit, integration |
| AC-10 | Playwright with Chromium's fake microphone (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`): keys, announcements, axe: **290** | e2e in 290 |
| AC-11 | Same, desktop and phone projects: a 5 s take at the playhead, in the exported MP4 within 20 ms; desktop app manually on Windows and macOS: **290** | e2e, manual in 290 |
| AC-12 | Timing run (10-minute take over 1080p 30 fps, dropped frames, memory) and the build's entry check: **290**; `npm run build` at the end of 209 checks the entry chunk | timing in 290; build |
| AC-13 | Review of the docs at the end of 209 | review |

## Risks & Mitigations

- **R1 MediaRecorder WebM has no duration** (Chrome writes a live stream: `<audio>` reports Infinity, which 208's `soundIO.length` rejects). Mitigation: measure with Mediabunny `computeDuration()` (§6); spike task T001 records 5 s in Chrome, Electron, Firefox and Safari and checks that the joined blob plays, scans, mixes in the export and reports its length within 20 ms. If Mediabunny can't read one browser's output, decode it with `decodeAudioData` on the window instead.
- **R2 Chunk joining and crash recovery** (Safari's fragmented MP4 joined from timeslices; a WebM cut mid-cluster after a crash). Mitigation: the spike also kills a recording mid-way (page reload) and checks the recovered blob decodes up to its last whole chunk; if a format can't be recovered, that browser gets recovery of finished takes only, and AC-9 says so (spec changelog).
- **R3 Sync accuracy** varies with hardware and browsers that misreport latency (Bluetooth). Mitigation: the manual Recording offset (Q10); the clap test in 290 on the maintainer's laptop with the built-in microphone and a USB one; if the reported latency makes it worse anywhere, fall back to 0 there.
- **R4 IndexedDB in unit tests** (Node has none). Mitigation: `takeStore` behind an interface with an in-memory implementation for tests; the IndexedDB part is thin and checked by the spike and by 290's e2e (reload mid-take). No new devDependency (D3, chosen 2026-10-19).
- **R5 macOS microphone permission under the hardened runtime**: without the audio-input entitlement the system silently returns silence. Mitigation: entitlement + `NSMicrophoneUsageDescription` in this feature; checked on the maintainer's Mac in 290 (AC-11). Unsigned builds still ask (the prompt names the app).
- **R6 Phones**: mobile browsers pause recording in the background and may switch the audio route (speaker to earpiece) when the microphone opens. Mitigation: the track-ended path keeps the take (AC-6); 290's phone project; documented.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec approved 2026-10-19 (Q1–Q14 accepted). AC-8 re-read against 408 (D-058, 2026-10-19): a take is saved as the project's own media and reopens with the project; the take store keeps takes in progress only (AC-9). |
| II. Test-Gated Delivery | ✅ | Pure functions and the recorder with injected IO and a fake clock are unit / integration tested; e2e (fake microphone), the clap test and the timing run are listed in 290 (D-033). |
| III. Simplicity and Small Dependencies | ✅ | Browser APIs (getUserMedia, MediaRecorder, AnalyserNode, IndexedDB) and Mediabunny, already shipped. No new dependency (R4 keeps `fake-indexeddb` optional). |
| IV. Memory Is Maintained | ✅ | Decisions D1–D3 go to `memory/decisions.md` when approved; spike findings to `learnings.md`. |
| V. Free and Open Source, Always | ✅ | Recording is the same on web and desktop; no limits differ. |
| VI. On the User's Device, No Backend | ✅ | Takes are stored only in the device's IndexedDB; no network call is added. |
| VII. Permissive Licences Only | ✅ | Nothing new to license. |
| VIII. What You See Is What You Get | ✅ | A take is an ordinary sound clip through 208's single gain chain for preview and export; the recorder only produces the file and its place. |
| IX. Secure Desktop Shell | ✅ | No IPC added. The permission predicate is narrowed to audio from `app://chitthi`; everything else stays refused; sandbox and fuses unchanged. |
| X. Budgets and Accessibility | ✅ | Record voice is `lazy()`-loaded (entry ≤ 350 KB, checked by `npm run build`); keyboard, live-region announcements and axe (AC-10 in 290); meter has a text value; reduced motion: the count-in is numbers, no animation. |
| XI. Agents Use the Same Code | ⚠️ | No agent tool (Q14, accepted: an agent can't speak into a microphone). A recorded take is an ordinary sound clip, so 212's audio tools will reach it. |

## Decisions for the maintainer

**D1 Video projects aren't saved, so what happens to takes after a reload?** The spec's AC-8 says a take is “saved with the project and found again after a reload … an exported `.chitthi` project carries it”, and AC-9 offers recovery “the next time the project is opened”. The video studio has no project saving today (the document shape and validator exist; nothing writes or opens a video project), so after a reload the timeline is empty and every clip is gone. Imported files are still on the user's disk; a recorded voice exists nowhere else.
- **A (recommended):** keep every take, finished or interrupted, in the take store for 30 days. The Record voice group lists **Recent recordings** that aren't on the current timeline (name, length, when), each with **Add to the timeline** (at the time it was recorded, on a Voice track, with punch-in, one undo step), **Save as file** (`.webm` / `.m4a`) and **Delete**. An interrupted take is marked “stopped early”. AC-8's reload sentence becomes “stays on the timeline while the project is open; after a reload it is in Recent recordings”, and the `.chitthi` clause is dropped (it comes with project saving). AC-9 keeps its numbers.
- **B:** keep only interrupted takes (as the spec has it); finished takes are lost on reload like the rest of the project; a **Save as file** button in the sound inspector.
- **C (chosen by the maintainer, 2026-10-19):** video and photo projects are saved and reopened, as a feature of their own (408, spec to write) that 209 builds on. A take is then saved with its project like any sound; the take store keeps only takes in progress for crash recovery (AC-9 as written). AC-8 stays as written once 408 defines what “the project” is; its `.chitthi` clause follows 408’s answer on project files.

**Re-read against 408 (2026-10-19, 408 T111):** projects now autosave with their media (408). A finished take is kept as owned media (`keepMedia(file, true)`) and saved with the project; the take store holds takes in progress only, for AC-9's recovery; AC-8's `.chitthi` clause is dropped until project files exist (409).

**D2 Where takes are stored on desktop.** Q8 says “the data folder on desktop”. **Recommended:** the renderer's IndexedDB on both; in the desktop app it lives in the pinned data folder (`%APPDATA%\Chitthi\IndexedDB`), so no new IPC handler or file code is needed. Alternative: files under `userData/takes/` through new IPC (more code, more attack surface, same result). **Chosen by the maintainer (2026-10-19): IndexedDB, as recommended** (D-061).

**D3 Tests for the take store.** **Recommended:** an in-memory implementation behind the same interface for unit tests, the thin IndexedDB part checked by the spike and 290 (R4). Alternative: add `fake-indexeddb` as a devDependency (MIT / Apache-2.0, not bundled). **Chosen by the maintainer (2026-10-19): the in-memory implementation, as recommended** (D-061).
