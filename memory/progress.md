# Progress Log

Newest first. One entry per working session.

```
## YYYY-MM-DD — <feature id or "chore">
**Done:** …
**Next:** …
**Blockers:** …
```

---

## 2026-10-07 — 201 verified ✔️ (T040–T041, T090–T092)

**Done:** T040 self-test (200 frames pixel-identical to the 2.x placement at 4 ratios; hidden / muted in the preview
and in decoded exports; break-test caught a one-frame shift in 4 checks). T041 timing within 5% in 5 sessions
(fastest 10.5–11.0 ms / 2.64–2.76 s). T090 docs (MEDIA-STUDIO "Tracks", lld §4.9, CHANGELOG, in-app docs). AC-4
reworded (no Alt+arrow / Ctrl+D in the editor; maintainer's call). Gates: check 883, build 327 KB, licences 168, e2e
74 passed / 10 skipped (phone runs of desktop-only tests) / 0 failed / 0 flaky, self-test 6,124 / 0, MCP passed.
Spec Implemented, roadmap 201 ✔️, P2.1 Done.
**Next:** `/spec-new 202`. 201 is uncommitted on `feat/201-track-model`.
**Blockers:** none

## 2026-10-07 — 201 (T032)

**Done:** track behaviour: hidden video → black preview with layers (clip sound kept, D2), muted music silent in
playback, locked clips refused with a toast (drag, trim, split, duplicate, delete) and a read-only inspector. Height
menu moved to a portal (was painted under the clips). All T030 tests green; video e2e 11 passed; self-test 6,117 / 0.
**Next:** T040 self-test video section, T041 timing.
**Blockers:** none

## 2026-10-07 — 201 (T031)

**Done:** track headers: "Video track" / "Music track" groups with Hide / Mute, Lock and a height menu (Small /
Medium / Large, keyboard), row heights from `trackView`, dimmed hidden / muted rows, 4 new lucide icons. Header and
axe / 360 px tests pass (desktop + phone); existing video e2e 6 passed; check 883. Gotcha: rAF focus in menus loses
fast keys (learnings).
**Next:** T032 behaviour; then T030's Hide / Mute and Lock tests pass.
**Blockers:** none

## 2026-10-07 — 201 (T030)

**Done:** track headers e2e written first (`describe('video track headers')`, 4 tests, 6 runs incl. phone): all
fail on the missing headers. Maintainer's call: Medium = 64 px for every track (D-008; spec Q5 Changelog, plan §4).
Found: AC-4 / T030 name Ctrl+D and Alt+arrow, which the video editor doesn't have; flagged for verify.
**Next:** T031 headers UI, then T032 behaviour (preview black when hidden, music mute, lock refusals with toast).
**Blockers:** none

## 2026-10-07 — 201 (T023)

**Done:** 2.x `timeline()` / `clipAt()` / `totalLength()` removed from `engine/video.ts`; components read
`projectOf` / `videoLength` / `videoAt` / `clip.start`. New e2e "clips sit end to end on the timeline" (no test
caught blocks drawn at 0 before). Check 883, video e2e 6, self-test 6,117 / 0, preview 10.5 ms, export 2.76 s.
**Next:** T030 (track headers e2e, test first).
**Blockers:** none

## 2026-10-07 — 201 (T022)

**Done:** export over the track model: `ExportJob` is a `Project` (tracks, clips with start, sound clips with files),
frames from `framePlan` (hidden `V1` → `NO_PICTURE`: black + layers), sound from `audioPlan` (muted `A1` left out);
store passes `musicClips()`. Check 883, video e2e 5, self-test 6,117 / 0 failed, export fastest 2.78 s (≤ 2.90 s).
Break-test: music missing from the lookup → Reel e2e fails (no `mp4a`).
**Next:** T023 (components off `timeline()` / `clipAt()` / `totalLength()`).
**Blockers:** none

## 2026-10-07 — 201 (T020–T021)

**Done:** T020: the video store on tracks (`tracks`, clips with `track` / `start`, music on `A1`, `pack` in
`change()`, lengths from `projectLength`, undo snapshots with `tracks`). T021: `patchTrack` / `lockedReason` in
`timeline.ts` (3 unit tests, test-first), store `setTrack` (one undo step per switch; plan updated), `trackView` /
`setTrackHeight` (view only), lock guards on every clip and music action (`clipLocked`, `musicLocked` for messages).
`npm run check` 883 tests; video e2e 5 passed unchanged.
**Next:** T022 export over `framePlan` / `audioPlan` (`npm test`, video e2e), then T023.
**Blockers:** none

## 2026-10-06 — 201 (spec, plan, tasks; T001–T003)

**Done:** 201 spec (Q1–Q7 accepted), plan (D1–D3 accepted; AC-3 reworded to identical inputs), tasks. T001: the
self-test makes a 2 s H.264 test clip in memory with Mediabunny and decodes it (`src/dev/videoChecks.ts`). T002:
timing baseline on 2.x code: preview fastest run 10.1–11.4 ms, export 2.64–2.76 s (60 clips, 24 s 1080p, WebGPU);
medians are noisy (later runs slower). T003: frozen 2.x reference + 12 fixtures (`timeline.testkit.ts`).
**Next:** T010/T011 the model, test-first.
**Blockers:** AC-5 measuring rule (fastest run vs median) needs the maintainer's OK.

## 2026-10-06 — 001 (T010–T011, T020–T021, T031–T032)

**Done:** CI is a reusable workflow the Desktop release runs first (`build` needs `ci`); docs say CI runs once per
release (D-006 follow-ups done). `npm run measure:gate` (installed Chrome, headed, 15 MP photo, two masks): gate
metric changed to the time between preview updates (rAF median hid a 4× CPU throttle), pacing via
`performance.now()` (Windows timers); this machine 16.6 / 19 ms PASS, throttled 41 / 55 ms FAIL; spec AC-1/AC-2/Q2
updated with the maintainer's OK; `docs/PERFORMANCE.md` section. RAW set (CC0 CR3, NEF, ARW + synthetic DNG) all
developed by LibRaw in the packaged Windows app and exported as 16-bit TIFF.
**Next:** 👤 T022/T023 (laptop), T030/T033 (Mac), then T040 release changes, T041 merge, T042 dry run, T043 tag.
**Blockers:** the remaining tasks need the maintainer's hardware or go-ahead.

## 2026-10-06 — 001 (T001–T004: bug fixes G6–G8, plus spec / plan / tasks)

**Done:** 001 spec (Q1–Q10 accepted), plan (D1–D3 accepted; D-006 amended: one dry run per release, CodeQL keeps
its triggers), tasks. Bug fixes from 000's gaps: **G6** `npm audit fix` (lockfile only, all dev: electron-builder
26.17.0, source-map-js 1.2.2, http-cache-semantics 4.3.0) → 0 high; one moderate advisory left (sprintf-js, no fix
exists, build-time only). **G7** `mcp-smoke.mjs` deletes every file it writes, pass or fail; 73 old files (106 MB)
cleared with the maintainer's OK. **G8** `logError('handled', e)` in all 14 shown-error catches (000 counted 15; one
was a false positive in `presets.ts`), guarded by `src/lib/errors.test.ts`. All gates green (743 unit tests, 6,115
self-test checks, MCP incl. the packaged app); e2e one unexplained failure in 5 runs (name not captured).
**Next:** T010 (CI as a reusable workflow called by the release), T011 docs, then T020 measuring script.
**Blockers:** none

## 2026-10-06 — 000-baseline (T090–T092) ✔️

**Done:** doc fixes committed as `e549542` (user's OK); on the clean clone check, build (326 KB) and e2e (67 passed)
green again. Known gaps G1–G9 in the spec (G6 npm audit: build tools only; G7 MCP test leaves files in Documents;
G8 15 shown errors without `logError`, 6 that should log). Small fixes: MCP test time ~10 s in testing-strategy,
check-bundle comment 326 KB. All 12 ACs ticked, spec Implemented, roadmap 000 ✔️, clone deleted.
**Next:** `001` (Phase 1 gate, macOS build, 2.10.0); G6–G8 as bug fixes before its release.
**Blockers:** none

## 2026-10-06 — 000-baseline (T030–T032)

**Done:** `spec.md` Baseline inventory (16 areas, all 6 routes, linked docs) and Numbers (plan parity / frame times
beside the baseline's measurements, 6,115 checks, 326 KB entry, 56 tools = 34 + 22). Fixed: P1.12 row said 21 photo
tools (→ 22 since `find_with_ai`); self-test "~6,000" → "~6,100" in CLAUDE.md and `src/data/docs.ts`. Link check
(scratch `links.mjs`, exact case + GitHub slugs): specs/ + docs/ 147 links, 0 broken; only vendored `.claude/skills/`
have broken links. `npm run check` exit 0.
**Next:** T090 (commit needs the user's OK), T091, T092.
**Blockers:** none

## 2026-10-06 — 000-baseline (T021, T023)

**Done:** T021: `lld.md` module map now names every directory and module under `src/` and `electron/` (was 17 of 29
directories and 29 modules missing: GPU graph, light/curve/hsl/detail/deep/raw/tiff, dev/selftest, raw.cjs, …);
routing and components cover `#/instagram` and `#/docs`; `architecture.md` §4 UI and desktop rows updated;
`build.md` Node 22 → 26. T023: every Phase 0–1 item maps to an Unreleased line (no line added); TypeScript 5.9 → 6.0
fixed there. `npm run check` exit 0 (741 tests).
**Next:** T030 (inventory), T031 (numbers; photo-tool count 22 vs 21 in editor-implementation P1.12), T032.
**Blockers:** none

## 2026-10-06 — 000-baseline (T001–T016, T020, T022, T024)

**Done:** spec/plan/tasks committed (`fd2baaf`); clean clone set up; every gate green: check, licences, build
(entry 326 KB), self-test ×3 (6,115 checks, 0 failed), MCP ×3, e2e ×3 (67 passed, 7 skipped). The branch has no CI run
(CI runs only on pushes to main and on PRs); the nearest is main @ `cc192e1`, green. Gaps for T091: npm audit (10), the MCP test leaves
files in Documents, Docker isn't in the local gates, and build.md's Node version is out of date.
Then T020 (tech-stack: Mediabunny row added, react-dom/onnxruntime-web named, lucide 1.51, TypeScript 6.0
note, also in CLAUDE.md), T022 (`src/assests/` unreferenced; user chose to keep it → Known gap), T024 (2.10.0 ships
Phases 0 and 1).
**Next:** T021 (module map), T023 (CHANGELOG).
**Blockers:** none

## 2026-10-06 — chore: spec-driven development set up

**Done:** `specs/` (constitution, workflow, roadmap, tech stack, architecture, testing strategy, templates),
`memory/`, `/spec-*` commands, CLAUDE.md section (D-001). Engineering docs and `docs/planning/` moved into
`specs/` with every link updated (D-002); feature numbering by editor work item (D-003); `npm run check` (D-004);
skills, commands and CLAUDE.md committed (D-005).
**Next:** see `MEMORY.md` → Next step.
**Blockers:** none
