<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 202 — Edit operations: ripple, roll, slip, slide, magnetic main track, snapping (P2.2) · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

## Setup

- [x] **T001** — Spike (plan, Risks): with the timeline focused, Alt + ← / → and Shift + Alt + ← / → with `preventDefault` on keydown don't navigate back / forward in Chrome (web) or open the menu in the Windows desktop app; record what happens without `preventDefault` too. Throwaway: a scratch e2e test and a manual check in `npm run desktop:dev`. · files: `scratch only` · test: the result recorded here; if a key can't be kept, propose other keys before T033
  - **Status (2026-10-07): automated part done, manual check needed (not ticked).** Findings: (1) the desktop app's
    menu (`electron/main.cjs`) has no Alt + arrow accelerator, and Electron has no Back shortcut, so Alt + ← / → only
    reach the page there. (2) Playwright's `keyboard.press('Alt+ArrowLeft')` in headed installed Chrome reaches the
    page's `keydown` but never Chrome's own shortcuts (no Back even without `preventDefault`), so e2e can't prove the
    browser side. (3) Real OS key presses (`keybd_event` from PowerShell into the Playwright Chrome window) were
    unreliable: once they arrived (as AltGr, a wrong flag), then not at all (Playwright fakes page focus, the window
    wasn't really in front). Expected from Chromium's design: Back (Alt + ←) isn't a reserved shortcut, so the page
    sees it first and `preventDefault` stops it; to confirm by hand. (4) Risk found for Q4: on Windows, Alt pressed and
    released on its own focuses the desktop app's menu bar; whether an Alt held through a mouse drag does this is
    the manual check below.
    **Manual checks (maintainer, ~2 min):** (a) web, Chrome, `npm run dev`, video editor with two clips, timeline
    focused: Alt + ← navigates back today (no handler yet: confirms the shortcut exists; the `preventDefault` side is
    checked again by hand at T033). (b) desktop, `npm run desktop:dev`: hold Alt, drag a clip a little, release Alt:
    does the File menu get highlighted (keyboard focus in the menu bar)?
  - **Result (2026-10-09):** the maintainer checked by hand after T033: in Chrome (web) Alt + ← / → with the timeline focused nudge the clip and don't navigate back, and in the desktop app holding Alt through a drag works without the menu bar taking focus. The planned keys stay (Q4, Q5).

## Tests first: the model

- [x] **T010** — Failing tests for gaps (§1) in `src/engine/timeline.test.ts`: `gaps()`; `videoAt` null inside a gap and before a first clip that starts later, the last clip at or past the end, the first before 0 when it starts at 0; `framePlan` covers 0 → total with `{ clip: null }` spans (a 1.5 s gap at 30 fps = 45 frames, AC-4); the 201 equivalence tests unchanged. · files: `src/engine/timeline.test.ts` · test: fails (no `gaps`, gap shows a clip)
- [x] **T011** — Implement §1 in `src/engine/timeline.ts` until T010 passes and the 201 tests stay green. · files: `src/engine/timeline.ts` · test: T010
  - **Result T010 + T011 (2026-10-07):** 3 tests written first (failed: `gaps` missing, a gap showed a clip). In
    `timeline.ts`: `gaps(p, track)` (before and between clips, 1e-9 tolerance for summed starts); `videoAt` returns
    null inside a gap, and clamps like 2.x only before 0 when the first clip starts at 0 and at or past the end;
    `framePlan` adds a `{ clip: null }` span (start = the previous clip's end) where a clip's first frame is after
    the previous clip's last, so frames run 0 → total (no tail span after the last clip, as 2.x). A 1.5 s gap at 30
    fps = frames 60–105 (45). All 201 equivalence tests unchanged and green: `npm run check` 886; `npm test` 6,124
    / 0 failed (200 frames still pixel-identical; timing 11.0 ms / 2.74 s). Break-test: no gap spans → the frames
    test failed, restored.
- [x] **T012** — Failing tests (`src/engine/edits.test.ts`, new) for `checkTrack`, `rippleDelete`, `lift`, `closeGap`, `closeGaps`, `trim` (both sides, ripple or not: limits 0.3 s, source, 60 s photos, project length, next clip), `moveTo` (fits, nearest free spot before / after, refused), `reorder`; locked tracks refused with the reason; AC-1: with Magnetic on (results packed) every operation equals today's store result on the 12 fixtures. · files: `src/engine/edits.test.ts` · test: fails (module missing)
- [x] **T013** — Implement those in `src/engine/edits.ts` (`MIN_LEN`, `PHOTO_MAX`, `EditCtx`, `Edit<C>`). · files: `src/engine/edits.ts` · test: T012
  - **Result T012 + T013 (2026-10-07):** 31 tests written first (failed: module missing), then `edits.ts`; all pass.
    AC-1 compares, on the 11 non-empty fixtures (the first 60 clips of `clips500`), every clip's ripple delete, lift
    and ripple trim (both edges, 7 deltas from −100 to +100 s), packed, with a copy of today's store + edge-drag code.
    Interface details beyond the plan: clips carry `srcDur` (`EditClip = TimedClip & { srcDur }`, photos 0) for the
    source bounds; `checkTrack(clips, max, before?)` checks the 0.3 s floor against the clips before the edit (2.x
    clips already shorter may stay); `closeGap` takes an optional track (default the main one). Edits return the same
    array when nothing changes (the store can skip the undo step). One intended difference from 2.x: a clip already
    under 0.3 s (2.x data only) can't be shortened; 2.x's edge drag jumped it up to 0.3 s even when shortening (AC-1
    skips those clips' trims). A lengthening past the project limit is refused with `TOO_LONG` (2.x refused silently).
    `npm run check` 917 tests. Break-tests: no 0.3 s floor → 11 failed; ripple delete without the pull-back → 2
    failed; restored.
- [x] **T014** — Failing tests for `roll` (length unchanged, limits, non-adjacent refused), `slip` (bounds, photo refused), `slide` (neighbours, bounds, next to a gap, first / last clip) and `nudge` (each tool, one frame at 30 and 60 fps, one second, Select with Magnetic on = one place). · files: `src/engine/edits.test.ts` · test: fails
- [x] **T015** — Implement `roll`, `slip`, `slide`, `nudge`. · files: `src/engine/edits.ts` · test: T014
  - **Result T014 + T015 (2026-10-07):** 14 tests written first (all failed: functions missing), then the four
    operations; 45 tests in `edits.test.ts`, `npm run check` 931. Shared edge limits (`endRange` / `startRange`: 0.3 s,
    source, 60 s photos) serve roll and slide. Rules beyond the plan (D-010): the last clip on a track can't slide
    (no clip after it: refused with a message; sliding it would change the video's length, AC-8); the first clip may
    slide right away from 0 (opens a gap) only with Magnetic off; `slide` takes `magnetic` and then opens no gap,
    though it may close one (so the store's pack after it never changes the length). `nudge` with Select + Magnetic
    off uses `moveTo` (a nudge into a neighbour finds no other spot and changes nothing). Break-tests: slip without
    source bounds → 1 failed; roll leaving the right clip's start → 2 failed; restored.
- [x] **T016** [P] — Failing tests then implementation of `snapTargets` / `snapTime` (edges of clips, gaps and layers, playhead, 0, end; 8 px at a zoom; skip list for the dragged clip; nothing in range → unchanged), moved out of `Timeline.tsx`. · files: `src/engine/edits.ts`, `edits.test.ts` · test: fails first, then passes
  - **Result (2026-10-07):** 3 tests first (failed: functions missing), then `snapTargets(clips, layers, playhead,
    total, skip)` and `snapTime(t, targets, tolerance)` in `edits.ts`. The skip is by id (`{ clip, layer }`) rather
    than the plan's list of times, so another edge at the same time still snaps. `Timeline.tsx` now calls them (and
    imports `MIN_LEN` from `edits.ts`): no behaviour change, video e2e 11 passed / 7 skipped (phone) / 0 failed.
    `npm run check` 934. Break-test: no playhead target → 1 failed; restored.
- [x] **T017** — AC-11 and AC-12: property tests (1,000 seeded random edits per operation on the fixtures, each result passing `checkTrack` and `mergeProject(toDocument(…))` unchanged) and timing (every operation on 500 clips, median of 100 < 2 ms; record the numbers). Break-test: let `trim` skip the 0.3 s floor, see the property test fail, restore. · files: `src/engine/edits.test.ts` · test: passes; break-test recorded
  - **Result (2026-10-07):** property tests: per operation (10), 1,000 seeded steps (`mulberry32`) through every
    fixture in turn, a quarter of them a lift or move first so there are gaps, with a random length limit near the
    current length; every result passes `checkTrack` against the clips before it, and every 10th, packed, goes through
    `toDocument` → JSON → `mergeProject` unchanged with nothing dropped. (The unpacked check needs `magnetic` in the
    document: T018.) They found a real bug: roll / slide / nudge could leave a video's `in` at −2.8e-17 (the range
    bound `length − out` isn't exactly `−in` in floating point); video edges are now clamped to the source where they
    move. AC-12 on 500 clips, median of 100: 0.001–0.017 ms per operation (bar 2 ms). `npm run check` 954.
    Break-test: no 0.3 s floor in `trim` → the trim property test failed; restored.
- [x] **T018** — The document (§3, D3): failing tests then implementation of `magnetic` in `toDocument` / `mergeProject` (missing = on → packed; off → sorted, gaps kept, overlaps moved after the clip they overlap with a reason; ≥ 6 malformed cases). · files: `src/engine/timeline.ts`, `timeline.test.ts` · test: fails first, then passes
  - **Result (2026-10-07):** 5 tests and 6 malformed documents (now 36) first (the 5 failed), then in `timeline.ts`:
    `magnetic` in `ProjectDoc` (optional; `toDocument` always writes it; only `false` means off), and `mergeProject`
    packs when on, else `unpacked()`: the main track sorted by start (equal starts keep the document's order), a clip
    overlapping the one before moved to its end with a reason (D3). The AC-11 property test now also sends every 10th
    result through the gate with Magnetic off (gaps kept): unchanged. It found a second rounding bug: a ripple left a
    start at −1.1e-16, which the gate reads as 0; shifted starts are now clamped at 0 and `checkTrack` rejects any
    negative start. `npm run check` 965. Break-test: no overlap move → 1 failed; restored.

## Core: the store

- [x] **T020** — Store (§3): `magnetic` (in undo snapshots, D1), `tool`, `snapping` (PURE, D4); `change()` packs only when magnetic; `setMagnetic(true)` closes gaps as one undo step, `false` not recorded; existing actions call §2 operations. With Magnetic on, nothing changes. · files: `src/state/video.ts` · test: `npm run check`; the video e2e tests pass unchanged (AC-1)
  - **Result (2026-10-07):** `src/state/video.test.ts` (new, 7 tests, failed first): the store in Node, with clips made
    by hand through a new `loadVideoProject()` (no history; packed when magnetic; also the future "open a project"
    entry). `VState.magnetic` (in undo snapshots, D1), `tool` and `snapping` (in `PURE`, D4), `setTool` /
    `setSnapping`; `change()` and the length clamp pack only when magnetic; `setMagnetic(true)` closes gaps as one
    step (undo brings back gaps + Magnetic off), `false` isn't recorded; `removeClip` / `moveClipTo` call
    `rippleDelete` / `reorder`. `npm run check` 978; editors e2e 17 passed / 9 skipped (phone) / 0 failed, unchanged.
    Break-test: always pack → 1 failed; restored.
- [x] **T021** — Store actions for Magnetic off and the new tools: lift / ripple delete, trims with `ripple`, duplicate (D2), `moveClipToTime`, roll / slip / slide, `nudgeClip`, `rippleTrimToPlayhead`, `deleteGap`; the music under the Slip keys (Q8, its offset); every refusal returns its reason. · files: `src/state/video.ts` · test: `npm run check`; video e2e unchanged
  - **Result (2026-10-07):** 12 store tests first (failed), then in `video.ts`: `removeClip` lifts with Magnetic off;
    new actions return null or the refusal's reason: `rippleDeleteClip` (Shift + Delete), `trimClip(id, side, delta,
    { ripple }, key)` (ripples with Magnetic on or Shift), `moveClipToTime`, `rollClip`, `slipClip`, `slideClip`,
    `nudgeClip` (the current tool, the project's fps), `rippleTrimToPlayhead` (Q / W), `deleteGap`, `slipMusic` (Q8,
    the offset within today's bounds); one `apply()` records an edit as one undo step and nothing when nothing
    changed. `duplicateClip` with Magnetic off follows D2; `splitAtPlayhead` now reads clip starts (it summed lengths
    from 0, wrong after a gap). `loadVideoProject` takes the music. Deltas are from the current state (a drag passes
    the step since its last call). `npm run check` 990 (19 store tests); editors e2e 17 / 9 skipped / 0 failed;
    `npm test` 6,124 / 0. Break-test: Delete always rippling → 1 failed; restored.

## UI

- [x] **T030** — Tests first: new `describe('video edit tools')` in `e2e/editors.e2e.ts`: Magnetic off → Delete leaves a gap (a "Gap" button), drag a clip to a time, Magnetic on closes the gaps (one undo); Shift + Delete and Shift-drag ripple; Roll, Slip, Slide by drag and by Alt + arrows (lengths and times read from the clips' titles and `.tl-time`); slip on a photo refused with its message; Q / W; snapping on, off and Alt; V / R / Y / U; the live region's text; locked track refuses each tool; axe; Pixel 7 at 360 px. · files: `e2e/editors.e2e.ts` · test: fails
  - **Result (2026-10-09):** 6 tests in a new `describe('video edit tools')` in `e2e/editors.e2e.ts` (5 desktop-only pointer / keyboard tests, plus an a11y + 360 px test on both projects). All 7 runs fail as intended (no Magnetic / Snap switches, `radiogroup` 'Edit tool', or `.tl-live`). The UI contract they fix for T031–T033: switches 'Magnetic' and 'Snap' (`aria-pressed`); radios Select / Roll / Slip / Slide with '(V)', '(R)', '(Y)', '(U)' in their titles; gap buttons in the video row named 'Gap, 3.0 s, from 0:03.0'; a polite `.tl-live` region ('Clip 2, 2.0 s to 4.0 s'); a video clip's title ends '· source 1.0–6.0 s'; a Slip drag or Alt + → plays a later part of the source (the engine's sign); in Roll / Slip / Slide a click on a clip selects it. Clip times are read from the drawn blocks (60 px a second). The video for Roll / Slip is a 6 s Reel exported by the app in the test (cached per worker), since the repo has no video sample. `npm run check` 1,081 passed.
- [x] **T031** — Transport: tool picker (`radiogroup`, icons, tooltips with keys), Magnetic and Snap switches (`aria-pressed`); keys V / R / Y / U; styles. · files: `src/components/studio/Timeline.tsx`, `src/components/icons.tsx`, `src/styles/36-media-studio.css` · test: T030's picker and switch parts
  - **Result (2026-10-09):** In the transport: a `radiogroup` 'Edit tool' of four native radios (visually hidden, icons from lucide-react: MousePointer2, SquareSplitHorizontal, ChevronsLeftRight, MoveHorizontal) with the key and what a drag does in each tooltip ('Roll (R): …'), and two `aria-pressed` switches, Magnetic (FoldHorizontal; `setMagnetic`) and Snap (Magnet; `setSnapping`, and `snap()` in the timeline now returns the time unchanged when Snap is off). V / R / Y / U set the tool with the timeline focused. Styles in `36-media-studio.css`. Gotcha: the hidden radios (`.vh`, absolute) escaped the scrolling transport and widened the page at 360 px (the 201 headers test caught it): `.tl-tool { position: relative }`. T030's picker and switch parts pass (the V / R / Y / U keys and tooltips, arrow keys in the group, Magnetic by keyboard); the rest waits on T032 / T033. Existing video e2e: 11 passed / 8 skipped (phone) / 0 failed. `npm run check` 1,081. Break-test: no tool keys → the V / R / Y / U test failed; restored.
- [x] **T032** — Gestures per tool (§4 table): body and edge drags call the store's operations; Shift ripples, Alt skips snapping, snapping through `snapTime`; drop marker for `moveTo`; cursors per tool. · files: `src/components/studio/Timeline.tsx`, `src/styles/36-media-studio.css` · test: T030's drag parts; the existing video e2e
  - **Result (2026-10-09):** `Timeline.tsx`: a clip's body and edges act by tool (plan §4). Select: Magnetic on reorders (unchanged), off the block follows the pointer with a drop marker at the snapped time and `moveClipToTime` runs on release; edges trim through `trimClip` (ripple with Magnetic on or Shift at the press; a ripple start trim keeps the start). Roll: either edge of a cut calls `rollClip` on the clip before it (the first clip's start is refused with a toast). Slip / Slide: the body (an edge passes the press on) calls `slipClip` (drag right = a later part, the engine's sign) / `slideClip`. Each drag edits from the store's current clip step by step with one undo key, and says a refusal once. `snap()` skips the dragged clip, is skipped with Snap off or Alt held, and otherwise rounds to the frame; a moved clip snaps by its start, else its end. Cursors per tool (`.tl-tool-*`), and a video clip's title ends '· source 1.0–6.0 s' (T030's contract). Checked with a throwaway copy of T030's tests without their T033 steps: Magnetic-off drag to a time, Shift / plain trims at both edges, Roll from both edges of a cut, Slip (body and edge), Slide, one undo per drag: all passed; T030's snapping test passes as is. Editors e2e: 18 passed / 14 skipped / 6 failed, all 6 at T033 steps (gaps, Shift + Delete, Alt + arrows, live region). `npm run check` 1,081. Break-test: Shift not rippling → the ripple test failed; restored.
- [x] **T033** — Gaps in the video row (focusable buttons, select, Delete closes), keys (Alt + arrows, Q / W, Shift + Delete, Delete lifts with Magnetic off), the polite live region for every change. · files: `src/components/studio/Timeline.tsx` · test: T030 passes; video e2e
  - **Result (2026-10-09):** `Timeline.tsx`: gaps on the video track drawn as focusable buttons ('Gap, 3.0 s, from 0:03.0', a striped dashed block; a click focuses instead of seeking), Delete on a focused gap closes it (`deleteGap`). Keys with the timeline focused: Alt + ← / → nudge the selected clip a frame with the tool (Shift + Alt: a second; `preventDefault` always, for the browser's Back), with Slip and no clip selected they slip the music (Q8); Q / W ripple-trim to the playhead; Shift + Delete ripple delete; Delete lifts with Magnetic off (the store, T021); every refusal goes to the toast. A polite `.tl-live` region announces each change of the video track 250 ms after it settles: the selected (else first) changed clip ('Clip 2, 2.0 s to 4.0 s', plus ', playing its source from 0.1 s' for a video), or 'Clip removed, 2 left'. `Toast.tsx`: each toast re-mounts its text, so the same message is shown and announced again (the locked-track test needs every refusal to show; a live region doesn't repeat identical text). Editors e2e: 24 passed / 14 skipped (phone, by design) / 0 failed, so T030 passes in full; `npm run check` 1,081. Break-test: no announcements → 3 failed; restored. The Alt keys are as planned: T001's manual checks are still open.

## Self-test

- [x] **T040** — Self-test (AC-4): an export with a 1.5 s gap between two photos and a layer decodes black with the layer inside the gap and the photos either side; the frame count of the gap from `framePlan` is 45 at 30 fps. Break-test: let `framePlan` skip gap frames, see it fail, restore. · files: `src/dev/videoChecks.ts` · test: `npm test`
  - **Result (2026-10-09):** `src/dev/videoChecks.ts` (`trackChecks`): two 1 s photos with a 1.5 s gap between them (Magnetic off) and a red layer, at 30 fps: `framePlan` gives 3 spans with 45 gap frames, the project is 3.5 s, and the export decoded at 0.5 / 1.75 / 3 s shows a photo, black corners with the red layer in the gap (211/4/4), then the other photo. `npm test` 6,125 / 0 failed (113 s; one check more than 201's 6,124). Break-test: `framePlan` without gap spans → 'a 1.5 s gap exports 45 black frames…' failed (0 gap frames, the gap showed a photo); restored. That run's timing (for T041, session 1): preview fastest 10.4 ms (bar 11.1), export fastest 2.64 s (bar 2.77).
- [x] **T041** — Timing (NFR): the self-test's timing check on the new code within 5% of 201's verification run (fastest of 3: preview 10.6 ms, export 2.64 s; bar ≤ 11.1 ms / 2.77 s), in at least two sessions. · test: `npm test` timing line
  - **Result (2026-10-09):** session 1 (the T040 run): preview fastest 10.4 ms, export fastest 2.64 s, within the bar (11.1 ms / 2.77 s). Session 2 (later the same day, after many test runs) was slower for every build: 12.0–13.8 ms and 2.74–3.05 s on this branch, over the bar against 201's numbers. Timed back to back with `main` (a worktree at `b4afd10`, same machine state) the branch is level: main 12.4 / 12.6 ms and 3.07 / 2.92 s, branch 12.7 / 12.8 ms and 2.89 / 2.88 s (preview within ~2%, export a little faster). The code timed is unchanged by this branch (`src/engine` and `src/state` equal `main`, which has 202's engine since T010–T021). So: no regression; the second session's absolute numbers reflect the machine, not 202.

## Verify

- [x] **T090** — Docs (AC-13): `docs/MEDIA-STUDIO.md` (tools, Magnetic, gaps, snapping, keys), `specs/lld.md` (`edits.ts`, gaps in §4.9, `magnetic` in the document), `CHANGELOG.md` Unreleased, `src/data/docs.ts`. · test: link check
  - **Note (2026-10-07):** `specs/lld.md` already describes what exists now (module map, §4.9: Magnetic, gaps,
    `edits.ts`, the store); at verification add the UI (tools, keys, gaps) there, and write `docs/MEDIA-STUDIO.md`,
    CHANGELOG and the in-app docs once the tools are in the UI (nothing user-visible yet).
  - **Result (2026-10-09):** `docs/MEDIA-STUDIO.md`: the timeline table (place clips, Shift ripple, the tools, Shift + Delete, nudge and Q / W), snapping (Snap switch, Alt, to the frame), a new section 'Edit tools, Magnetic and gaps' (a table per tool for drags, edges and Alt + arrows; Magnetic, gaps, undo, limits, announcements; layers and music keep their times, Q6), the track model paragraph (Magnetic, `edits.ts`), the code map and the tests. `specs/lld.md` §4.9: the timeline UI (gestures per tool, snapping, gaps, keys, `describeChange`); the engine and store parts were written with T013–T021. `CHANGELOG.md` Unreleased: Added (tools, Magnetic and gaps, Snap and Alt, keys) and Changed (repeated toasts). `src/data/docs.ts`: the in-app timeline section lists the tools, Magnetic, gaps and every key. No link-check script exists: `MEDIA-STUDIO.md`'s relative links all resolve, no new links added; docs e2e 4 passed; `npm run check` 1,081.
- [x] **T091** — Every Definition-of-Done gate green (`check`, `build`, `test:e2e`, `test`, `test:mcp`, `check:licenses`); entry chunk unchanged; record the numbers.
  - **Result (2026-10-09):** every gate green on `feat/202-edit-operations`: `npm run check` 1,082 tests (one added at verification: a gap is silent from the video track while the music plays through, AC-4), lint 0 errors / 5 known warnings; `npm run build` entry 327 KB of 350 (unchanged since 2026-10-08), AI in its 9 chunks; `npm run test:e2e` 83 passed / 15 skipped (phone runs of drag and encoding tests, by design) / 0 failed / 0 flaky; `npm test` 6,125 / 0 failed; `npm run test:mcp` passed (the first run failed at the RAW step: LibRaw wasn't fetched on this machine; after `npm run fetch:libraw` it passed: an environment step, no code change); `npm run check:licenses` 168 packages, 1 approved exception; no new dependency. DoD 7: no agent tool, by decision (Q7: the operations are pure for `212`).
- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), roadmap 202 → ✔️, `editor-implementation.md` P2.2 → Done, `memory/progress.md`, `memory/MEMORY.md` (next: `203`).
  - **Result (2026-10-09):** ACs 1–13 ticked against their tests (spec Status Implemented), roadmap 202 ✔️, `editor-implementation.md` P2.2 Done, `memory/progress.md` and `memory/MEMORY.md` updated (next: merge 202, then 203 / 204's questions).

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T012, T013, T020 |
| AC-2 | T012, T013, T021, T030, T032 |
| AC-3 | T012, T013, T020, T030, T033 |
| AC-4 | T010, T011, T040 |
| AC-5 | T012, T013, T021, T030, T032 |
| AC-6 | T014, T015, T030, T032 |
| AC-7 | T014, T015, T030, T032 |
| AC-8 | T014, T015, T030, T032 |
| AC-9 | T016, T030, T032 |
| AC-10 | T001, T030, T031, T033 |
| AC-11 | T012, T013, T014, T015, T017, T018, T021 |
| AC-12 | T017 |
| AC-13 | T090 |
