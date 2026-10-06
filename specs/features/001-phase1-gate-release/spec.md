# 001 — Phase 1 gate and 2.10.0 release

**Status:** In Progress <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** Baseline · **Created:** 2026-10-06 · **Owner:** RVicky172

## Summary

Editor Phases 0 and 1 (the GPU render graph and the advanced photo editor) are built and verified on Windows
(`000`), but not released: the app is still 2.8.0. Phase 1's gate in
[editor-implementation.md](../../vision/editor-implementation.md#phase-1-advanced-photo-editor) is not yet met: masked
edits must keep a 30 fps preview at 1080p **in Chrome on a mid-range laptop** (so far measured only in the desktop app
on the development machine), and RAW files must open on **Windows and macOS** (the Intel Mac LibRaw has never been
built or run). This feature closes that gate, fixes the baseline gaps that should not ship (`000` G6–G8), and releases
Phases 0–1 to users as **2.10.0**: web app, Windows and macOS installers, and the update that installed apps receive.
It adds no new editor feature.

## User Stories

- **US-1:** As a photographer on an ordinary laptop, I want painting a mask or dragging a gradient to feel smooth in
  Chrome, so that the advanced editor is usable without a gaming PC or the desktop app.
- **US-2:** As a Mac user (Apple silicon or Intel), I want to open my camera's RAW files in the desktop app and export
  them as 16-bit TIFFs, as Windows users can.
- **US-3:** As a user of 2.8.0, I want the advanced photo editor delivered as an update (desktop) or a new deployment
  (web), with release notes that say what changed.
- **US-4:** As the maintainer, I want the release checked once by CI at the tag (D-006) and by hand on each platform,
  so that a broken installer or a red gate never reaches users.

## Acceptance Criteria

### Phase 1 gate: speed in Chrome

On the reference laptop (Q1), Chrome stable, the production web build, a 1080 × 1350 Instagram photo with two masks
(one brush, one linear gradient) and a look applied, GPU effects on:

- [ ] **AC-1:** Painting with the mask brush continuously for 10 s, a pointer move every 16 ms: the time between
      preview updates has a median ≤ 33.3 ms (30 fps) and a 95th percentile ≤ 50 ms.
      _(scripted measurement, `npm run measure:gate`, method per Q2, recorded with the GPU backend used)_
- [ ] **AC-2:** Dragging the gradient's handle continuously for 10 s: the same limits as AC-1.
      _(scripted measurement)_
- [ ] **AC-3:** The same two measurements in the desktop app on the same laptop, recorded for comparison (no limit
      beyond AC-1's). _(manual measurement)_

### Phase 1 gate: RAW on Windows and macOS

With the packaged release-candidate app (not `npm run desktop:dev`) and the RAW test set (Q4: a DNG, a CR3, a NEF and
an ARW at least):

- [ ] **AC-4:** Windows x64: every file in the set opens in the photo studio, shows the developed picture (not the
      embedded JPEG preview), and exports as a 16-bit TIFF. _(manual check)_
- [ ] **AC-5:** macOS Apple silicon: the same as AC-4. _(manual check)_
- [ ] **AC-6:** macOS Intel: the same as AC-4, on an Intel Mac or the x64 app under Rosetta (Q3), and the shipped
      `dcraw_emu` is an x86_64 binary. _(manual check)_

### Baseline gaps fixed before release

- [ ] **AC-7:** `npm audit` reports 0 high or critical advisories (`000` G6); any moderate ones left are listed with a
      reason in the Result note. _(command output)_
- [ ] **AC-8:** `npm run test:mcp` leaves no files in the user's `Documents/Chitthi agent output` (`000` G7).
      _(MCP smoke test)_
- [ ] **AC-9:** Every caught error the app shows to the user (a toast or a message in a dialog; `000` G8 found 15)
      also records it in the error report (`logError('handled', …)`), and a test fails if one is added without it.
      _(unit test)_

### Release 2.10.0

- [ ] **AC-10:** The release checklist (`specs/release.md`) is followed: CHANGELOG's Unreleased becomes 2.10.0 with
      the date, version 2.10.0 in `package.json`, `APP_CACHE`, `docker-compose.yml`'s image tag and the plugin
      version; `editor-implementation.md` marks Phase 1 done and released. _(manual check)_
- [ ] **AC-11:** CI runs once for the release (D-006) and is green: lint, licences, build, unit, self-test, MCP, e2e
      and the Docker image. _(CI run linked in the Result note)_
- [ ] **AC-12:** The Desktop release workflow publishes one GitHub Release `v2.10.0` with the Windows x64 installer,
      the macOS x64 and arm64 builds, and the `latest*.yml` update manifests. _(release page)_
- [ ] **AC-13:** Each installer installs on a clean machine (or VM), and the installed app passes the smoke check:
      make a card and export a print pack, open a photo with a mask and export it, and
      `CHITTHI_MCP_APP=<app> npm run test:mcp` passes. Windows and macOS. _(manual check + MCP smoke test)_
- [ ] **AC-14:** An installed 2.8.0 on Windows finds and installs 2.10.0 (Help → Check for updates…). macOS
      per Q6. _(manual check)_
- [ ] **AC-15:** The web app is deployed at 2.10.0 where it is hosted (Q7). _(manual check)_

## Non-Functional Requirements

- Performance: AC-1/AC-2 are the gate. The existing budgets stay: entry chunk ≤ 350 KB; self-test parity limits.
- Compatibility: Windows 10/11 x64; macOS on Apple silicon and Intel; Chrome stable for the gate. Firefox and Safari
  are not gated (backlog, `000` G3).
- Security: no new IPC, host or permission. Signing per Q5.

## Out of Scope

- New editor features; Phase 2 (`201` onwards).
- Firefox / Safari test projects (`000` G3) and video-clip agent tools (`000` G1 → `212`).
- `src/assests/` (`000` G9, the maintainer's call).
- Performance work beyond what AC-1/AC-2 need (if the gate fails, see Q8).

## Open Questions

- **Q1** _(resolved)_ Which machine is the "mid-range laptop"? _Answer (accepted 2026-10-06):_ a laptop you have access to with
  a 4-core / 8-thread CPU from 2020 or later, integrated graphics (e.g. Intel Iris Xe or AMD Radeon Vega), 8–16 GB
  RAM, on battery-saver off and plugged in; its model, CPU, GPU, RAM and Chrome version are recorded with the result.
- **Q2** _(resolved)_ How are frame times measured? _Answer (accepted 2026-10-06, method changed the same day, see
  Changelog):_ `npm run measure:gate` drives Chrome with a pointer move every 16 ms and records when the page has
  handled each move (each one redraws the preview); median and 95th percentile of the time between those updates,
  3 runs each, the worst run counts. Display-frame intervals are recorded too, as a jank check. The performance
  monitor is a hand cross-check.
- **Q3** _(resolved)_ Which Macs can you test on? _Answer (accepted 2026-10-06):_ an Apple silicon Mac runs AC-5 and AC-6 (the
  x64 app under Rosetta 2 is a real test of the Intel `dcraw_emu`); a real Intel Mac only if one is at hand. If no
  Mac is available at all, the macOS ACs can't be met and the release would ship Windows-verified only, which needs
  your explicit OK.
- **Q4** _(resolved)_ Where do the RAW test files come from? _Answer (accepted 2026-10-06):_ raw.pixls.us samples (CC0) for a
  CR3, NEF and ARW, plus the synthetic DNG the MCP test already makes; kept outside the repo (not shipped, not
  committed), their URLs listed in the Result note.
- **Q5** _(resolved)_ Is 2.10.0 signed? _Answer (accepted 2026-10-06):_ ship as today (unsigned unless the signing secrets are
  set): the release notes say SmartScreen and Gatekeeper will warn.
- **Q6** _(resolved)_ macOS auto-update: unsigned macOS apps can't auto-update (Squirrel.Mac needs a
  signature). _Answer (accepted 2026-10-06):_ if unsigned, AC-14 is Windows only and the release notes tell Mac users to download 2.10.0
  by hand.
- **Q7** _(resolved)_ Is the web app hosted anywhere today (and where)? _Answer (accepted 2026-10-06):_ if yes, redeploy it at
  2.10.0 per `docs/OPERATIONS.md`; if no, AC-15 is dropped and the Docker image is checked by CI only.
- **Q8** _(resolved)_ If AC-1/AC-2 fail on the reference laptop, what happens? _Answer (accepted 2026-10-06):_ stop and report
  the numbers; small optimisations (a few hours) are done inside `001`; anything bigger becomes its own feature
  (`4xx`) and you decide whether 2.10.0 waits for it.
- **Q9** _(resolved)_ How does the code reach `main` and the tag? D-006 means no CI on the PR. _Answer (accepted 2026-10-06):_
  merge `feat/editor-phase-1-continued` into `main` (fast-forward or a PR without CI), tag `v2.10.0` on `main`, and
  change `ci.yml` to run on `v*` tags (D-006 follow-up) as part of this feature, so the tag's run is AC-11. The
  Desktop release workflow already runs on the same tag.
- **Q10** _(resolved)_ Are the `000` G6–G8 fixes part of this feature (AC-7–AC-9) or separate bug fixes
  before it? _Answer (accepted 2026-10-06):_ separate bug fixes (logged in `memory/progress.md`, no spec), done first; `001` only checks
  they are in (AC-7–AC-9).

## Changelog

- 2026-10-06 — Created.
- 2026-10-06 — Q1–Q10 resolved (all proposals accepted); Approved. Q1, Q3, Q7 are conditions checked when the task
  runs: the laptop's details are recorded with its measurement, the macOS ACs need an Apple silicon Mac (a
  Windows-only release needs the maintainer's explicit OK), AC-15 applies only if the web app is hosted.
- 2026-10-06 — Plan decisions D1–D3 accepted. AC-9 widened from the 6 export/gallery failures to every shown error
  (D1, Definition of Done item 9 as written).
- 2026-10-06 — Plan approved, tasks written; In Progress.
- 2026-10-06 — AC-1, AC-2, Q2: measured as the time between preview updates instead of display-frame intervals
  (found in T020: at 120 Hz most frames carry no new input, so the frame median stayed at 8 ms even with the CPU
  slowed 4× while the preview updated only ~25 times a second). Limits unchanged. Approved by the maintainer.
