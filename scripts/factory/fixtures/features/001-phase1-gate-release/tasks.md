# 001 — Phase 1 gate and 2.10.0 release · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. 👤 = needs the maintainer's hardware or a decision at
run time (the laptop, the Mac, a clean machine, a push to `main` or a tag). Each task lists files and the proving
test. Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

> **Deferred (2026-10-06):** T022, T023, T030, T033 and T040–T047 (and T091's CI half, T092) wait for the
> maintainer's hardware checks; they are on the roadmap backlog. Everything else is done.

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

- [x] **T010** — `ci.yml`: `on: workflow_call` only; `desktop-release.yml`: a first job `ci` that calls it, `build`
      `needs: ci`; header comments say when each runs. · files: `.github/workflows/ci.yml`,
      `.github/workflows/desktop-release.yml` · test: both parse as YAML and a local check confirms `build.needs`
      is `ci` and `ci.yml` has no `push`/`pull_request`; the real proof is the dry run, T042 (AC-11)
  - **Result (2026-10-06):** `ci.yml`: `on: workflow_call` only; its `concurrency` block (cancel in progress per ref)
    removed, since a release's CI must never be cancelled and the caller decides when it runs; jobs `check` and
    `docker` unchanged. `desktop-release.yml`: new first job `ci: uses: ./.github/workflows/ci.yml`, `build: needs:
    ci` (so `release` → `build` → `ci`); headers say CI runs only here, on a tag or the manual dry run. Scratch check
    (`wf.cjs`, js-yaml from `node_modules`): 7 structural checks, **3 failed on the old files, 7/7 pass now**; CodeQL
    untouched. Not provable locally: GitHub's own validation of the reusable call → T042.
- [x] **T011** [P] — Docs: CI runs once for a release (and its dry run), CodeQL stays on PRs:
      `specs/testing-strategy.md`, `specs/release.md` ("CI is green for the tag", dry run step), `specs/build.md`,
      `docs/OPERATIONS.md`, `CONTRIBUTING.md` (also Node 22 → 26), `specs/architecture.md` §7 if it names CI.
      · files: those · test: grep finds no "CI … every pull request" left; link check 0 broken
  - **Result (2026-10-06):** rewritten: `testing-strategy.md` intro (local gates; CI once per release),
    `release.md` (gates pass locally on `main`; new **dry run** step; "Tag and publish" says CI runs first and a red
    CI stops it, with how to delete a failed tag), `build.md` (diagram gets a `ci` node; step 4), `OPERATIONS.md`
    (Docker image checked per release, so check a base-image update yourself: `docker compose build/up`, `/healthz`),
    `CONTRIBUTING.md` (Node 22 → 26; run the full checks and say so in the PR; CodeQL still scans PRs),
    `ACCESSIBILITY.md` (axe runs in `test:e2e` and at each release, not "every pull request"), `DESKTOP.md` (cross-
    platform builds via the dry run), CHANGELOG Unreleased → Changed line, D-006 follow-ups marked done. Fixed in
    passing in `release.md`: the plugin version bump was missing (CLAUDE.md lists it) and the exe is
    `Chitthi Studio.exe`, not `Chitthi.exe`. Left as they are: CHANGELOG history, `architecture.md` §7 (CodeQL),
    `licensing.md` ("runs in CI and before every release build": still true), README's "the checks CI runs". Grep:
    no claim of CI on pull requests left; links 37 files / 161 / 0 broken; `npm run check` exit 0.

## Chrome gate (plan §3)

- [x] **T020** — Measuring script: `playwright.measure.config.ts` (installed Chrome, headed, production build on
      `vite preview`), `e2e/gate.measure.ts` (photo from `public/samples/`, a look, a brush mask with exposure and a
      linear gradient mask; 10 s painting and 10 s handle drag with moves every 16 ms; rAF intervals → frames,
      median, p95, max, backend; 3 runs each; fails if the backend isn't WebGPU or WebGL2), `npm run measure:gate`.
      Run it on this machine. Break-test: the same run with Chrome's CPU throttled 4× (CDP
      `Emulation.setCPUThrottlingRate`) must report clearly higher numbers. `npm run test:e2e` must not pick it up.
      · files: `e2e/gate.measure.ts`, `playwright.measure.config.ts`, `package.json` · test: script output; test:e2e
      count unchanged (74)
  - **Result (2026-10-06):** `npm run measure:gate` (own config, `channel: 'chrome'`, headed, `vite build` +
    `vite preview` on port 4175, 1440 × 900). Photo `puri-temple.jpg` (3200 × 4800, 15 MP) in the 4:5 post, look
    Warm, Mask 1 linear gradient + clarity 30, Mask 2 brush + exposure 1; per run 10 s painting a figure-of-eight
    stroke and 10 s dragging the gradient's centre handle in a circle (undone after), 3 runs; asserts each run left
    one more stroke and the drag moved the gradient; prints Chrome, GPU (WebGPU adapter or WebGL2 renderer; fails on
    a software one), CPU, RAM, OS; writes `test-results/gate.json`; exits 1 over the limits. **Metric changed
    (spec AC-1/AC-2/Q2, approved):** the first version measured rAF intervals, and its 4× CPU-throttle break-test
    *passed* (median 8.4 ms at 120 Hz: frames without input dilute it, while only ~245 moves were handled in 10 s).
    Now the gate is the time between handled pointer moves (a window `pointermove` listener after the app's), moves
    paced every 16 ms; rAF frames are kept as a jank column. Second fix: pacing with `setTimeout(16)` gave a p95 of
    ~33 ms on this machine (Windows timers tick every 15.6 ms), so it waits on `performance.now()` with
    `setImmediate`. **This machine** (Core Ultra 9 285K, 24 threads, 127 GB, NVIDIA Blackwell, WebGPU, Chrome
    154.0.8037.98): worst run paint median 16.6 / p95 19.0 / max 31 ms, drag 16.6 / 18.7 / 27 ms, ~610 updates and
    ~1,197 frames per 10 s: PASS. **Break-test** `GATE_CPU_THROTTLE=4`: paint 41.0 / 51.3 ms, drag 41.5 / 55.0 ms,
    ~245 updates: **FAIL**, as it must. `npm run test:e2e` still lists 74 tests; ESLint clean; `npm run check`
    exit 0. Not a mid-range machine: the gate itself is T022.
- [x] **T021** [P] — `docs/PERFORMANCE.md`: "Measuring the photo editor's frame rate" (what `measure:gate` does,
      the limits, how to read it). · files: `docs/PERFORMANCE.md` · test: link check
  - **Result (2026-10-06):** section added before "Investigating a slowdown": the budget, both commands (incl. the
    throttled self-check), what the run does, a table of the columns with their limits, the software-renderer rule,
    `test-results/gate.json`, and why display-frame intervals can't be the measure. Links 0 broken.
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
- [x] **T031** [P] — RAW test set (Q4): a CR3, a NEF and an ARW from raw.pixls.us (CC0) plus the smoke test's
      synthetic DNG, in a folder outside the repo; record URLs, cameras and SHA-256. · files: none · test: Result note
  - **Result (2026-10-06):** downloaded to the session scratchpad (`raw-set/`, not in the repo, not shipped); the site
    releases every sample under CC0. Magic bytes checked (ARW, NEF: TIFF `II*\0`; CR3: ISO-BMFF `ftypcrx`).

    | File | Camera | URL | Size | SHA-256 |
    | --- | --- | --- | --- | --- |
    | `IMG_6310.CR3` | Canon EOS R10 | `https://raw.pixls.us/data/Canon/Canon%20EOS%20R10/IMG_6310.CR3` | 34.7 MB | `2dc0bbdf04c93ca6…acd097` |
    | `DSC_0750.NEF` | Nikon Z 6 | `https://raw.pixls.us/data/Nikon/Z%206/DSC_0750.NEF` | 47.5 MB | `b4cdb8ecf8a971ec…a7ab5e15f` |
    | `_DSC0009.ARW` | Sony ILCE-7M3 (A7 III) | `https://raw.pixls.us/data/Sony/ILCE-7M3/_DSC0009.ARW` | 25.6 MB | `250784580ea52744…5bb50d0f` |
    | `synthetic.dng` | `syntheticDng()` (`src/engine/tiff.ts`) | — | 49.6 KB | — |

    Full hashes: CR3 `2dc0bbdf04c93ca62c914604f644c735286037912d6fba609d0cb78d00acd097`, NEF
    `b4cdb8ecf8a971ec023dd242251c6cbfb19966914e37c2311dc9813a7ab5e15f`, ARW
    `250784580ea527442c09004417bb0eead484f2bf3ee8f9121a776ac65bb50d0f`. For the Mac (T033): download the same
    three URLs and compare the hashes.
- [x] **T032** — Windows x64 (AC-4): `npm run desktop:pack`; open each RAW file in `release/win-unpacked`: developed
      picture (not the embedded preview), then 16-bit TIFF export (`II*\0`, > 1080 × 1080 × 6 bytes).
      · test: manual check, results per file
  - **Result (2026-10-06):** `desktop:pack` rebuilt on the current code (after T004). Checked through the packaged
    app's own MCP tools (`Chitthi Studio.exe --mcp`: the same page code as the UI, in its hidden window) with a
    throwaway client (`raw-check.mjs`, kept in the scratchpad, not committed): `add_batch_photo` → `raw: true`
    (set only when LibRaw developed the file; the embedded-preview path never sets it), `render_photo_preview` saved
    and looked at, then TIFF export, header and BitsPerSample (tag 258) read, the file deleted.

    | File | Opened in | Developed size | Export | TIFF |
    | --- | --- | --- | --- | --- |
    | CR3 (Canon EOS R10) | 0.9 s | 3000 × 2000 | 1.4 s | `II*`, 16-bit, 8.7 MB |
    | NEF (Nikon Z 6) | 0.7 s | 3032 × 2020 | 1.3 s | `II*`, 16-bit, 8.7 MB |
    | ARW (Sony A7 III) | 0.5 s | 3012 × 2012 | 1.3 s | `II*`, 16-bit, 8.7 MB |
    | synthetic DNG | 0.0 s | 96 × 64 | 0.2 s | `II*`, 16-bit, 8.7 MB |

    Sizes are LibRaw's half-size development (`-h`) of 24 MP sensors. The previews (1080 × 1350 posts) show natural
    colour, right way up, no casts. TIFF = 1080 × 1350 × 3 × 2 bytes. The output folder was empty afterwards. A
    by-hand look in the open window is part of T044.
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

- [x] **T090** — `specs/architecture.md` / `specs/build.md`: the release pipeline now runs CI first (plan §2); any
      structure this feature established. · test: link check
  - **Result (2026-10-06):** `architecture.md`: §7 Supply chain says a release builds installers only after CI
    passes on the tag; §8 new **Verification** row (local suites, CI once per release, `measure:gate`); §9 new
    decision row "CI only at a release (D-006)" with its trade-off (no CI on PRs or `main`; CodeQL still scans; the
    Docker image first checked at the dry run). Fixed in passing: the §8 "Responsive UI" row lacked its closing pipe.
    `build.md` was done in T011 (diagram + step 4). Links 15, 0 broken.
- [ ] **T091** — Every Definition-of-Done gate green: locally (`check`, `build`, `test:e2e`, `test`, `test:mcp`,
      `check:licenses`) and in the tag's CI (T043); record the numbers.
  - **Local half (2026-10-06, at `a283e6a` + T090 docs):** `npm run check` exit 0 (19 files, 743 tests, 0 lint errors,
    5 known warnings, 6 s); `check:licenses` 168 OK; `build` entry 327 KB / 350; `npm audit` 0 high (8 moderate =
    the sprintf-js advisory, T001); `npm test` 6,115 checks, 0 failed (85 s); `test:mcp` passed, removed its 4 files;
    `test:e2e` × 3: 67 passed / 7 skipped each, no failure lines. The one unexplained e2e failure (T004, run 1 of 5)
    hasn't recurred in 8 runs since. **Still to do:** the tag's CI run (T043) and a final local run after T040.
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
