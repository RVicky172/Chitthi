# 001 — Phase 1 gate and 2.10.0 release · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-06, D1–D3 as recommended) <!-- Draft | Approved -->

## Approach

The work is mostly measurement and release engineering. The code changes are small: three bug fixes (Q10: done
first, before the 001 tasks, logged in `memory/progress.md`), one measuring script for the gate, and the CI
triggers (D-006). Order: §1 bug fixes → §2 CI → §3 Chrome gate → §4 macOS and RAW → §5 release.

**§1 Baseline gaps, as bug fixes first (AC-7–AC-9; Q10).**
- **G6, npm audit (AC-7).** Both high advisories have fixed versions within their ranges (`source-map-js` 1.2.2 via
  Vite → postcss; `http-cache-semantics` 4.3.0 via electron-builder → `@electron/get` → `got` → `cacheable-request`),
  so `npm audit fix` without `--force` updates only `package-lock.json`. The 8 moderate ones sit in electron-builder's
  own chain (`global-agent`, `roarr`, `sprintf-js`, …) and need `--force` (an electron-builder major change); they are
  build-time only, never shipped, and are listed with that reason in the Result note. Then the full gates, since the
  build tool chain changed: check, build, e2e, `desktop:pack`.
- **G7, MCP test output (AC-8).** The smoke test already gets back the path of every file it makes (`export_pdf`,
  the JPEG and the 16-bit TIFF from `export_photos`). It records them and deletes them in a `finally`, so a failing
  run cleans up too. No app change: the tools keep writing to `Documents/Chitthi agent output`, as users expect.
  The 64 files (85 MB) left by earlier runs are deleted once, by hand, after the fix.
- **G8, `logError` (AC-9).** In `src/state/actions.ts` add `logError('handled', e)` to the five export catches
  (`downloadPrintFile`, `downloadQuote`, `downloadEnvelope`, `downloadPNG`, `downloadPack`) and `saveDesign`. Proof:
  a Vitest guard `src/lib/errors.test.ts` that reads the source of `src/` and fails on any `catch` block that shows a
  message (`toast(`, `setError(`, `setMsg(`, `setStatus(`) without `logError(` — **decision D1** below on whether it
  covers all 15 such blocks (fixing the 9 others too) or only these 6.

**§2 CI only at the release (D-006; AC-11).** `ci.yml` becomes a reusable workflow (`on: workflow_call` only, no
push or pull-request trigger). `desktop-release.yml` gets a first job `ci: uses: ./.github/workflows/ci.yml`, and its
`build` job `needs: ci`, so on a `v*` tag CI runs once and a red CI stops the installers from being built or
published. Its `workflow_dispatch` (installers as artifacts, no release) keeps working and also runs CI first. The docs
that say CI runs on every pull request are corrected: `specs/testing-strategy.md`, `specs/release.md` ("CI is green
for the tag", now checked during the release instead of before it), `docs/OPERATIONS.md`, `CONTRIBUTING.md` (which also
still says "22 is what CI uses": it's 26), the header comments of both workflows. CodeQL's own workflow: **decision D3**.

**§3 Chrome gate (AC-1–AC-3; Q1, Q2, Q8).** Painting by hand for 10 s can't be repeated, so a measuring script drives
it: `e2e/gate.measure.ts`, run by its own `playwright.measure.config.ts` (`npm run measure:gate`), never part of
`npm run test:e2e`. It uses the installed Chrome (`channel: 'chrome'`, headed, so the real GPU is used) against the
production build (`vite build` + `vite preview`), opens the photo studio with a 4:5 photo from `public/samples/`,
applies a look, adds a brush mask with exposure and a linear gradient mask (the same UI steps as
`e2e/instagram.e2e.ts:282` and `:344`), then:
1. paints: `page.mouse` moves across the photo every 16 ms for 10 s with the button down;
2. drags the gradient's handle the same way for 10 s.
During each, the page records every `requestAnimationFrame` interval (`performance.now()` deltas); the script prints
median, 95th percentile, max, the frame count and the GPU backend in use (from the studio's GPU setting / device), 3
runs each, the worst run counts (Q2). The performance monitor is opened once by hand during a run to cross-check its
frames-per-second against the script. AC-3: the same script with `--desktop` against the packaged app is not possible
in Playwright for Electron's `app://` without extra work, so the desktop numbers come from the self-test timing line
(`npm test` on the laptop) plus a hand check with the monitor. The laptop's model, CPU, GPU, RAM, OS, Chrome version
and power state are recorded (Q1). If the gate fails, stop and report (Q8).

**§4 macOS and RAW (AC-4–AC-6; Q3, Q4).**
- **Spike first:** on the Apple silicon Mac, `npm ci && npm run fetch:libraw`: proves the Intel `dcraw_emu` compiles
  with today's Xcode command-line tools (it has only ever run in theory) and that `lipo -archs` says `x86_64`.
- Release-candidate builds on the Mac itself: `npx electron-builder --mac --arm64 --dir` and `--x64 --dir` after
  `npm run build` (unsigned, like the release). No tag or CI run needed (D-006).
- RAW test set (Q4): CR3, NEF and ARW from raw.pixls.us (CC0), plus the synthetic DNG; downloaded to a folder outside
  the repo, URLs and SHA-256 in the Result note. Each opens developed (not the embedded preview: the studio says
  which), and exports a 16-bit TIFF. On Windows with `desktop:pack`'s `release/win-unpacked`; on macOS arm64 natively;
  x64 under Rosetta 2 (`arch -x86_64` is implied by launching the x64 `.app`; `file …/dcraw_emu` confirms x86_64).

**§5 Release 2.10.0 (AC-10–AC-15; Q5–Q7, Q9).** Follow `specs/release.md`: CHANGELOG Unreleased → `## [2.10.0] —
<date>`; `npm version 2.10.0 --no-git-tag-version`; `APP_CACHE` `chitthi-app-v15` → `v16` in `public/sw.js`;
`docker-compose.yml` image `chitthi-studio:2.10.0`; `plugins/chitthi/.claude-plugin/plugin.json` version 2.10.0;
`editor-implementation.md` Progress: Phase 1 Done, released 2.10.0, status line updated; README's "Version 2.8.0, with
… Unreleased" sentence. Then (Q9) merge `feat/editor-phase-1-continued` into `main` (fast-forward if possible), tag
`v2.10.0` on `main`, push both: the tag runs `desktop-release.yml` → CI → installers → GitHub Release (unsigned, Q5;
the release body already warns). After publishing: install each build on a clean machine/VM and smoke-check it
(AC-13); install 2.8.0 on Windows and let it update (AC-14; macOS by hand, Q6); redeploy the web app if hosted
(AC-15, Q7).

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `package-lock.json` | modify | §1 G6: `npm audit fix` |
| `scripts/mcp-smoke.mjs` | modify | §1 G7: delete the files the test made, in `finally` |
| `src/state/actions.ts` (+ others per D1) | modify | §1 G8: `logError('handled', e)` |
| `src/lib/errors.test.ts` | new | §1 G8: guard against shown-but-unlogged errors |
| `.github/workflows/ci.yml` | modify | §2: `workflow_call` only |
| `.github/workflows/desktop-release.yml` | modify | §2: `ci` job first, `build` needs it |
| `specs/testing-strategy.md`, `specs/release.md`, `specs/build.md`, `docs/OPERATIONS.md`, `CONTRIBUTING.md` | modify | §2: CI runs at the release |
| `e2e/gate.measure.ts`, `playwright.measure.config.ts` | new | §3: the gate measurement |
| `package.json` | modify | §3 `measure:gate` script; §5 version |
| `docs/PERFORMANCE.md` | modify | §3: how to run the gate measurement |
| `CHANGELOG.md`, `public/sw.js`, `docker-compose.yml`, `plugins/chitthi/.claude-plugin/plugin.json`, `README.md` | modify | §5 version bump |
| `specs/vision/editor-implementation.md` | modify | §5 Phase 1 done and released, gate numbers |
| `specs/features/001-*/spec.md`, `specs/roadmap.md`, `memory/*` | modify | results, status |

## Data Structures & Interfaces

```ts
// e2e/gate.measure.ts — page side, injected with page.evaluate before each 10 s run
window.__gate = { t: [] as number[] };
const tick = (now: number) => { window.__gate.t.push(now); window.__gate.raf = requestAnimationFrame(tick); };
// node side: intervals = diff(t); report { frames, median, p95, max, backend }

// .github/workflows/ci.yml
on: { workflow_call: {} }
// .github/workflows/desktop-release.yml
jobs: { ci: { uses: ./.github/workflows/ci.yml }, build: { needs: ci, … }, release: { needs: build, … } }
```

## Techniques

- rAF intervals measure what the user sees: a frame that takes 40 ms of work shows as a 40 ms interval. Pointer
  moves come from Playwright's real input pipeline (CDP `Input.dispatchMouseEvent`), so the app's own pointer
  handling and its once-per-frame drawing are what's measured.
- Headed Chrome, not headless: headless may fall back to software GL and would measure the wrong thing; the script
  prints the backend and fails if it isn't WebGPU or WebGL2.
- The guard test (§1) parses with a brace counter, like the scan in `000` T091; it is a plain Node test (reads
  files), so it fits Vitest's no-DOM rule.
- A reusable workflow called from the release keeps CI's definition in one file and makes the dependency explicit
  (`needs: ci`), instead of two workflows racing on the same tag.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1, AC-2 | `npm run measure:gate` on the reference laptop, 3 runs each, worst run ≤ limits | manual measurement (scripted) |
| AC-3 | `npm test` timing line + monitor check in the packaged app on the laptop | manual measurement |
| AC-4 | RAW set in `release/win-unpacked` | manual check |
| AC-5, AC-6 | RAW set in the arm64 and x64 `.app` on the Mac; `file dcraw_emu` | manual check |
| AC-7 | `npm audit` output; full gates after the lockfile change | command output |
| AC-8 | `npm run test:mcp`, then the output folder listed before/after (also after a forced failure) | MCP smoke test |
| AC-9 | `src/lib/errors.test.ts` (seen failing before the fix) | unit |
| AC-10 | release checklist against the diff | manual check |
| AC-11 | the tag's Desktop release run: `ci` job green (all its steps incl. Docker) | CI |
| AC-12 | GitHub Release `v2.10.0` assets: `.exe`, 2 `.dmg`, 2 `.zip`, `latest.yml`, `latest-mac.yml` | manual check |
| AC-13 | clean install + smoke check + `CHITTHI_MCP_APP=… npm run test:mcp`, Windows and macOS | manual + MCP smoke |
| AC-14 | 2.8.0 installed on Windows → Help → Check for updates → 2.10.0 | manual check |
| AC-15 | deployed site shows 2.10.0 (if hosted) | manual check |

## Risks & Mitigations

- **The Intel LibRaw build fails on current Xcode** (never run for real). → Spike at the start of §4; if it fails,
  fix the configure flags in `fetch-libraw.mjs` (allowed: same LibRaw source, same licence terms).
- **The gate fails on the laptop.** → Stop and report (Q8); the script makes before/after comparisons cheap.
- **Synthetic input isn't like a hand.** → Moves every 16 ms are as dense as a 60 Hz mouse; a hand check with the
  performance monitor during one run confirms the order of magnitude.
- **`npm audit fix` changes the build output.** → Full gates plus `desktop:pack` and a smoke run after it.
- **CI first runs at the tag** (D-006), so a CI-only problem (Docker, Windows runner) appears at release time. →
  `workflow_dispatch` of the release workflow before tagging gives a dry run with no release (**decision D2**).
- **No Mac available** → the macOS ACs can't pass; release needs the maintainer's explicit OK for Windows-only (Q3).
- **A published release is broken.** → `specs/release.md` "When a release goes wrong" (draft the release, ship X.Y.Z+1).

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Spec approved; G6–G8 are bug fixes (allowed without a spec), logged |
| II. Test-gated delivery | ✅ | Guard test for G8 seen failing first; smoke test for G7; gates after the lockfile change |
| III. Small dependencies | ✅ | No new dependency: the measuring script uses the installed `@playwright/test` |
| IV. Memory maintained | ✅ | Gate numbers, release run, any decision (D1–D3) recorded |
| V. Free and open source | ✅ | Nothing gated |
| VI. On device, no backend | ✅ | No new network destination; RAW samples are downloaded by the maintainer, not the app |
| VII. Permissive licences | ✅ | RAW samples CC0, not shipped or committed; LibRaw unchanged (approved exception) |
| VIII. WYSIWYG, one code path | ✅ | No rendering change |
| IX. Secure desktop shell | ✅ | No IPC or fuse change; G7 changes the test, not `electron/mcp.cjs` |
| X. Budgets and accessibility | ✅ | The gate is a budget; entry chunk and axe checked by the tag's CI |
| XI. Agents use the same code | ✅ | No new user-facing feature |

## Decisions for the maintainer (accepted 2026-10-06: D1 (a), D2 yes, D3 keep)

- **D1** — G8 guard scope: (a) **all 15** catch blocks that show an error log it, guard test over all of `src/`
  (Definition of Done item 9 as written; recommended), or (b) only the 6 in `actions.ts`, guard limited to that file.
  (a) needs AC-9 to say "every" instead of "the 6".
- **D2** — A dry run before tagging: run the Desktop release workflow by hand (`workflow_dispatch`, which now runs CI
  first and builds installers as artifacts, no release) on `main` after the merge. It's a CI run off a tag, so D-006
  needs to allow it ("CI runs only for a release, including its dry run"). Recommended: yes.
- **D3** — CodeQL also runs on every pull request (`docs/OPERATIONS.md`, `architecture.md` §7). Keep it (security
  scanning, not the CI gates) or move it to the release too? Recommended: keep it, and say so in D-006.
