# Progress Log

Newest first. One entry per working session.

```
## YYYY-MM-DD — <feature id or "chore">
**Done:** …
**Next:** …
**Blockers:** …
```

---

## 2026-10-10 — 405 Implemented: the roadmap as a road (merged into main)

**Done:** on `feat/405-roadmap-revamp` (from `spec/405-roadmap-revamp`, from `main`). Spec, plan (D1–D4, D-029) and
tasks approved and committed (`54b86c6`). T001 spike: an SVG road over 26 measured stops scrolls at 16.7 ms a frame,
also with the CPU slowed 4x; anchors near each column's edge and Catmull-Rom tangents. Data: `progress()` gains
sections, running, blocked, finished, statuses and upNext; API 3; optional phase `release` (3.0.0, 3.1.0). Logic
test-first: road, pace, changes, geometry (+49 unit tests). UI: the road with phase regions and stops, the hero on the
dark stage, the route rail / bottom bar, Back to now and `?at=`, Pace, filters by dimming (D4), live changes announced
once, reduced-motion twins, feature-page segments and gliding cards. Q9 revised (one scroll listener, not CSS scroll
timelines). Browser checks `npm run test:roadmap` 17 / 17 (twice): they caught a 404-era bug (a pasted filter URL in an
open tab was ignored) and WCAG 2.2 target size on the rail. Gates: check 1,131, build entry 327 KB, licences ok.
Maintainer's first look (T050): "looks good but theme is not looking good … the green color is too much for the items".
Theme reworked (no paid /scroll-world clips; its map-like art direction borrowed in CSS): the road as a road (kerbs,
bed, dashed centre line, travelled part in airmail navy), a dotted map panel, phase headers with the airmail edge,
done stops in calm graphite, in progress in navy, drawn status dots instead of the roadmap's emoji (the tick rendered
purple), navy pace bars and segments with today in red; green stays only on the board's Done column. test:roadmap
17 / 17 (axe contrast included).
Second look: "perfect as of now". T050, AC-9 and T092 done; 405 Implemented, roadmap ✔️, merged into `main`.
**Next:** 204 T030 (the preview on the pool) on `feat/204-decoder-pool`.
**Blockers:** none.

## 2026-10-09 — 202 verified: Implemented ✔️

**Done:** on `feat/202-edit-operations`: T090 docs (MEDIA-STUDIO, lld, CHANGELOG, in-app docs); T001 closed with
the maintainer's manual checks (Alt keys fine in Chrome and the desktop app); T041 timing: session 1 within the bar
(10.4 ms / 2.64 s), session 2 slower for every build, and back to back with `main` level (12.4–12.6 vs 12.7–12.8 ms,
2.92–3.07 vs 2.88–2.89 s). Verification: check 1,082 (one test added: silence from the video track in a gap, music
through it, AC-4), e2e 83 passed / 15 skipped / 0 failed, build entry 327 KB, `npm test` 6,125 / 0, test:mcp passed
(after `npm run fetch:libraw` on this machine), licences ok. All 13 ACs ticked; spec Implemented, roadmap ✔️,
`editor-implementation.md` P2.2 Done. DoD 7 (agent tool) waived by Q7 for `212`.
**Next:** merge `feat/202-edit-operations` into `main` (maintainer); answer 203 / 204's open questions.
**Blockers:** none.

---

## 2026-10-09 — 202 UI: T030–T033, T040

**Done:** on `feat/202-edit-operations` (the work started on `main` by mistake and was moved before any commit).
T030: `describe('video edit tools')` in `e2e/editors.e2e.ts` (6 tests; the video for Roll / Slip is a Reel the app
exports in the test). T031: tool picker (radiogroup), Magnetic and Snap switches, V / R / Y / U. T032: drags per tool
(move to a time, Shift ripple, Roll, Slip, Slide, Alt skips snapping, frame rounding). T033: gap buttons, Alt + arrows,
Q / W, Shift + Delete, polite live region; `Toast.tsx` re-shows a repeated message. T040: self-test gap export (45
black frames with the layer). Editors e2e 24 passed / 0 failed; `npm test` 6,125 / 0; `npm run check` 1,081.
**Next:** T041 (second timing session), T090 docs, T091 gates, T092 close.
**Blockers:** T001's two manual Alt-key checks (maintainer).

---

## 2026-10-09 — fix(404): criteria intro before the first group; branches updated

**Done:** `main` fast-forwarded to 404 (`962d348`), then `feat/202-edit-operations` and `feat/201-track-model`.
Converting `spec/203-204`'s drafts found a generator bug: a criteria section's own intro (above its first group, as in
204) was stored but never written. Fixed in `render/feature.mjs` with a test; existing documents unchanged.
**Next:** merge `main` into `spec/203-204` and convert 203 / 204 to `feature.json`.
**Blockers:** none.

---

## 2026-10-09 — 404 reworked: JSON-first features, kanban board, React dashboard (D-026)

**Done:** At the maintainer's request (before committing 404): `feature.json` schema 2 holds spec, plan and tasks;
spec / plan / tasks / roadmap Markdown generated from it; task lifecycle (to do, in progress, blocked, done); CLI
`start` / `block` / `done` / `undone`; Claude Code hook (refuses edits to generated Markdown, regenerates after JSON
edits); 6 features migrated with a word check (0 words lost; 202 T001 blocked). Dashboard rebuilt as React +
TypeScript in the Chitthi look: current phase on the dark stage, other phases folded, kanban board per feature with
drag and drop and a keyboard "Move" menu. Gates green (1080 tests); axe 0 serious at 1280 / 360, light / dark.
**Next:** commit 404 (and the factory removal) when the maintainer says so; then 202 (T001 is blocked on the manual
checks; next to do: T030).
**Blockers:** none.

---

## 2026-10-09 — 404 roadmap data (JSON) and dashboard

**Done:** 404 spec reworked at the maintainer's request (JSON as the tracking source, D-025), plan and tasks, built:
`tools/specs-index/` (schemas, validator, check, sync, CLI with `new` / `import` / `status` / `done`) and
`tools/roadmap-dashboard/` (`npm run roadmap`). Backfill: `roadmap.json` (25 items, dependencies) and 6
`feature.json` files from the Markdown; `roadmap.md` now generated (+ Needs column). `specs:check` runs in
`npm run check`. 79 tool tests; dashboard checked with axe at 1280 / 360 px, light and dark: 0 serious or critical.
**Next:** commit 404 on its branch and merge it; then 202 T001 / T030 with `/spec-implement 202`.
**Blockers:** none.

---

## 2026-10-09 — chore: software factory removed (D-024)

**Done:** At the maintainer's request, the software factory (402, 403) was removed from `main`: factory scripts,
agents, hooks, settings, `/factory`, `/release`, `/spec-batch`, the 402 spec and `specs/software-factory.md`.
Constitution, workflow, `CLAUDE.md`, `/spec-*` commands and engineering docs went back to their state before 402
(test-first; D-023 reverted). Branches `feat/402-software-factory` and `feat/403-live-dashboard` deleted (local and
`origin`), factory stashes dropped. Then `feat/202-edit-operations` was reset to `main` and force-pushed (its UI
commits `f271e1b`–`0bb6014` discarded at the maintainer's request; T030–T033 open again). Drafted
`404-roadmap-dashboard` spec (localhost roadmap dashboard, `npm run roadmap`) on `feat/404-roadmap-dashboard`.
**Next:** answer 404's Q1–Q7 and approve its spec; 202 T030 with `/spec-implement 202`.
**Blockers:** none.

---

## 2026-10-09 — 403 T011–T020, spikes T002 / T003; 403 paused; build first, test at the end (D-023)

**Done:** On `feat/403-live-dashboard`: the loop committed T011–T014, T016, T032, T045 and T020 (`65f6755`);
T015 committed by hand with the plan amended for 1-hour cache writes (D-021, `fc65495`). Spikes: T002 SSE (named
`ping` event, not a comment: D-022; Windows `EPERM` on rename over a file being read) and T003 (stream-json
parity, 114 tests unedited). Then, at the maintainer's request, 403 paused (loop stopped on T021; its work in
`stash@{0}` on that branch) and the process lightened on `chore/build-first-testing`: constitution 2.0.0 II "Build
first, test at the end" (D-023), gates per task now `check` (+ build / licences when touched).
**Next:** product features: 202 T030 (`/factory 202`; its 2026-10-08 stash is on `feat/202-edit-operations`).
403 resumes later from T021 (pop the stash or let the loop redo it).
**Blockers:** none.

---

## 2026-10-08 — 402 into `main`; 202 T030 stop; 403 spec → T004; allow-list fix

**Done:** AC-11 amended to ≥ 2 (D-018); drill branches and worktrees removed; 402 merged into `main` (`5298b66`,
pushed, with 201, 401 and 202 T010–T021: don't release `main` before 202 is done); 202 fast-forwarded to `main`.
`/factory 202 --once`: T030 + T031 stopped on `turns` (41, US$2.60, 5 refused piped / `python -c` / loop commands),
work in a stash on 202. 403 live dashboard: spec (D-019, amends D-015: stream-json), extend-in-place NFR, plan
(D-020), 57 tasks, branch `feat/403-live-dashboard` (pushed). T001 👤 spike (US$0.40 + 0.31 for the fix below):
stream-json needs `--verbose`; `parseClaudeJson` reads the stream unchanged; fixtures in `fixtures/stream/`.
T004 by the loop stopped on `turns` (US$2.24) after finishing; finished, reviewed (one note-wording rejection
fixed) and committed in the session (`734d1d1`). **Bug fix:** the allow-list's `node scripts/:*` matched no script
in a subfolder (`:*` needs a word boundary); now `node scripts/*`, proven with one headless call per rule, test
added (D-014 amended).
**Next:** 👤 T002 (SSE on Windows) and T003 (parity) in a session; then `/factory 403 --once` from T010.
**Blockers:** none.

## 2026-10-08 — 402 T054–T091, `/spec-verify 402` (verified except AC-11, AC-16)

**Catch-up (this log had nothing after T054's plan):** T054 👤 first real `/factory 402` runs, US$4.83 of US$10:
T060 (`lock.mjs`, gate lock; `721d4f5`) and T070 (`bumpRelease`; `10fe9ee`) done unattended; T061 and T071 stopped
`question` because a headless run can't write `.claude/`, finished interactively (`695d347` worktree lines and
`--intake`, `/spec-batch`; `7016890` `release:prepare` and `/release`). The maintainer saw the toast (AC-13) and
accepted 2 unattended tasks instead of ≥ 3. Stop drill on throwaway `feat/998-stop-drill` (US$0.71); third failure
proven only by the scripted test. Docs `4412d1c`. T080: constitution 1.1.0, XII, D-016, Claude Code CLI in
tech-stack (`46938e5`, `bdfab09`). T081: workflow "Running the line" and the other docs (`7550f39`). T090:
architecture §11 "Development tooling" (`9d8e8f2`). Merged `main` (2.10.0 release) in `f3fd742`. T062 👤:
`/spec-batch 203 204` gave Draft specs (203: 15 ACs / 14 questions; 204: 16 ACs / 10 questions), kept on
`spec/203-204` (`b8b6ee9`, pushed); recorded in `362d80c`. `c50007a`: release tests seed their own Unreleased entry.
**Done:** T063 👤 deferred by the maintainer to the roadmap backlog (⏸️ in tasks.md, backlog entry in roadmap).
T091: `npm run factory:gates -- --verify --task T091` (run file `.factory/runs/2026-10-08T15-03-52Z-402-T091.json`),
all green: check 1269 tests (990 app + 279 factory), lint 0 errors / 5 known warnings; build entry 327 KB of 350;
e2e 76 passed, 10 skipped (phone runs of desktop-only tests, by design), 0 flaky, axe passes; self-test 6,124 / 0;
test:mcp 56 tools; licences 168. T091 ticked; 16 of 18 ACs ticked. Open: AC-11 (≥ 3 unattended tasks; T054 ran 2)
and AC-16 (T063 deferred), so spec stays In Progress, T092 not ticked, roadmap "🚧 verified 2026-10-08 except AC-11
… and AC-16 …"; software-factory.md §3.6 F1–F4, F7 ✔️, F5 and F6 not (F6 cell now says T062 done, T063 deferred).
**Also:** the maintainer amended AC-11 to ≥ 2 unattended tasks (D-018); ticked, 17 of 18 ACs, F5 ✔️.
**Next:** the maintainer decides whether CHANGELOG.md needs a 402 line (developer tooling only), and deletes the local branches
`feat/996-drill-a`, `feat/997-drill-b`, `feat/998-stop-drill` and their stashes. Then T092.
**Blockers:** AC-16 waits on T063 (backlog).

## 2026-10-08 — 402 spec, plan, tasks; T001–T002 (spikes)

**Done:** 402 spec approved (Q1–Q10, D-012; Q9 revised to `* text=auto` after `git ls-files --eol` showed the
index is LF everywhere), plan approved (P1–P5), 33 tasks. Branch `feat/402-software-factory` (made from 202's
HEAD with today's uncommitted work; nothing committed). T001: hooks fire in `claude -p`; hidden `--max-turns`
works; `--json-schema` needs `StructuredOutput` in the agent's tools; ~US$0.50 spent. T002: a worktree with a
`node_modules` junction runs check (990), e2e and self-test (6,124 / 0); remove the junction before the worktree.
Plan §5 / Techniques updated; 4 learnings.
**Also (same day):** T010–T013 (F1): fixtures, `state.mjs` (+21 tests; fixed 👤 detection the dashboard
already had), dashboard rewired (output identical but for that fix), `next.mjs`, roadmap Needs column (D-013,
inferred), task tags in the template. Check 1,011.
**Also:** T020–T022 (F2): `npm run factory:gates` (rules table, real-output parsers, run files, dashboard
panel with local time and red summaries inline); first real run green (check 1,039, licences 168).
**Also:** T030–T034 (F3): `rules.mjs` (51 tests), hooks `.claude/hooks/pre-tool.mjs` (38 ms) and `stop.mjs`
(diff-hash cache), registered in the committed `.claude/settings.json` and live in this session at once; live checks
with `claude -p` in a throwaway worktree (AC-5, AC-7); `.gitattributes` `* text=auto` (it existed: `*.onnx` kept;
AC-8 proven in a throwaway index). Check 1,097.
**Also:** T040–T042 (F4): seven agents in `.claude/agents/` (+9 tests; real tool lists checked per agent); the
`/spec-*` commands hand work to them, each run once headless on a throwaway feature 999 (~US$5.40; found the
headless allow-list need, D-014, test-first pairs vs the Stop hook, ignored resources in worktrees); reviewer
proof: 3 seeded bad changes rejected with the right rules, 1 good accepted (~US$0.50). Check 1,106.
**Also:** T050–T051 (F5, first run of the new `/spec-implement` flow): implementer agent did the pair
(`run.mjs`: `decide`, `parseAgentOutput`, `commitMessage`, `taskBatch`; 54 tests); reviewer **rejected** it once
(turn cap retried instead of stopping, AC-12; an untested guard; Result-note counts off), implementer fixed all
three, reviewer accepted. Check 1,160.
**Also:** T052 (the runner `run.mjs`, `npm run factory`; scripted runs as tests, no `--dry` flag, D-015) and T053
(`notify.mjs`, dashboard Loop panel, `/factory` command). The reviewer rejected T053 once because nobody had seen
the toast. Seeing the toast moved to T054's test, and an empty-text bug was fixed. Check 1,211. Feature committed
and pushed on `feat/402-software-factory`.
**Next:** T054 👤: `/factory 402` (budget US$10) runs the (loop) tasks T060, T061, T070, T071; watch the dashboard
and the toast.
**Blockers:** none for 402. 202 still waits on T001's manual checks.

## 2026-10-08 — chore: software factory doc and dashboard (D-011)

**Done:** `specs/software-factory.md`: the SDD setup end to end, what a software factory is, the plan F0–F8 for
Chitthi, the dashboard, other ways to manage the work. Built F8: `scripts/factory/dashboard.mjs`
(`npm run factory:dashboard`, `-- --serve` on 127.0.0.1:4310 with a 10 s refresh): stations board, Now, Waiting on
you, features, gate runs, sessions, decisions, commits. Checked at 1400 px light and 390 px dark (no console errors,
no sideways scroll). Linked from `specs/README.md`, `CLAUDE.md`, `specs/build.md`; `.factory/` git-ignored. D-011.
`npm run check` 990 passed, lint 0 errors (5 known warnings).
**Next:** 202 T030 as before; for the rest of the factory, `/spec-new software-factory` (402).
**Blockers:** T001's manual checks (needed before T032 / T033).

## 2026-10-07 — 401 ✔️; 202 T020–T021 (the store)

**Done:** 401 approved by the maintainer (Q1–Q4 as proposed), planned and implemented: Settings › AI › **AI models on
this device** (`modelState` / `deleteModel` in `ai/segment`, `ModelsOnDevice` in `AiSettings.tsx`), 9 unit tests with
stubbed OPFS / worker, e2e on desktop and 360 px, docs. All DoD gates green: check 971, build 327 KB, licences 168,
e2e 76 / 10 skipped / 0 failed, self-test 6,124 / 0, MCP passed. 202 T020–T021: Magnetic, tool and Snap in the video
store; every edit tool as a store action returning its refusal (19 store tests via a new `loadVideoProject`); check
990, editors e2e unchanged, self-test 6,124 / 0. Learning: Prettier on old `src/` files rewrites them (undone).
**Next:** 202 T030 (e2e for the edit tools, test-first), T031–T033 (UI).
**Blockers:** T001's manual checks (needed before T032 / T033).

## 2026-10-07 — 202 (T012–T018); 401 drafted

**Done:** `src/engine/edits.ts` (new): `checkTrack`, ripple delete, lift, close gap(s), trim (ripple or not),
moveTo, reorder, roll, slip, slide, nudge, snapping (the timeline now uses it); 68 tests incl. AC-1 against today's
store, 1,000 seeded edits per operation (AC-11; found two floating-point bugs, see learnings) and timing (AC-12:
≤ 0.017 ms on 500 clips). `magnetic` in the project document and `mergeProject` (T018). D-010. `npm run check` 965;
video e2e 11 passed / 7 skipped / 0 failed. Drafted `401-ai-models-on-device` (Settings section to see and delete the
downloaded sky model; the maintainer asked where browser models live: OPFS `models/skyseg.onnx`).
**Next:** 202 T020 (store); 401 needs Q1–Q4 answered and approval.
**Blockers:** T001's manual checks (needed before T032 / T033).

## 2026-10-07 — 202 (spec, plan, tasks; T001 partly, T010–T011)

**Done:** 201 committed and pushed (`452fec2` D-007, now D-017; `a3adea2` 201). 202 spec (Q1–Q8 accepted), plan (D1–D4 →
D-009), tasks; branch `feat/202-edit-operations`. T001 spike: the desktop menu has no Alt + arrow accelerator;
Playwright can't reach browser shortcuts and OS key injection was unreliable (learnings), so 2 manual checks are
left to the maintainer. T010–T011: gaps in the model (886 unit tests, self-test 6,124 / 0, 201 equivalence intact).
**Next:** T012–T013 edit operations part 1.
**Blockers:** T001's manual checks (needed before T032 / T033).

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
## 2026-10-06 — 2.10.0 release: dry run 1 failed, test fix

**Done:** released 2.10.0 from `feat/editor-phase-1-continued` per D-007 (merged into `main` `5c029ff`). Dry run 1
(run 37507302121): CI `docker` passed (first image check of the baseline, G5), CI `check` failed in e2e: "AI masks"
(`instagram.e2e.ts:498`) timed out twice. Cause (trace): the test read the whole canvas back as a JS array, 8.4–8.8 s
on the software-rendered runner, longer than the 5 s poll. The feature worked (screenshot). Bug fix: compare in the
page, return one number, poll up to 30 s; break-tested (exposure 0 → fails). Local e2e 67 / 7 skipped.
Dry run 2 green (Intel LibRaw built for the first time); tag `v2.10.0` → release run green →
**2.10.0 published** 18:50 UTC with all 12 files.
**Next:** post-release checks (maintainer: clean installs, update from 2.8.0, laptop gate, Mac RAW); then 201 T020
after merging `main` into `feat/201-track-model`.
**Blockers:** none

---

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
