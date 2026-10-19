<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 290 — Phase 2 test pass and 3.0.0 release

**Status:** Draft
**Roadmap phase:** Phase 2 — Multi-track timeline (release 3.0.0) · **Created:** 2026-10-12

## Summary

The end of Phase 2 (D-033): during the phase, features are built with unit tests only (`npm run check`, plus `npm run build` when a feature is finished). Here, once 201–212 are built, the e2e, self-test, timing and manual checks deferred by each feature are written and run, every Definition-of-Done gate passes, the acceptance criteria those checks prove are ticked in their features, and 3.0.0 is released.

## Deferred checks collected from the phase

Each Phase 2 feature lists here the checks it defers (D-033), with their text as planned; the tasks are written when 290 is planned.

- **203 T035** — AC-12 timing (§13, `src/dev/playbackChecks.ts`, `CHITTHI_TEST_ONLY=pooltiming`): main + 2 overlay 1080p30 videos playing at once in a Reel and a YouTube project, 300 frames, median and p95 frame time (≤ 33 ms median on desktop); a project without overlays within 5 % of `main` (fastest of 3, run back to back). If the bar fails, lower the limit by Q2's rule and record it in the spec. · files: src/dev/playbackChecks.ts · test: `CHITTHI_TEST_ONLY=pooltiming npm test`: the numbers recorded here
- **203 T051** — Failing e2e (`e2e/tracks.e2e.ts`, new): add, rename, move up / down and delete (confirmation when it has clips) an overlay track, each one undo step; the limit disables Add track with the reason; the overlay header's Hide (not drawn), Mute (silent: the mute test's sound log), Lock (timeline and stage edits refused) and height; add files at the playhead and by dropping on a row and above the top row; drag a clip between rows and with "Move to track…"; an edit over the videos-at-once limit refused with its message; keyboard only; axe on the timeline; 360 px with no sideways scroll. · files: e2e/tracks.e2e.ts · test: `npx playwright test e2e/tracks.e2e.ts`: fails
- **203 T053** — Failing e2e (`e2e/overlays.e2e.ts`, new): a selected overlay clip's box on the stage: drag moves, a corner resizes keeping the aspect, the handle rotates; snapping to centre lines and edges within 8 px, off with the Snap switch and with Alt; the inspector's presets and number fields (X, Y, size, rotation, opacity, corner radius); arrows 1 % and Shift 10 % with the stage focused; a drag is one undo step; the announcement text; a locked track shows no box and disabled fields; axe on the inspector; reduced motion (no animated outline). · files: e2e/overlays.e2e.ts · test: `npx playwright test e2e/overlays.e2e.ts`: fails
- **203 T060** — Manual checks in Chrome (`npm run dev`) and the desktop app: B-roll over a talking clip and a corner face-cam play smoothly and export as previewed; the Chrome AC-12 figure (main + 1 overlay, `?selftest&only=pooltiming`); the AC-13 export in Chrome (web). · files: none · test: the maintainer's results recorded here
- **203 criteria still open** (tick them here once proven): AC-1, AC-2, AC-3, AC-14 (tracks e2e, was T051); AC-5 (overlays e2e, was T053); AC-8 (overlay sound heard in the preview: the mute test with an overlay track; the export side is proven by the self-test); AC-10 (the existing video e2e unchanged after the timeline rows, T052); AC-12 (was T035); AC-13 (the web half: the 2-minute export in Chrome, part of T060; the desktop half is proven by the self-test, 12.4 s, nothing open).
- **205 keyframes** — e2e: the inspector's keyframe buttons, auto-key from fields, the stage and arrow keys, previous / next (AC-6); the keyframe lane: select, drag with snapping, Delete, the interpolation menu, K, Alt + [ / ], arrows, announcements (AC-7); keyboard only, names, axe, 360 px, reduced motion (AC-13). Self-test: golden frames of AC-8's fixture at 9:16 and 16:9 on every backend, the paused preview and the export (AC-9); the exported sound follows volume keys within 0.5 dB with no clicks at window joins, the preview within a frame (AC-10); 201–203 fixtures pixel-identical with identical export inputs, existing video e2e unchanged (AC-11).
- **206 transitions** — e2e: the Transitions panel (previews, apply to the selected cut or the selected clip's end, Apply to every cut, the no-cut note) (AC-8); cut targets, transition blocks, select, Delete, edge drags, ← / →, the inspector, announcements (AC-9); keyboard only, names, axe, 360 px, reduced motion (AC-10). Self-test: the exported sound cross-fades with equal power (and dips) within 0.5 dB, the preview within a frame (AC-6); golden frames of every kind, direction and colour at five progresses, 9:16 and 16:9, every backend, on the main track and an overlay with a see-through, keyframed clip; the paused preview and the export (AC-12); 201–205 fixtures pixel-identical with identical export inputs, existing video e2e unchanged (AC-13). Timing: a two-video 1080p30 dissolve plays with no more dropped frames than 205's two-video overlay; ≤ 4 ms more per transition frame at 1080p; a 60 s Reel with 10 transitions exports within 10 % of hard cuts (AC-14).
- **207 speed** — Listening: speech and music at 0.5×, 0.75×, 1.5× and 2× in the export (our WSOLA) and the preview (the browser), no warble or clicks at 10-second window joins; if not good enough, ask the maintainer about pitch following the speed (AC-6). e2e: the Speed group (Constant / Ramp, field, log slider, presets, Reverse, new length, the muted-sound reason, Reset speed), the ramp editor (drag, double-click to add, Delete), the Freeze button and Shift + F, the badges (“2×”, “0.5×”, “◀ 1×”, “Ramp”, “Still”) (AC-11); keyboard only (ramp points: ← / → along, ↑ / ↓ speed, Shift), names and states, announcements (“Clip 2: 0.5×, now 8.4 s”), axe on the inspector and timeline, 360 px (AC-12). Self-test: golden frames of a frame-counter video at 0.5×, 2×, 10×, reversed, frozen and the Hero ramp, the export and the paused preview; 201–206 fixtures pixel-identical with identical export inputs (frames, clips, times, sound sources), existing video e2e unchanged (AC-13). Timing on the reference laptop: 1080p30 preview at 2× no more dropped frames than 1×, at 4× and reversed (after its first second) ≤ 10 % dropped, a freeze costs no decoding; a 60 s Reel of clips at 0.5×–4× exports within 25 % of the same at 1× (AC-14).
- **208 audio tracks** — e2e: the Audio panel (Add sound with several files, tracks with role, volume and ducking, Lower music under voice, Loudness with its readout and limiter warning), audio track headers (name, Mute, Solo, Lock, volume, role, ducking, Add audio track), sound rows (name, waveform, fade handles, volume line, duck curve, dimmed past the end), video clip waveforms, the sound clip inspector (AC-13); keyboard only (fade handles and volume line with arrows and Shift), names and states, announcements, axe on the panel, inspector and timeline, 360 px (AC-14). Listening: a 60 s vlog (music, a voice on a Voice track, two effects) exported with ducking and −14 LUFS: the music dips under every sentence without pumping, no clicks at cuts, fades or ducking edges, the preview sounds like the export; YouTube’s Stats for nerds shows content loudness within 1 dB of 0 dB (AC-15). Timing on the reference laptop: a 60 s Reel with 4 audio tracks, ducking and loudness exports ≤ 15 % slower than one song with loudness Off; preview drops no more frames than with one song; a 10-minute video's waveform within 10 s of import without dropping preview frames; 201–207 fixtures give identical export inputs, existing video e2e unchanged (AC-16).
- **Every Phase 2 feature** — the full Definition of Done: `npm run test:e2e`, `npm test`, `npm run test:mcp`, `npm run check:licenses`, the docs gates; the ACs proven by these checks ticked in each feature.
- **Release** — `specs/release.md`: version 3.0.0, CHANGELOG, tag.

## User Stories

_None yet._

## Acceptance Criteria

_None yet._

## Non-Functional Requirements

- Performance: …
- Accessibility / security / compatibility: …

## Out of Scope

- …

## Open Questions

_None yet._

## Changelog

- 2026-10-12 — Created.
