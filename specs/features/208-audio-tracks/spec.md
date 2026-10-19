<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 208 — Audio tracks, waveforms, ducking, loudness

**Status:** Implemented
**Roadmap phase:** Phase 2 — Multi-track timeline (release 3.0.0) · **Created:** 2026-10-18

## Summary

Sound is half of a Reel or a vlog, and today the editor has one song: a single music file on one track, playing from its offset to the end of the video, plus each video clip’s own sound. Creators layer more than that: a song, a sound effect on a cut, a second song after the first, an ambience bed, a recorded voice. And they need the song to step out of the way when someone speaks, and the finished video to be as loud as YouTube and Instagram expect, so it isn’t turned down or drowned out next to other videos. 208 turns the music track into real **audio tracks**: several tracks, each holding sound clips that are added, moved, trimmed, split and faded like picture clips; **waveforms** on every sound clip and on video clips’ own sound; **volume keyframes** on sound clips (205’s keyframes); **ducking**, which lowers music under speech by measuring how loud the voice tracks are; and a **loudness target** for the export (−14 LUFS for YouTube and Instagram). The preview and the export play the same mix. It is the base 209 (voice-over) records onto.

## User Stories

- **US-1:** As a creator making a Reel, I want several sounds on the timeline (two songs, a whoosh on a cut, a crowd ambience), each placed where I want it, so that my video sounds finished.
- **US-2:** As an editor, I want to see each clip’s sound as a waveform, so that I can cut on a beat or a word without listening to it over and over.
- **US-3:** As a vlogger, I want the music to dip automatically while I talk and come back up when I stop, so that my voice is clear without drawing volume curves by hand.
- **US-4:** As a creator, I want my export to be as loud as YouTube and Instagram expect, so that it isn’t turned down or too quiet next to other videos, and never clips.
- **US-5:** As an editor, I want to fade, set the volume of and keyframe each sound clip and each track, and undo any of it in one step.
- **US-6:** As a keyboard or screen-reader user, I want to add, place and adjust sound clips and tracks, and turn on ducking and the loudness target, without a mouse and hear what changed.

## Acceptance Criteria

### Audio tracks and sound clips

- [x] **AC-1:** A project has 1 to 8 audio tracks on web and desktop alike (Q1); the Music track every project has today is the first. Tracks can be added (named “Audio 2”, “Audio 3” …), renamed, reordered among the audio tracks, muted, soloed (Q2), locked and deleted (a track with clips asks first; one undo step). A ninth track, or deleting the last audio track, is refused with the reason. Each audio track has a role, **Music**, **Voice** or **Effects** (Q3): Music for the first and Effects for new ones by default. _(unit)_
- [x] **AC-2:** An audio track holds any number of sound clips that don’t overlap, from the files the music takes today (Q4). A sound clip has a start on the timeline, in and out points in its source, a volume from 0 to 200 % (−∞ to +6 dB) and a fade in and fade out of 0 to 10 s each (together not longer than the clip). It is added at the playhead on the chosen track (or the first track with room there; a new track when none has room and there are fewer than 8), and moved, trimmed, split, duplicated and deleted with the timeline’s tools as picture clips are (202: Snap, Slip on its source; Roll, Ripple and Slide within its track, Q5). An edit that would overlap another sound clip on the track, or run past the source’s end, is refused with the reason. Sound past the end of the video is not heard (Q6). _(unit)_
- [x] **AC-3:** Migration: a 2.x or 201–207 project’s music becomes one sound clip on the Music track that plays from its offset **to the end of the video** (Q7) with its volume, and its fade-out over the last min(1.5 s, a third of the video), as today. For 201’s to 207’s fixtures the export’s sound sources and gains equal the old ones exactly, and documents without new audio data stay byte-identical when saved. _(unit)_

### Waveforms

- [x] **AC-4:** Every sound clip and every video clip with sound shows its waveform on the timeline: peaks measured from the decoded sound in the background after import (the import itself is not slower), at least 100 peaks per second of source, scaled by the clip’s volume, fades and volume keyframes so the shape shows what is heard. A trimmed, slipped or sped-up clip (207) shows the part and speed it plays; a clip whose sound is silent (reversed, ramped, a freeze frame, a muted track) shows a flat line and says why on hover and to screen readers. For a fixture of tone bursts at known times and levels, the peaks are within 1 dB and 10 ms of the expected list. Peaks for up to 3 hours of sound per project take under 10 MB. _(unit)_

### Volume

- [x] **AC-5:** A sound clip’s volume can be keyframed with 205’s keyframes (the same diamonds, lane, easing and keys as a video clip’s volume), and each audio track has a volume from 0 to 200 % (Q8). What is heard at any time is the clip’s volume × its fades × its keyframed volume × its track’s volume × ducking (AC-6) × the loudness gain (AC-8), with gain changes smooth (no step longer than 5 ms). For a fixture with every one of these, the export’s gain at 1,000 checked times equals the expected value within 0.01 dB. _(unit)_

### Ducking

- [x] **AC-6:** **Ducking** is set per Music or Effects track (off by default, Q9): it lowers that track by an amount (default 12 dB, 3–30 dB) wherever the **voice** is speaking. Voice is the sound of Voice tracks plus the own sound of video and overlay clips (Q10), measured in 50 ms steps; it is speaking where its loudness is above a threshold (default −40 dBFS, −60 to −20), with pauses shorter than 0.5 s bridged so the music doesn’t pump between words. The music fades down over 0.3 s before speech starts and back up over 0.8 s after it stops (Q11). For a fixture with speech at 2.0–5.0 s and 8.0–8.6 s, the ducked track’s gain at every 10 ms equals the expected curve within 0.1 dB; with no voice the gain is unchanged. _(unit)_
- [x] **AC-7:** Ducking follows the edit: moving, trimming, muting or changing the volume of a voice clip or track updates the curve within 1 s of the change (measured in the background, never blocking the timeline). The ducking curve is drawn on the ducked track’s clips. The preview and the export apply the same curve, from one function (the one AC-6 checks). _(unit)_

### Loudness

- [x] **AC-8:** The export has a **Loudness** setting: Off, YouTube / Instagram −14 LUFS (the default for new projects, Q12), Quiet −16 LUFS, or a value from −24 to −9 LUFS. Loudness is measured as integrated loudness to ITU-R BS.1770-4 / EBU R 128: for EBU Tech 3341 test signals 1–5 (synthesised in the test) the measurement is within 0.1 LU of the expected value. The whole mix is turned up or down by one gain so it measures the target, and peaks are held at or below −1 dBTP true peak by a limiter (Q13): for a fixture mix the exported sound measures the target within 0.5 LU, and no sample exceeds −1 dBTP at 4× oversampling. Off leaves the mix as today. Projects from before 208 keep Off (AC-3). _(unit)_
- [x] **AC-9:** The Audio panel shows the mix’s measured loudness and true peak (“−18.4 LUFS, peak −2.1 dBTP; the export will be turned up 4.4 dB”), measured in the background within 2 s of a change for a 60-second project, and says when the limiter will work hard (more than 6 dB of reduction). The preview plays with the same loudness gain as the export (Q14). _(unit)_

### Keeping the edit

- [x] **AC-10:** Each change is one undo step: adding, moving, trimming, splitting or deleting a sound clip; a volume or fade drag however long; adding, renaming, reordering, muting, soloing, locking or deleting a track; any ducking or loudness setting. A seeded property test of 1,000 random sound clip, track, ducking and picture edits never leaves overlapping sound clips on a track, a clip outside its source, fades longer than their clip, or more than 8 audio tracks. _(unit)_

### Saving

- [x] **AC-11:** Audio tracks, sound clips, their keyframes, track roles and volumes, ducking and the loudness setting are saved with the project. The document validator clamps volumes, fades, ducking and loudness values to their ranges, drops overlapping or unknown-track clips with the reason, and keeps at most 8 audio tracks; at least 20 malformed documents never make it throw. A project with every case round-trips document → validator → document equal. The sound files themselves are kept as the music is today. _(unit)_

### Rendering

- [x] **AC-12:** The export mixes every audible sound clip, video clip sound and track with the gains of AC-5, AC-6 and AC-8, still in 10-second windows interleaved with the frames: memory for sound stays within today’s budget whatever the number of tracks, and for a fixture with 8 tracks the export’s sound sources and gain curves equal the expected list exactly. _(unit)_

### Editing

- [ ] **AC-13:** The Audio panel adds sound files (at the playhead, on the chosen track), lists the tracks with their role, volume and ducking, and has the loudness setting with its readout (AC-9). Audio tracks have headers like the others (name, Mute, Solo, Lock, volume, role, ducking) and an **Add audio track** button; sound clips show their name, waveform, fade handles at their top corners and their volume line. The inspector of a selected sound clip has volume, fades, its keyframes and its source. Everything is in the in-app docs. _(e2e (290))_
- [ ] **AC-14:** Everything in AC-13 works from the keyboard (fade handles and the volume line included, with ← / → and ↑ / ↓, Shift for larger steps); every control has a name and state for screen readers and each change is announced (clip or track, what changed, the new value); axe finds no serious problems in the Audio panel, inspector and timeline; at 360 px wide nothing scrolls sideways outside the timeline. _(e2e (290))_

### Listening and timing

- [ ] **AC-15:** Listening test (noted in `specs/testing-strategy.md`): a 60-second vlog with music on the Music track, a voice on a Voice track and two effects is exported with ducking on and −14 LUFS; the music dips under every sentence without pumping between words, nothing clicks at cuts, fades or ducking edges, and the preview sounds the same as the export. YouTube’s “Stats for nerds” shows a content loudness within 1 dB of 0 dB for the uploaded file. _(manual (290))_
- [ ] **AC-16:** On the reference mid-range laptop: a 60-second Reel with 4 audio tracks, ducking and the loudness target exports at most 15 % slower than the same Reel with one song and loudness Off; the preview plays it with no more dropped frames than with one song; waveforms of a 10-minute video appear within 10 s of import without dropping preview frames. No regressions: projects without new audio give identical export inputs to 207, and every existing video e2e test passes unchanged. _(timing (290))_

### Docs

- [x] **AC-17:** `docs/MEDIA-STUDIO.md` (audio tracks, sound clips, waveforms, ducking, loudness, keys, limits), `specs/lld.md` (the audio model, the gain chain, the ducking and loudness measurement), `specs/testing-strategy.md` (the listening test), `CHANGELOG.md` and the in-app docs describe the change; the media studio’s “Still to do” no longer lists several music tracks and clip waveforms. _(review)_

## Non-Functional Requirements

- **Performance:** waveforms, ducking and loudness are measured in the background and never block the timeline or the import; the export costs at most 15 % more for 4 tracks with ducking and loudness (AC-16); sound memory stays within today’s budget whatever the number of tracks (AC-12); the entry chunk stays ≤ 350 KB (sound measuring code loads with `import()` when used).
- **Accuracy:** loudness measured to BS.1770-4 within 0.1 LU on EBU Tech 3341 signals, exports within 0.5 LU of the target and ≤ −1 dBTP (AC-8); gains within 0.01 dB of the expected chain (AC-5); ducking within 0.1 dB of its curve (AC-6).
- **What you hear is what you export:** the preview and the export use the same gain chain, ducking curve and loudness gain (AC-5–AC-9, Constitution VIII).
- **Accessibility:** every control works from the keyboard and is announced; waveforms have a text equivalent (clip name, length, whether it is silent and why); axe passes (AC-14).
- **Compatibility:** web and desktop alike; no new dependency (loudness measurement and the limiter are hand-written, Q13); every existing project opens and exports unchanged (AC-3, AC-16).
- **Free and open source:** every audio feature is for everyone, on the web and in the desktop app.

## Out of Scope

- Voice-over recording (209).
- EQ, noise removal, compression other than the output limiter, reverb or other effects; pan (Q8).
- Speech recognition for ducking (voice is measured by loudness, Q10); adjustable duck fade times (Q11).
- “Extract sound” from a video clip, and sound clips linked to picture clips (Q15, Q16).
- Sound for reversed and ramped clips; same-pitch sound outside 0.5×–2× (Q17).
- Sound-only videos; sound lengthening the video (Q6).
- Agent tools for audio (212, Q18).

## Open Questions

- **Q1** _(resolved)_ How many audio tracks? _Answer (accepted 2026-10-18):_ up to 8, on web and desktop alike. Mixing is cheap (the export mixes in 10-second windows); the cost is decoding, which grows with clips, not tracks. Reels rarely use more than 4. There is no technical reason to differ by platform (Constitution V), so one limit.
- **Q2** _(resolved)_ Solo on audio tracks? _Answer (accepted 2026-10-18):_ yes, for audio tracks only: soloed tracks are the only audio tracks heard **in the preview** (the export ignores Solo and says so), so the user can check one layer of the mix. The Video and overlay tracks’ sound isn’t soloed in 208.
- **Q3** _(resolved)_ Track roles: why, and which? _Answer (accepted 2026-10-18):_ three roles, Music, Voice and Effects, a simpler form of Premiere’s Essential Sound and Resolve’s Fairlight roles. The role decides what ducking listens to (Voice) and what it can lower (Music, and Effects when turned on). No role-specific processing (EQ, noise removal) in 208.
- **Q4** _(resolved)_ Which sound files? _Answer (accepted 2026-10-18):_ the same as the music today (what the browser decodes: MP3, AAC / M4A, WAV, OGG / Opus, FLAC in Chrome and the desktop app), with today’s size limit per file. Pulling the sound out of a video file as a sound clip (“Extract sound”) is Q15.
- **Q5** _(resolved)_ Which edit tools work on sound clips? _Answer (accepted 2026-10-18):_ select, move, trim, split, duplicate, delete, Snap (to clips, cuts, the playhead and other sound clips), Slip on its source, and Roll / Ripple / Slide within its own track. Magnetic stays the main video track’s only (audio tracks are free like overlay tracks, 203), and sound clips don’t move when the main track ripples, as the music today (Q16 asks about linking).
- **Q6** _(resolved)_ Sound past the end of the video? _Answer (accepted 2026-10-18):_ the video’s length stays set by its pictures and layers; sound clips may run past it on the timeline (drawn dimmed there) but are not heard and don’t lengthen the export. A video made only of sound isn’t possible in 208.
- **Q7** _(resolved)_ The migrated music, and new songs: fixed length or “to the end of the video”? _Answer (accepted 2026-10-18):_ a sound clip has a **Play to the end of the video** switch. Migrated music has it on, so old projects stay identical; a newly added song has it on when it is the first clip on the Music track and is longer than the video, off otherwise. Trimming its end turns it off. Such a clip plays to the end of the video or to the next sound on its track, whichever is first; moved to or past the end, it turns the switch off and keeps the length it had (maintainer, 2026-10-19, T072 option A). Add sound never puts a sound where it would cut such a clip short.
- **Q8** _(resolved)_ Track volume and pan? _Answer (accepted 2026-10-18):_ track volume yes (0–200 %, not keyframed); pan (left / right) not in 208: Reels and Shorts are mostly heard on phones, and pan doubles the mix cases. The loudness target (AC-8) acts as the master volume.
- **Q9** _(resolved)_ Ducking on by default? _Answer (accepted 2026-10-18):_ off for every track, with one **Lower music under voice** switch in the Audio panel that turns ducking on for every Music track at the defaults. On by default would change how old projects sound.
- **Q10** _(resolved)_ What counts as voice? _Answer (accepted 2026-10-18):_ sound on Voice tracks plus the own sound of video and overlay clips (most vlogs talk in the camera clip), with a per-track **Counts as voice** switch to leave a track out (say, a clip with loud music of its own). No speech-recognition model: “speaking” means “louder than the threshold”, so a loud non-speech sound on a voice track ducks too, and the threshold slider is how the user tunes it.
- **Q11** _(resolved)_ Ducking timing: fixed or adjustable? _Answer (accepted 2026-10-18):_ amount and threshold adjustable per track; the fade down (0.3 s, starting before the speech so the first word is clear), the fade up (0.8 s) and the 0.5 s bridging fixed in 208. Most editors expose them, but they are rarely changed and each slider needs explaining.
- **Q12** _(resolved)_ Loudness target by default? _Answer (accepted 2026-10-18):_ −14 LUFS (YouTube’s and Instagram’s reference) for new projects; Off for projects from before 208, so they export exactly as before. YouTube and Instagram turn louder videos down but don’t turn quiet ones up, so a video quieter than −14 just sounds quiet; hitting −14 is the usual advice.
- **Q13** _(resolved)_ Peaks: a limiter, or only lower the target? _Answer (accepted 2026-10-18):_ a true-peak limiter at −1 dBTP (look-ahead 5 ms, release 100 ms), hand-written (no new library, Constitution III), applied after the loudness gain. Without it, turning a quiet mix up to −14 LUFS would clip; lowering the target instead would miss it. The Audio panel warns when it reduces more than 6 dB (AC-9).
- **Q14** _(resolved)_ Should the preview play at the loudness target? _Answer (accepted 2026-10-18):_ yes, with the same gain and limiter, on web and desktop alike, so what the user hears is what they export (Constitution VIII); while a new measurement runs, the last gain is used and the panel says “measuring”.
- **Q15** _(resolved)_ “Extract sound” (a video clip’s sound onto an audio track as its own clip, to cut picture and sound apart for J and L cuts)? _Answer (accepted 2026-10-18):_ not in 208; it changes how clips and their sound are linked and fits better with 210 (compound clips). Video clip sound keeps its volume and keyframes on the clip.
- **Q16** _(resolved)_ Sound clips linked to a picture clip (moving with it when it ripples)? _Answer (accepted 2026-10-18):_ not in 208: sound clips keep their timeline time, as the music does today. Linking is a later feature, with Q15.
- **Q17** _(resolved)_ Sound for reversed and ramped clips, and same-pitch sound outside 0.5×–2× (left out of 207 “for the audio work”)? _Answer (accepted 2026-10-18):_ not in 208; it stays in “Still to do”. 208 is about mixing many sounds, not re-timing one; it can come with 209 or later.
- **Q18** _(resolved)_ Agent tools (MCP) for audio tracks, ducking and loudness? _Answer (accepted 2026-10-18):_ not in 208; they come with the other timeline tools in 212, like 206’s and 207’s.

## Changelog

- 2026-10-18 — Created: draft spec with 17 acceptance criteria and 18 open questions with proposed answers.
- 2026-10-18 — Q1–Q18: every proposed answer accepted by the maintainer; Approved.
- 2026-10-18 — Plan drafted (§1–§9, D1–D6 for the maintainer).
- 2026-10-18 — Plan approved (D1–D6 as recommended, D-052); AC-3 reworded: the migrated music keeps its min(1.5 s, a third) fade-out.
- 2026-10-18 — Tasks written (T001–T112).
- 2026-10-19 — Q7 extended (T072, option A, chosen by the maintainer): a Play to the end clip stops at the next sound on its track; moved past the end it gets a fixed length; Add sound never cuts it short.
