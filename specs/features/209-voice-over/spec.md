<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 209 — Voice-over

**Status:** Approved
**Roadmap phase:** Phase 2 — Multi-track timeline (release 3.0.0) · **Created:** 2026-10-19

## Summary

Vlogs, tutorials, reviews and travel Reels are narrated, and today a creator has to record the voice in another app, export it, and import the file as a sound clip, then line it up by ear. 209 adds **voice-over recording**: arm a Voice track, press Record, watch the video play from the playhead after a short count-in, and talk; when you stop, the take is an ordinary sound clip (208) on that Voice track, in sync with the picture it was spoken over, with its waveform, fades, volume and keyframes, and it counts as voice for ducking. A take recorded over part of an earlier one replaces just that part (punch-in), so a fluffed sentence is re-recorded without redoing the rest. The microphone is chosen and checked with a live level meter, is open only while the recording controls are open, and nothing leaves the device. It works the same in the browser and in the desktop app (which today refuses every microphone request, and the web app's headers forbid the microphone).

## User Stories

- **US-1:** As a vlogger, I want to talk over my video while I watch it play, so that my narration matches what is on screen without lining it up by hand.
- **US-2:** As a creator who fluffed one sentence, I want to re-record just that part, so that I don't have to record the whole narration again.
- **US-3:** As a creator, I want to choose my microphone and see how loud I am before and while I record, so that my voice is neither too quiet nor clipped.
- **US-4:** As a privacy-minded user, I want the microphone to be on only while I'm recording, with a clear sign that it is, and my voice to stay on my device.
- **US-5:** As a creator, I want a take I recorded to behave like any other sound clip (edit, fade, duck the music under it, undo, save, export), and not to lose it if the tab or app closes mid-take.
- **US-6:** As a keyboard or screen-reader user, I want to arm, start, stop and check a recording without a mouse and hear what is happening (the count-in, recording, the take's length).

## Acceptance Criteria

### Recording

- [ ] **AC-1:** **Record voice** (in the Audio panel and on each Voice track's header, Q1) records onto a Voice track: the one whose button was used, else the selected Voice track, else the first Voice track; with no Voice track one named **Voice** is added (refused with the reason when there are already 8 audio tracks). Pressing Record starts a count-in (3 s by default; Off, 3 or 5 s, Q4), then the preview plays from the playhead and the microphone records until **Stop**, the end of the video, or a take length of 60 min (Q5, Q7). The take becomes one sound clip that starts on the timeline at the playhead's position when recording began and is as long as the recording, within 20 ms, named “Voice 1”, “Voice 2” … in recording order. Cancelling during the count-in records nothing. _(unit)_
- [ ] **AC-2:** **Punch-in** (Q2): where a take overlaps sound clips on the track it was recorded on, the overlapped parts are removed (a clip fully covered is deleted, one partly covered is trimmed, one that covers the whole take is split around it), so the track never holds overlapping clips (208 AC-2). Other tracks are untouched. The take and these changes are **one undo step**: undo restores the earlier clips exactly and removes the take; redo puts it back. _(unit)_
- [ ] **AC-3:** **Sync**: a word spoken while a frame is on screen lands on that frame in the take. The take is placed using the input and output latency the browser reports, plus a **Recording offset** of −250 to +250 ms (0 by default) remembered per microphone (Q10). For a fixture with a known reported latency and a simulated input delayed by it, the take's start is within 5 ms of the true position. (A clap test on real hardware, within one frame at 30 fps, is a deferred manual check.) _(unit)_

### Microphone

- [ ] **AC-4:** **Microphone choice and level**: the recording controls list the microphones (the system default first; names once permission is given) and remember the choice per device; unplugging the chosen one falls back to the default and says so. A **level meter** shows the input's peak in dBFS at least 20 times a second while the controls are open, whether or not recording, and marks **Too loud** for 2 s after a peak at or above −1 dBFS. **Voice clean-up** (the browser's echo cancellation, noise suppression and automatic gain, off by default, Q6) is one switch, remembered per device. For a fixture of tone bursts at known levels the meter's readings are within 0.5 dB. _(unit)_
- [ ] **AC-5:** **Hearing the video while recording** (Q3): by default the picture plays with its sound muted, so speakers aren't recorded into the take; **Hear the video (use headphones)** plays the preview's mix while recording. The track being recorded onto is never played back during the take. _(unit)_

### Errors

- [ ] **AC-6:** **Every failure is explained, and nothing recorded is lost**: microphone permission refused (how to allow it in the browser or in the system settings on desktop), no microphone, the microphone in use by another app, not a secure page (web on plain http), recording not supported by the browser, and the microphone unplugged or failing mid-take. Each shows a message with the reason and what to do, is logged with `logError('handled', …)`, and leaves the project unchanged, except that a take cut short by a failure keeps everything recorded up to it and says so (“Voice 3 kept: 41.2 s, the microphone stopped”). _(unit)_

### Privacy

- [ ] **AC-7:** **The microphone is open only while it is needed**: it is opened when the recording controls are opened (for the level meter) and every input track is stopped within 1 s of closing them, leaving the video workspace or the tab being hidden while not recording. While recording, a red **Recording** sign with the elapsed time shows on the stage and the timeline. The recording is stored only on the device, as imported sound files are, and sent nowhere. The web app's Permissions-Policy allows the microphone for its own page only (camera, geolocation and payment stay off), and the desktop app grants microphone access only to its own page and only for audio: a request for the camera, the screen or from any other origin is refused (Q12). _(unit)_

### The take

- [ ] **AC-8:** **A take is an ordinary sound clip**: it has its waveform (208 AC-4), can be moved, trimmed, split, faded, keyframed and deleted like any sound clip, counts as voice for ducking on Music and Effects tracks (208 AC-6, updated within 1 s of the take ending), is saved with the project and found again after a reload or reopening the desktop app, and is in the export. Its file is a format the app's sound import accepts (Q7) and is kept as the project's own media (408: `keepMedia(file, true)`, copied into the browser's project storage, or into `library/media/` in the desktop app), so it is there whenever the project is reopened, and deleting the last project that uses it frees it. _(unit)_
- [ ] **AC-9:** **Crash safety** (Q8): while recording, the take is saved to the device at least once a second. If the tab or app closes, crashes or loses power mid-take, the next time the project is opened it offers “Recover voice recording (Voice 3, 41 s, recorded 19 Oct 14:02)”: **Add to the timeline** places it where it was being recorded (with punch-in, one undo step) and **Discard** deletes it. At most the last 2 s are lost. Recordings not recovered or discarded within 30 days are deleted. _(unit)_

### Keyboard and screen readers

- [ ] **AC-10:** Every control is reachable and works from the keyboard: Record / Stop with a key in the video workspace (Shift + R, Q11) as well as the buttons, Esc cancels a count-in. Screen readers hear the count-in (“Recording in 3, 2, 1”), the start (“Recording on Voice”), a Too loud warning at most once every 5 s, and the result (“Voice 2 added at 0:12.4, 8.6 s; replaced 2.1 s of Voice 1”). axe finds no violations with the recording controls open and while recording. (Proven in 290 with Playwright's fake microphone.) _(e2e)_

### Web and desktop

- [ ] **AC-11:** Recording works the same in the browser (Chromium, Firefox, Safari where they can record, on desktop and phone layouts) and in the desktop app on Windows and macOS (Constitution V): in an end-to-end test with a fake media stream, a 5 s take is recorded, lands at the playhead, plays in the preview and is in the exported MP4's sound within 20 ms of where it was placed. On macOS the desktop app asks for the system's microphone permission the first time and says how to allow it in System Settings when it was refused. (Proven in 290.) _(e2e)_

### Performance

- [ ] **AC-12:** Recording does not slow the preview: while recording a 10-minute take over a 1080p 30 fps project on the reference laptop, the preview drops no more frames than when playing without recording (within 1 %), memory grows by at most 20 MB for the take, and the entry chunk stays ≤ 350 KB (the recording code loads with `import()` when the controls are first opened). (Measured in 290.) _(timing)_

### Docs

- [ ] **AC-13:** `docs/MEDIA-STUDIO.md` (recording, punch-in, microphone, sync offset, privacy, recovery, keys, limits), `docs/DESKTOP.md` (the microphone permission on Windows and macOS), `specs/lld.md` (the recorder, the latency placement, the permission rules), `CHANGELOG.md` and the in-app docs describe the change; the media studio's “Still to do” no longer lists voice-over recording. _(review)_

## Non-Functional Requirements

- **Performance:** recording never blocks or slows the timeline or the preview (AC-12); the recorder code loads with `import()` when the recording controls are first opened, so the entry chunk stays ≤ 350 KB; a take is written to the device as it is recorded, not held in memory.
- **Accuracy:** a take is placed within 20 ms of where it was recorded (AC-1), within 5 ms of the true position given the reported latency (AC-3); the meter is within 0.5 dB (AC-4).
- **Privacy and security:** the microphone is open only while the recording controls are open or a take is recording (AC-7); nothing is uploaded; only the app's own page may use the microphone, and only for audio, on web and desktop (Q12); any new IPC message goes through `electron/ipc.cjs` and validates its arguments; the CSP stays as strict (no new hosts).
- **Reliability:** a failure mid-take keeps what was recorded (AC-6); a crash loses at most the last 2 s (AC-9).
- **Accessibility:** every control works from the keyboard and is announced; axe passes (AC-10).
- **Compatibility:** web and desktop alike (Constitution V); no new dependency (the browser's own recording and Web Audio); every existing project opens and exports unchanged.
- **Free and open source:** recording is for everyone, on the web and in the desktop app.

## Out of Scope

- Take lanes / keeping every attempt (Q9); pre-roll before the punch-in point (Q4); a guided sync calibration (Q10).
- Our own noise removal, EQ, compression or other voice effects (Q6); speech-to-text and captions (Phase 3).
- Recording the camera, the screen or system sound; several microphones at once; stereo recording.
- Recording in the photo studio or the print studio.
- Agent tools for recording (Q14).

## Open Questions

- **Q1** _(resolved)_ Where are the recording controls? _Answer (accepted 2026-10-19):_ a **Record voice** section in the Audio panel (microphone, meter, count-in, clean-up, offset, Record) plus a record button on each Voice track's header that opens it with that track chosen. No separate recording screen.
- **Q2** _(resolved)_ What happens when a take overlaps earlier sound on its track? _Answer (accepted 2026-10-19):_ punch-in: the take replaces the overlapped parts (trim, split or delete, one undo step), as in audio editors, so re-recording a sentence is one take. Alternatives: refuse to start where the track isn't free, or put the take on a new track. Overlap is checked only on the track recorded onto.
- **Q3** _(resolved)_ Should the video's sound play while recording? _Answer (accepted 2026-10-19):_ muted by default (laptop speakers would be recorded into the take and the ducking would treat them as voice); a switch **Hear the video (use headphones)** plays the mix, still without the track being recorded.
- **Q4** _(resolved)_ Count-in and pre-roll? _Answer (accepted 2026-10-19):_ a count-in of Off / 3 s (default) / 5 s, shown on the stage, with no sound (no beeps, which would be recorded). No pre-roll (playing a few seconds before the punch-in point) in 209: it would need the take to start later than playback; it can come later.
- **Q5** _(resolved)_ When does recording stop by itself? _Answer (accepted 2026-10-19):_ at the end of the video (the preview stops there and sound past the end isn't heard, 208 Q6), at 60 min, or on a failure. It does **not** stop at the next clip on the track: punch-in (Q2) replaces it, which the result announcement reports.
- **Q6** _(resolved)_ The browser's own voice processing (echo cancellation, noise suppression, automatic gain)? _Answer (accepted 2026-10-19):_ off by default, because it dulls the voice and pumps the level, and creators usually record with the speakers muted (Q3); one switch **Voice clean-up** turns all three on for people recording on laptop speakers or in noisy rooms. Noise removal of our own is out of scope (a later item).
- **Q7** _(resolved)_ What format and limits? _Answer (accepted 2026-10-19):_ whatever the browser records natively that our sound import accepts: Opus in WebM on Chromium, Electron and Firefox, AAC in MP4 on Safari, mono, at the microphone's rate; up to 60 min per take (about 60 MB at 128 kb/s, under 208's 100 MB per sound file). No re-encoding to WAV (it would be 10× larger and the export re-encodes to AAC anyway).
- **Q8** _(resolved)_ Crash recovery for a take in progress? _Answer (accepted 2026-10-19):_ yes: chunks saved to the device every second (IndexedDB on the web, the data folder on desktop), offered on next open, deleted after 30 days if ignored. A long narration lost to a crash is the worst failure this feature can have.
- **Q9** _(resolved)_ Takes and take lanes (keeping every attempt and choosing between them)? _Answer (accepted 2026-10-19):_ out of scope for 209: the replaced take is gone except through undo. Take lanes are a later item if people ask.
- **Q10** _(resolved)_ How is sync made right? _Answer (accepted 2026-10-19):_ automatically from the latencies the browser reports (the audio context's output and base latency and the input's own latency where available), plus a manual **Recording offset** of −250 to +250 ms per microphone for hardware the browser misreports (Bluetooth headsets). A guided clap-test calibration is out of scope.
- **Q11** _(resolved)_ Which key starts and stops recording? _Answer (accepted 2026-10-19):_ Shift + R in the video workspace (R alone is free today but is a common single-key tool in editors, so it is left for later); Space still plays and pauses and, while recording, stops the take as well.
- **Q12** _(resolved)_ How far do the permission changes go? _Answer (accepted 2026-10-19):_ web: `Permissions-Policy` becomes `microphone=(self)`, camera, geolocation and payment stay `()`. Desktop: the permission handlers grant `media` only when the request comes from the app's own `app://chitthi` page and asks for audio only; video, screen capture and every other origin are refused, as now. macOS: the app declares a microphone usage description and asks the system for access on first use. Windows uses its own privacy setting, which we explain when access fails.
- **Q13** _(resolved)_ Does recording work on phones (the web app's phone layout)? _Answer (accepted 2026-10-19):_ yes, with the same controls in the Audio panel; the phone project of the e2e tests covers it in 290. Recording with the screen locked or the tab in the background is not supported (the browser pauses it): the take stops and keeps what was recorded (AC-6).
- **Q14** _(resolved)_ Agent tools for recording? _Answer (accepted 2026-10-19):_ none: an agent can't speak into the microphone; agent tools for audio belong to 212.

## Changelog

- 2026-10-19 — Created: draft spec with 13 acceptance criteria and 14 open questions with proposed answers.
- 2026-10-19 — Q1–Q14: every proposed answer accepted by the maintainer; Approved.
- 2026-10-19 — Plan drafted (§1–§10, D1–D3 for the maintainer).
- 2026-10-19 — Plan D1: option C chosen by the maintainer: video and photo project saving comes first as its own feature (408); 209 waits for it.
- 2026-10-19 — AC-8 re-read against 408 (D-058, 408 T111): a finished take is the project's own media (`keepMedia(file, true)`) and reopens with the project; the `.chitthi` clause is dropped (project files are 409, 408 Q7). The take store keeps takes in progress only, for crash recovery (AC-9).
