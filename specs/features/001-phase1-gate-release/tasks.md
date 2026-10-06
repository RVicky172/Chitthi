# 001 — Phase 1 gate and 2.10.0 release · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. 👤 = needs the maintainer's hardware or a decision at
run time (the laptop, the Mac, a clean machine, a push to `main` or a tag). Each task lists files and the proving
test. Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

## Bug fixes first (plan §1; Q10: logged in `memory/progress.md`, no spec of their own)

- [x] **T001** — G6: `npm audit fix` (no `--force`); then `npm audit`, `npm run check`, `npm run build`,
      `npm run test:e2e`, `npm test`, `npm run test:mcp`, `npm run desktop:pack` and a smoke run of
      `release/win-unpacked` (make a card, export a print pack). List each moderate advisory left with its reason.
      · files: `package-lock.json` · test: 0 high/critical in `npm audit`; every gate exits 0 (AC-7)
  - **Result (2026-10-06):** `npm audit fix` changed only `package-lock.json`, 13 entries, **all dev-only**:
    `source-map-js` 1.2.1 → 1.2.2 and `http-cache-semantics` 4.2.0 → 4.3.0 (the 2 highs), electron-builder and
    its parts 26.15.3 → 26.17.0 / 26.16.0 (within `^26.15.3`), `@peculiar/asn1-schema`, `node-abi`, `undici` (under
    node-gyp), and an `@noble/hashes` re-hoist. **After: 0 high/critical; 8 moderate = one advisory**,
    GHSA-hp3w-g68c-fv3c in `sprintf-js` (every version affected, no fix exists), reached via electron-builder →
    `@electron/get` → `global-agent` → `roarr`; build-time only (used when electron-builder downloads Electron
    through a proxy), never shipped. `npm audit fix --force` would *downgrade* electron-builder to 26.5.0, so not
    taken. Gates: check exit 0 (741 tests, 5 known warnings), build 326 KB, licences 168 OK, e2e 67 passed / 7
    skipped, self-test 6,115 / 0 failed (94 s), MCP passed; `desktop:pack` with electron-builder 26.17.0 OK (LibRaw
    in `resources/libraw`), and `CHITTHI_MCP_APP=release/win-unpacked/… npm run test:mcp` passed against the
    packaged app (design → PDF, DNG developed by LibRaw, 16-bit TIFF). The by-hand card + print pack in the
    packaged app is left to T044 (the self-test builds a print pack per product).
- [x] **T002** [P] — G7 test-first: list `Documents/Chitthi agent output` before and after `npm run test:mcp` and see
      the run add 3 files; then make `scripts/mcp-smoke.mjs` record every file path a tool returns and delete them in
      a `finally`. Check again after a normal run and after a forced failure (e.g. a wrong expected value, then
      restored). 👤 Ask before deleting the 64 files (85 MB) earlier runs left there. · files: `scripts/mcp-smoke.mjs`
      · test: folder unchanged by a passing and by a failing run (AC-8)
  - **Result (2026-10-06):** before the fix a run took the folder from 70 to 73 files. `scripts/mcp-smoke.mjs` now
    collects every path after "Files written:" in any tool reply (plus its temp DNG) and deletes them in the
    `finally`, printing "removed the N files this run wrote". After: a passing run 73 → 73 (4 removed: PDF, JPEG,
    16-bit TIFF, the DNG); a forced failure after the second export (a copy of the script with a `throw`, deleted
    after) 73 → 73 (2 removed), "1 failed". No app change: the tools still write to `Documents/Chitthi agent
    output`. With the maintainer's OK, the 73 old files there (106 MB, 2026-09-30 → today, all three of the test's
    file names) were deleted; the folder is empty. `npm run check` exit 0; ESLint clean on the script.
- [x] **T003** [P] — G8 tests first: `src/lib/errors.test.ts`, a guard that reads every `src/**/*.ts(x)` (not tests,
      not `src/dev/`), finds each `catch` block that shows a message (`toast(`, `setError(`, `setMsg(`, `setStatus(`)
      and fails listing those without `logError(`. See it fail with the 15 found in `000` T091. · files:
      `src/lib/errors.test.ts` · test: fails, naming 15 places
  - **Result (2026-10-06):** guard written with Vite's `import.meta.glob(…, { query: '?raw' })` (no Node API in app
    code), excluding `*.test.ts` and `src/dev/`; it checks it read > 100 files, then lists catch blocks matching
    `\b(toast|setError|setMsg|setStatus)\(` without `logError(`. **Failed as expected, naming 14, not 15:** `000`'s
    scan had no word boundary, so `setError\(` matched inside `throw new PresetError(` in `engine/presets.ts`, which
    throws for its caller rather than showing anything.
- [x] **T004** — G8: add `logError('handled', e)` to all 15 (D1): 6 in `src/state/actions.ts`, plus `FontPicker`,
      `PerfMonitor`, `PexelsSearch` (2), `SettingsDialog`, `ai/AiSettings` (2), `engine/presets.ts` (check: it throws
      rather than shows; if so, refine the guard instead) and any other the guard names. Break-test: remove one call,
      see the guard name it, restore. · files: those components, `src/state/actions.ts` · test: T003 passes;
      `npm run check`, `npm run test:e2e` (AC-9)
  - **Result (2026-10-06):** `logError('handled', e)` added as the first line of all 14 blocks: `state/actions.ts`
    ×7 (print file, quote, envelope, PNG, print pack, gallery save, restore backup), `FontPicker`, `PerfMonitor`
    (clipboard), `PexelsSearch` ×2, `SettingsDialog`, `ai/AiSettings` ×2; `catch {` → `catch (e) {` where needed;
    import added in 5 components. One judgement: in `PexelsSearch` the search's `PexelsKeyError` branch (no key or
    a refused key, which the panel explains) is left unlogged and only the real failure branch logs, with a comment.
    `presets.ts` unchanged (false positive, T003). Those 6 files weren't Prettier-clean before either; not
    reformatted. Guard 2/2; break-test: removing the call in `PerfMonitor` made it name `PerfMonitor.tsx:67`,
    restored. `npm run check` exit 0 (19 files, 743 tests), build 327 KB (+1 KB). `test:e2e` × 5: runs 2–5 all 67
    passed / 7 skipped; **run 1 had 66 passed, so one test failed once, and its name wasn't captured** (only the
    last two lines were printed). It didn't recur in 4 runs; recorded as a possible flake to watch at T091.

## CI at the release (plan §2, D-006)

- [ ] **T010** — `ci.yml`: `on: workflow_call` only; `desktop-release.yml`: a first job `ci` that calls it, `build`
      `needs: ci`; header comments say when each runs. · files: `.github/workflows/ci.yml`,
      `.github/workflows/desktop-release.yml` · test: both parse as YAML and a local check confirms `build.needs`
      is `ci` and `ci.yml` has no `push`/`pull_request`; the real proof is the dry run, T042 (AC-11)
- [ ] **T011** [P] — Docs: CI runs once for a release (and its dry run), CodeQL stays on PRs:
      `specs/testing-strategy.md`, `specs/release.md` ("CI is green for the tag", dry run step), `specs/build.md`,
      `docs/OPERATIONS.md`, `CONTRIBUTING.md` (also Node 22 → 26), `specs/architecture.md` §7 if it names CI.
      · files: those · test: grep finds no "CI … every pull request" left; link check 0 broken

## Chrome gate (plan §3)

- [ ] **T020** — Measuring script: `playwright.measure.config.ts` (installed Chrome, headed, production build on
      `vite preview`), `e2e/gate.measure.ts` (photo from `public/samples/`, a look, a brush mask with exposure and a
      linear gradient mask; 10 s painting and 10 s handle drag with moves every 16 ms; rAF intervals → frames,
      median, p95, max, backend; 3 runs each; fails if the backend isn't WebGPU or WebGL2), `npm run measure:gate`.
      Run it on this machine. Break-test: the same run with Chrome's CPU throttled 4× (CDP
      `Emulation.setCPUThrottlingRate`) must report clearly higher numbers. `npm run test:e2e` must not pick it up.
      · files: `e2e/gate.measure.ts`, `playwright.measure.config.ts`, `package.json` · test: script output; test:e2e
      count unchanged (74)
- [ ] **T021** [P] — `docs/PERFORMANCE.md`: "Measuring the photo editor's frame rate" (what `measure:gate` does,
      the limits, how to read it). · files: `docs/PERFORMANCE.md` · test: link check
- [ ] **T022** 👤 — The gate on the reference laptop (Q1, Q2): record model, CPU, GPU, RAM, OS, Chrome version,
      plugged in; `npm ci`, `npx playwright install chromium` not needed (installed Chrome); `npm run measure:gate`,
      3 runs each; worst run against median ≤ 33.3 ms, p95 ≤ 50 ms. One run with the performance monitor open as a
      cross-check. If it fails: stop and report (Q8). · files: none · test: numbers in the Result (AC-1, AC-2)
- [ ] **T023** 👤 [P] — Desktop numbers on the same laptop: `npm test`'s two-mask timing line, and the performance
      monitor in `release/win-unpacked` while painting and dragging. · test: numbers in the Result (AC-3)

## macOS and RAW (plan §4)

- [ ] **T030** 👤 — Spike on the Apple silicon Mac: `npm ci && npm run fetch:libraw`; the Intel `dcraw_emu` builds,
      `lipo -archs` says `x86_64`, and both `darwin-arm64/` and `darwin-x64/` hold the program, licences and
      `SOURCE.txt`. If the build fails, fix the configure flags in `scripts/fetch-libraw.mjs` (same source). ·
      files: `scripts/fetch-libraw.mjs` only if needed · test: `lipo -archs`, `file` output
- [ ] **T031** [P] — RAW test set (Q4): a CR3, a NEF and an ARW from raw.pixls.us (CC0) plus the smoke test's
      synthetic DNG, in a folder outside the repo; record URLs, cameras and SHA-256. · files: none · test: Result note
- [ ] **T032** — Windows x64 (AC-4): `npm run desktop:pack`; open each RAW file in `release/win-unpacked`: developed
      picture (not the embedded preview), then 16-bit TIFF export (`II*\0`, > 1080 × 1080 × 6 bytes).
      · test: manual check, results per file
- [ ] **T033** 👤 — macOS (AC-5, AC-6): `npm run build`, `npx electron-builder --mac --arm64 --dir` and
      `--x64 --dir`; the RAW set in both apps (x64 under Rosetta 2), developed and exported as 16-bit TIFF;
      `file …/Resources/libraw/…/dcraw_emu` in the x64 app says x86_64. · test: manual check, results per file and arch

## Release 2.10.0 (plan §5)

- [ ] **T040** — Release changes (AC-10): CHANGELOG Unreleased → `## [2.10.0] — <date>`; `npm version 2.10.0
      --no-git-tag-version`; `APP_CACHE` v15 → v16; `docker-compose.yml` `chitthi-studio:2.10.0`; plugin version;
      README's version sentence; `editor-implementation.md` Phase 1 Done (gate numbers from T022, T033), status line.
      · files: those · test: `npm run check`, `npm run build`; grep finds no stale `2.8.0` outside history
- [ ] **T041** 👤 — Merge `feat/editor-phase-1-continued` into `main` (fast-forward if possible) and push `main`,
      with the maintainer's OK at the time. · test: `git log main` shows the release commit
- [ ] **T042** 👤 — Dry run (D2): Desktop release workflow by hand on `main`: `ci` green (lint, licences, build, unit,
      self-test, MCP, e2e, Docker), then installers as artifacts and no release. · test: run link and result (AC-11)
- [ ] **T043** 👤 — Tag `v2.10.0` on `main` and push it: the release run's `ci` job green, GitHub Release `v2.10.0`
      with the `.exe`, two `.dmg`, two `.zip`, `latest.yml`, `latest-mac.yml`. · test: run link, asset list
      (AC-11, AC-12)
- [ ] **T044** 👤 — Windows clean machine or VM: install, make a card and export a print pack, open a photo with a
      mask and export it, `CHITTHI_MCP_APP=<exe> npm run test:mcp`. · test: manual + MCP smoke (AC-13)
- [ ] **T045** 👤 [P] — macOS (arm64; x64 under Rosetta): the same as T044 from the published `.dmg`s, after
      `xattr -cr` as the release notes say. · test: manual + MCP smoke (AC-13)
- [ ] **T046** 👤 — Windows: an installed 2.8.0 finds and installs 2.10.0 (Help → Check for updates…); macOS by hand
      (Q6). · test: manual check (AC-14)
- [ ] **T047** 👤 [P] — Web: if the app is hosted (Q7), redeploy at 2.10.0 (`docs/OPERATIONS.md` → Upgrade) and
      check the footer/version; else note "not hosted" and drop AC-15. · test: manual check (AC-15)

## Verify

- [ ] **T090** — `specs/architecture.md` / `specs/build.md`: the release pipeline now runs CI first (plan §2); any
      structure this feature established. · test: link check
- [ ] **T091** — Every Definition-of-Done gate green: locally (`check`, `build`, `test:e2e`, `test`, `test:mcp`,
      `check:licenses`) and in the tag's CI (T043); record the numbers.
- [ ] **T092** — Tick ACs in `spec.md` (Status `Implemented`), roadmap 001 → ✔️, `memory/progress.md`,
      `memory/MEMORY.md` (next: Phase 2 from `201`), `000`'s Known gaps G5–G8 marked handled.

## AC coverage

| AC    | Tasks             |
| ----- | ----------------- |
| AC-1  | T020, T022        |
| AC-2  | T020, T022        |
| AC-3  | T023              |
| AC-4  | T031, T032        |
| AC-5  | T030, T031, T033  |
| AC-6  | T030, T031, T033  |
| AC-7  | T001              |
| AC-8  | T002              |
| AC-9  | T003, T004        |
| AC-10 | T040              |
| AC-11 | T010, T042, T043  |
| AC-12 | T043              |
| AC-13 | T044, T045        |
| AC-14 | T046              |
| AC-15 | T047              |
