# Decision Log

Append-only. Newest at the bottom. To reverse a decision, add a new entry that says `Supersedes D-00X`.

Format:

```
## D-00X — Title (YYYY-MM-DD)
**Context:** … **Decision:** … **Alternatives:** … **Consequences:** …
```

---

## D-001 — Adopt spec-driven development (2026-10-06)

**Context:** Work is done across many sessions, by people and AI agents that don't remember earlier sessions.
**Decision:** Every feature goes Specify → Plan → Tasks → Implement → Verify (`specs/workflow.md`), gated by the
Definition of Done in `specs/constitution.md`; durable project memory lives in the committed `memory/` folder.
**Alternatives:** ad-hoc issues/PR descriptions only; an external tracker.
**Consequences:** Specs and memory are part of every feature's diff; `/spec-*` commands drive the stages.

## D-002 — Engineering docs live in specs/, product docs in docs/ (2026-10-06)

**Context:** SDD adds `specs/`; the repo already had HLD, LLD, technologies, testing, licensing, build and release
docs in `docs/` beside the product docs, plus `docs/planning/` with the editor roadmap and implementation plan.
**Decision:** Move (git mv) HLD → `specs/architecture.md`, LLD → `specs/lld.md`, TECHNOLOGIES → `specs/tech-stack.md`,
TESTING → `specs/testing-strategy.md`, LICENSING → `specs/licensing.md`, BUILD → `specs/build.md`, RELEASE →
`specs/release.md`, `docs/planning/*` → `specs/vision/`. `docs/` keeps product, user and operator docs
(MEDIA-STUDIO, AI, MCP, PEXELS, DESKTOP, OPERATIONS, TROUBLESHOOTING, ACCESSIBILITY, PERFORMANCE, SPECIFICATIONS,
print-quote, screenshots). All links updated, including the in-app docs (`SPEC()` helper in `src/data/docs.ts`).
**Alternatives:** move only `docs/planning`; keep LICENSING.md in `docs/`.
**Consequences:** One home for how-we-build docs; external links to the old `docs/` paths on GitHub break.

## D-003 — Feature numbers follow the editor work-item IDs (2026-10-06)

**Context:** The editor plan already names work items P2.1 … P3.9, used in commits and the CHANGELOG.
**Decision:** `000–099` baseline/foundation, `2xx` = editor Phase 2 (P2.1 → 201), `3xx` = Phase 3, `401+` other.
Phases 0–1 are done and stay recorded in `specs/vision/editor-implementation.md`, without feature folders.
**Alternatives:** the template's tens ranges (000–009, 010–019 …) with no link to P-IDs; drafting all 21 specs now.
**Consequences:** Specs are written when an item starts (`/spec-new`); `roadmap.md` tracks status from Phase 2 on.

## D-004 — `npm run check` is the fast gate (2026-10-06)

**Context:** The per-task gate needed typecheck, lint and unit tests as three commands.
**Decision:** Add `"check": "npm run typecheck && npm run lint && npm run test:unit"` to `package.json`. The full
Definition of Done adds `test:e2e`, `build`, `test`, `test:mcp` and `check:licenses` (as CI runs).
**Alternatives:** document the three commands without a script.
**Consequences:** One command to run before ticking any task.

## D-005 — Claude Code skills, commands and CLAUDE.md are committed (2026-10-06)

**Context:** `.claude/` and `CLAUDE.md` were gitignored as per-developer, so the `/spec-*` commands and the
session-start rules existed on one machine only.
**Decision:** Commit `CLAUDE.md`, `.claude/commands/`, `.claude/skills/` (sdd-setup, hallmark with its MIT LICENSE)
and `skills-lock.json`. `.claude/settings.local.json` stays ignored. `scroll-world` stays local: no known source or
licence (`specs/licensing.md`).
**Alternatives:** keep them local per developer.
**Consequences:** Every contributor and agent session gets the same workflow; third-party skills follow the licence
policy like any other asset.

## D-006 — CI runs only for a release tag, never on feature branches (2026-10-06)

**Context:** `ci.yml` runs on every pull request and every push to `main`; feature branches had no CI run (000 gap
G5). The maintainer decided CI is a release step, not a per-branch or per-PR one.
**Decision:** Never run CI on feature branches. CI runs once, when a new version tag (`vX.Y.Z`) is being released;
that run is the full check of the project before the release goes out. Day-to-day verification is local:
`npm run check` per task, the full Definition of Done gates before a feature is Implemented.
**Alternatives:** CI on every PR and push to `main` (today's `ci.yml`); CI on every push to any branch.
**Consequences:** Local gate runs (recorded in each feature's Result notes) are the evidence for a feature; a red CI
at tag time blocks the release. Docker image and the Windows runner are first checked at the release tag.
Follow-ups, done in 001 T010–T011 (2026-10-06): `ci.yml` is a reusable workflow (`workflow_call` only) that the
Desktop release workflow runs first (`build` needs it); `specs/release.md`, `testing-strategy.md`, `build.md`,
`CONTRIBUTING.md`, `docs/OPERATIONS.md`, `docs/ACCESSIBILITY.md` and `docs/DESKTOP.md` say so.
**Amended (2026-10-06, 001 plan D2, D3):** a release may have one dry run before its tag: the Desktop release workflow
run by hand (`workflow_dispatch`) on `main`, which runs CI and builds installers without publishing. CodeQL
(`codeql.yml`: pull requests, pushes to `main`, weekly) is a security scan, not the CI gates, and keeps its triggers.

## D-007 — 2.10.0 is released before the Phase 1 hardware checks (2026-10-06)

**Context:** 001's spec held the 2.10.0 tag until the Phase 1 gate (masked edits at 30 fps in Chrome on a mid-range
laptop) and RAW on macOS were checked on the maintainer's hardware; those checks were deferred to the roadmap backlog.
**Decision:** release 2.10.0 now from `feat/editor-phase-1-continued` (merged into `main`), after a dry run of the
release workflow; the hardware checks (001 T022, T023, T030, T033) become post-release checks. 201's work stays on its
own branch.
**Alternatives:** wait for the checks; release with the macOS builds marked untested.
**Consequences:** if a check fails, the fix ships as 2.10.1. Everything checkable on Windows passed (all gates, RAW on
the packaged app, the gate measurement on the development machine). The Intel Mac LibRaw is first built by the
release workflow itself.

## D-008 — Track height Medium is 64 px for every track (2026-10-07, 201 T030)

**Context:** Spec Q5 gives three track heights (Small 40, Medium 64, Large 96 px); the plan said the default would
keep 2.x's row heights, but 2.x's music row is 44 px, not 64.
**Decision:** One set of sizes for every track; Medium (the default) is 64 px, so the music row grows from 44 px.
Only the editor changes; videos are unchanged.
**Alternatives:** sizes per track kind (music 28 / 44 / 72); music starting at Small (40 px).
**Consequences:** room in the header for the track name above its three 24 px buttons, and for the waveform. Spec
Changelog and plan §4 updated.

## D-009 — Magnetic track: undo, duplicate, overlaps, settings (2026-10-07, 202 plan D1–D4)

**Context:** 202 adds a Magnetic switch (on = the video track stays packed, as before; off = gaps allowed) and edit
tools. Four behaviours needed a rule.
**Decision:** (D1) undo snapshots carry `magnetic`: switching it on closes the gaps as one undo step, and undoing it
restores the gaps with Magnetic off; switching it off isn't recorded. (D2) With Magnetic off, a duplicate goes into
the first gap after the original that fits, else after the last clip; nothing else moves. (D3) With Magnetic off,
`mergeProject` resolves overlapping clips by moving the later one to the end of the one it overlaps (with a reason),
never dropping it. (D4) The tool (Select / Roll / Slip / Slide) and the Snap switch are session view settings, not
undone or saved; Magnetic belongs to the project (in its document, optional, default on).
**Alternatives:** Magnetic outside undo (a magnetic track could show gaps after an undo); duplicate that ripples;
dropping overlapping clips; saving the tool and Snap with the project.
**Consequences:** a magnetic track never shows gaps; Magnetic off never moves clips unless asked; no clip is lost
when a project is read.

## D-010 — Slide at the ends of a track; 2.x clips under 0.3 s (2026-10-07, 202 T013–T015)

**Context:** AC-8 says a slide keeps the video's length; the plan didn't say what the first and last clips do. 2.x's
edge drag also lengthened a clip already under 0.3 s (2.x data only) to 0.3 s even when shortening it.
**Decision:** The last clip on a track can't slide (refused: "no clip after this one"), since moving it would change
the length. The first clip slides right away from 0 only with Magnetic off (it opens a gap before it); `slide` takes
`magnetic` and then opens no gap. A clip already under 0.3 s can't be shortened; it can be lengthened.
**Alternatives:** let the last clip slide (the video's end moves); keep 2.x's jump to 0.3 s.
**Consequences:** AC-1's comparison with 2.x skips trims of clips under 0.3 s (only the `tinyClips` fixture has any).

## D-011 — Software factory: documented; the dashboard ships first as dev tooling (2026-10-08)

**Context:** The maintainer asked for the spec-driven setup and a "software factory" on top of it to be written up in
one place, with an HTML dashboard to watch the work move. Constitution I asks for an approved spec before feature
code; the dashboard is a read-only developer script (`scripts/factory/`), not part of the app or its builds.
**Decision:** `specs/software-factory.md` holds the setup (Part 1), the factory (Part 2), the plan F0–F8 (Part 3),
the dashboard (Part 4) and other ways to manage the work (Part 5). The dashboard (F8: `npm run factory:dashboard`,
output in the git-ignored `.factory/`) is built now, without a feature spec, because it changes no app behaviour
and only reads files. F1–F7 (backlog parser, gates as code, hooks, specialist agents, orchestrator, release
station) change how agents work and go through `402-software-factory` with an approved spec.
**Alternatives:** spec 402 first and the dashboard as its first task; a GitHub Projects board instead of a local
page (two sources of truth).
**Consequences:** `specs/`, `memory/` and git stay the only source of truth; the dashboard is a view. It parses the
current file formats (roadmap table rows, `- [x] **Tnnn**`, `**Status:**`, `**AC-n**`, progress headings), so a
template change must keep them or update the parser.

## D-012 — 402 software factory: open questions answered (2026-10-08, 402 spec Q1–Q10)

**Context:** The 402 spec had ten open questions, each with a proposed answer; the maintainer said "choose best".
**Decision:** All ten as proposed. The loop runs a feature's agent tasks up to Verify, then stops for sign-off (a flag
limits it to one task) (Q1); it commits once per task on the feature branch and never pushes (Q2); at most 40 agent
turns per task and a US$10 cost cap per run by default, both overridable (Q3); parallel features are built but used
only after the loop has run cleanly on two features (Q4); `.claude/agents/`, `.claude/hooks/` and
`.claude/settings.json` are committed, `settings.local.json` stays personal (Q5); a Windows desktop notification plus
Claude Code's push notification, nothing external (Q6); constitution 1.1.0 adds "XII. Agents work within the line"
(Q7); Vitest also runs `scripts/**/*.test.mjs` (Q8); `.gitattributes` with `* -text`, no renormalising (Q9); the
release station stays in 402, last (Q10).
**Alternatives:** stopping after every task; no commits by the loop; a separate feature for the release station.
**Consequences:** 402 is Approved; the plan follows these answers.
**Amended (2026-10-08, 402 plan):** Q9 revised. The index already stores every text file as LF (`git ls-files --eol`:
584 `i/lf w/crlf`, 76 `i/lf w/lf`); the mixed endings exist only in this machine's working tree
(`core.autocrlf=true`). `* -text` would mark 584 files changed and commit CRLF, so `.gitattributes` gets
`* text=auto` instead (the same normalising for every machine, nothing to renormalise). AC-8 reworded.

## D-013 — Roadmap Needs: dependencies between work items, inferred from the vision doc (2026-10-08, 402 T013)

**Context:** The factory offers a feature only when the features it needs are Done (402 AC-2). The roadmap had no
dependencies, and `vision/editor-implementation.md` names none explicitly.
**Decision:** A **Needs** column in the Phase 2, Phase 3 and 400+ tables, inferred from the vision text: every
Phase 2 item needs 201; 203 and 206 need 204 (decoder pool "needed for overlapping clips and transitions"); 208
needs 205 (volume keyframes); 209 needs 208; 212 needs 202, 203, 205, 206; 302 and 304 need 301; 309 needs 301, 303,
305. Phase order itself (Phase 3 after Phase 2) is not encoded as needs.
**Alternatives:** no dependencies (order only); every item needs the one before it (too strict: 204 and 205 are
independent).
**Consequences:** `npm run factory:next` and the dashboard refuse a feature whose needs aren't Done (203 waits on
204). The maintainer may edit any cell; the readers take the column as written.

## D-014 — Headless agent runs get an allow-list of test and read-only git commands (2026-10-08, 402 T041)

**Context:** In `claude -p` there is no one to answer a permission prompt, so with `--permission-mode acceptEdits`
every shell command was refused: the implementer couldn't run its own tests (402 T041, five refusals in one run).
**Decision:** The factory's headless runs pass `--allowedTools` for Bash and PowerShell: `npm run:*`, `npm test:*`,
`npx vitest:*`, `npx playwright test:*`, `git status:*`, `git diff:*`, `git log:*`, `git show:*`,
`node scripts/:*`. Edits stay under `acceptEdits`. The guardrail hooks still check every call (`npm run format`,
`git tag` … are refused even though `npm run:*` is allowed).
**Alternatives:** `--permission-mode bypassPermissions` (any command, hooks the only guard); the same list in the
committed `.claude/settings.json` (would also stop prompting people in interactive sessions).
**Consequences:** an agent can't install packages, delete files from the shell or reach the network from Bash;
anything else it needs shows up as a `permission_denials` entry, which the loop reports. Interactive sessions keep
asking as before.
**Amended 2026-10-08 (bug fix, 403 T004):** `node scripts/:*` became `node scripts/*`: `:*` needs a word boundary,
so the old rule matched no script in a subfolder. Also found (403 T001, T004): read-only commands (`ls`) and, under
`acceptEdits`, file-system commands (`mkdir`, `rm <file>`) run without being listed, so "can't delete files from
the shell" above doesn't hold; only the hooks refuse such commands reliably.

## D-015 — The loop's runner: json output, stash on every stop, refusals and tool failures are stops (2026-10-08, 402 T052)

**Context:** T052 builds the runner around `decide`; plan §5 named `--output-format stream-json --verbose` and left
the per-call cap, a reviewer without a verdict and a failing `claude` open.
**Decision:** `claude -p … --output-format json` (one result object: `result`, `subtype`, `num_turns`,
`total_cost_usd`, `structured_output`, `permission_denials`); progress per phase comes from the loop's own lines and
`.factory/state.json`, not the stream. Per-call `--max-budget-usd` = max(US$0.50, min(budget left, US$4)). Two stop
kinds beside `decide`'s: `refused` (wrong branch, dirty tree, bad NNN: nothing is touched, never stashed) and
`error` (claude crashed, timed out after 90 min, gave no JSON, the reviewer gave no verdict, git add/commit failed),
both stashed like every stop before a commit; a reviewer without a verdict is a tooling fault, so it stops instead
of spending an implementer retry. `.factory/` must be git-ignored (it is), so the stash and `git add -A` leave the
loop state alone.
**Alternatives:** stream-json for live turn counts (more parsing, nothing the dashboard needs yet); retrying on a
missing verdict.
**Consequences:** the dashboard (T053) reads phases from `state.json`; switching to stream-json later only changes
`callClaude` / `parseClaudeJson`.

## D-016 — Constitution 1.1.0: principle XII, agents work within the line (2026-10-08, 402 spec Q7, T080)

**Context:** With 402 agents implement, review and commit on their own (`npm run factory`); the constitution said
nothing about what they may do without a person. Q7 (D-012) accepted a new principle.
**Decision:** MINOR bump to 1.1.0 (a principle added, per Governance). XII: agents may implement, test, review and
commit a feature's tasks on its feature branch within a budget (by default 40 turns per agent call, US$10 per run,
at most US$4 per call; D-015), never pushing, and may draft specs in a batch (intake), each with Status Draft for
people to approve. The task loop stops at 👤 tasks, stopped tasks (waiting on you), spec or plan changes, new
dependencies, the agent's own question (`FACTORY-STOP: question`), a task's third failure, a spent budget and
Verify, stashing work not yet committed; intake leaves its drafts in the tree for review. People approve specs and
plans, sign off, merge, tag and release. The hooks enforce what can be enforced: on `feat/NNN-*` branches code
under `src/` and `electron/` waits for an approved spec; force pushes, `git tag`, `git reset --hard`, `sed -i` and
Prettier under `src/` are refused; the Stop hook blocks a turn once while `npm run check` is red on changed code and,
if it is still red at the next try, lets the turn end and records the failure in `.factory/stop-hook.json`. Both
hooks fail open on their own errors; `CHITTHI_FACTORY_HOOKS=off` turns them off. P5: the Claude
Code CLI is listed in `specs/tech-stack.md` "Build and tooling" as a development tool, not shipped.
**Alternatives:** no principle, the rules only in `software-factory.md` and the hooks (an agent reading the
constitution wouldn't see its limits).
**Consequences:** a change to what agents may do alone (e.g. pushing, merging) is a constitution amendment; every
factory agent reads the constitution first, so each sees XII.

## D-017 — Full e2e runs once per spec, at verification, not after every task (2026-10-07)

_Numbered D-007 on the feature branches until `main` was merged into `feat/402-software-factory` on 2026-10-08;
`main`'s D-007 (the 2.10.0 release) kept the number._

**Context:** Running the whole Playwright suite (`npm run test:e2e`) after every UI task made features slow to finish.
**Decision:** During implementation, don't run the full e2e suite. If a task changes UI or integration, run only the
e2e tests for that spec's area (`npx playwright test e2e/<file>.e2e.ts [-g "<name>"]`). The full `npm run test:e2e`
runs once, at the end of each spec, as a Definition of Done gate in `/spec-verify`.
**Alternatives:** the full suite after every UI or integration task (the old rule in `workflow.md`, `constitution.md`
and `/spec-implement`).
**Consequences:** Tasks finish faster. A regression in another area may only show up at verification, and is fixed
before the spec is marked Implemented. `workflow.md`, `constitution.md` and `.claude/commands/spec-implement.md` say so.

## D-018 — 402 AC-11: two unattended agent tasks are enough proof (2026-10-08, 402 Verify)

**Context:** AC-11 asked for at least 3 agent tasks run without a person. T054's first real `/factory 402` run did 2
(T060, T070); T061 and T071 stopped because a headless run can't write `.claude/` and were finished by hand.
**Decision:** The maintainer amended AC-11 to at least 2 unattended tasks and accepted T054 as its proof.
**Alternatives:** let the loop finish a third agent task before ticking AC-11.
**Consequences:** AC-11 ticked (17 of 18 ACs); F5 ✔️ in software-factory.md. 402 still waits on AC-16 (T063, backlog).

## D-023 — Build first, test at the end: no per-task tests; constitution 2.0.0 (2026-10-09)

_D-021 and D-022 are taken on `feat/403-live-dashboard` (not yet on `main`)._

**Context:** The maintainer: too much of each step went to unit, e2e and self-test work and too little to the
product. Every task was test-first, and the factory ran e2e, the self-test or MCP whenever a task touched UI, the
engine or Electron. 403 (a dashboard for the factory itself) was taking the loop's time instead of product features.
**Decision:** Constitution II redefined (2.0.0): a code task is done when its code works and `npm run check` stays
green (typecheck, lint, existing unit tests). No test-first and no new tests per task; no e2e, self-test or MCP run
per task. A feature's tests go in a **Tests** section after its code tasks; the full Definition of Done still runs
once at Verify. `gates.mjs` gives code `check` (+ `build` / `licenses` when touched) and runs `selftest`, `mcp` or an
`e2e:<area>` only when that test itself changes. The reviewer no longer rejects a code task for missing tests. 403
is paused (branch kept; its T021 work in a stash) so the loop works on product features.
**Alternatives:** typecheck and lint only, no reviewer (too little safety for unattended runs); keep unit tests per
task and drop only e2e / self-test (still too slow, by the maintainer's call).
**Consequences:** Faster tasks; regressions in UI, rendering or Electron show up at a feature's Tests / Verify
instead of per task. Features already planned test-first (202, 403) keep their task text; implementers follow the
new rule for new work. Changed: `constitution.md`, `workflow.md`, `testing-strategy.md`, `software-factory.md`, the
tasks template, `/spec-tasks`, `/spec-implement`, the implementer and reviewer agents, `gates.mjs` (+ tests).

## D-024 — Software factory removed; back to the plain spec-driven workflow (2026-10-09)

**Context:** The maintainer wants the spec-driven workflow only, without the software factory (402, 403).
**Decision:** Remove the factory from the repo: `scripts/factory/`, `.claude/agents/`, `.claude/hooks/`,
`.claude/settings.json`, `/factory`, `/release`, `/spec-batch`, the `factory:*` and `release:prepare` scripts,
`specs/software-factory.md` and `specs/features/402-software-factory/`. `CLAUDE.md`, the `/spec-*` commands and the
engineering docs in `specs/` go back to their state before 402 (`689f3d2`), keeping D-007 (`452fec2`); the roadmap
keeps 201, 202 and 401 but drops the Needs column. The branches `feat/402-software-factory` and
`feat/403-live-dashboard` and the factory stashes are deleted.
**Supersedes:** D-011–D-016, D-018 and D-023 (the constitution is test-first again, without principle XII).
**Consequences:** `/spec-*` commands run inline in the session; no unattended loop, dashboard or gate records. 202
continues with `/spec-implement`. Entries above about the factory are history only.

## D-025 — Tracking data is JSON; the Markdown keeps the prose (2026-10-09, 404)

**Context:** Statuses, ticks and task ↔ criterion links lived only in Markdown (roadmap tables, checkboxes, AC coverage
tables), so nothing could read or update them reliably; the maintainer asked for a JSON structure at the top of
`specs/` and per spec, to link and track with, and for a dashboard on it.
**Decision:** `specs/roadmap.json` and `specs/features/NNN-*/feature.json` (schemas in `specs/schema/`, collections as
`{ order, byId }`, links stored once) are the source of truth for tracking. `roadmap.md` is generated; checkboxes and
Status lines in `spec.md` / `tasks.md` are written from the JSON (`npm run specs:sync`); `npm run specs:check` in
`npm run check` fails on any disagreement. Changes go through `npm run specs -- new | import | status | done`. Tools in
`tools/specs-index/` and `tools/roadmap-dashboard/`, no dependencies (own small JSON Schema validator).
**Alternatives:** JSON generated from Markdown (a cache nobody can edit); JSON only, no checkboxes in Markdown (too big
a change to every document and command); one `specs/index.json` (merge conflicts, one big file).
**Consequences:** never tick a box or edit `roadmap.md` by hand. The `/spec-*` commands and `workflow.md` say which
command to run. Old tasks have no commits recorded (none could be linked reliably).

## D-026 — Features are written as JSON; their Markdown is generated (2026-10-09, 404)

**Context:** With D-025 the Markdown was the source of the prose and the JSON of the tracking, joined by `import` and
`sync`; the maintainer found that loop too long and asked for one JSON object per spec holding spec, plan and tasks,
written as the spec is created, planned and broken into tasks, plus a kanban board of tasks and a React + TypeScript
dashboard in the Chitthi look.
**Decision:** `feature.json` schema 2 holds the whole feature (`spec`, `plan`, `tasks`; prose as Markdown strings,
everything tools read as data; layout as a `sections` list). `spec.md`, `plan.md`, `tasks.md` and `roadmap.md` are
generated and never edited: the CLI regenerates after each change, a Claude Code hook (`.claude/settings.json`) refuses
edits to them and regenerates after JSON edits, and `npm run roadmap` regenerates after hand edits. Tasks get a
`status` (`todo`, `in-progress`, `blocked` with a reason, `done`). The dashboard is a React + TypeScript app in
`tools/roadmap-dashboard/app/` (the repo's React, Vite, TypeScript; no new package) whose board moves tasks through the
same library as the CLI. `import` is removed. Supersedes D-025's split of sources.
**Alternatives:** Markdown first with an automatic import (two sources kept in step by automation); one big
`specs/index.json`.
**Consequences:** the six existing features were migrated (word check: nothing lost); raw generated Markdown has long
lines; the `/spec-*` commands write JSON. The roadmap's current phase is named in `roadmap.json` (`currentPhase`).

## D-027 — 203 and 204: every proposed answer accepted; 204 before 203 (2026-10-09)

**Context:** the Draft specs `203-compositing-pip` (14 questions) and `204-decoder-pool` (10) proposed an answer to
each open question.
**Decision:** the maintainer accepted all 24 as proposed and approved both specs. Notably: the pool serves preview
and export (204 Q1); visible videos at once = the largest smooth count measured, minus one, capped at 3 web / 6
desktop, never below 2 (204 Q2, 203 Q6); frames held under 256 MB web / 1 GB desktop (204 Q3); layers stay above
every track (203 Q1); one transform (position, size, rotation, opacity, corner radius) on every picture track (203
Q2, Q3); overlay tracks never magnetic (203 Q8); document stays version 1 (203 Q11); no agent tools until `212`.
**Alternatives:** answering per question; building 203 first with a guessed limit.
**Consequences:** 204 is planned and built first; 203's plan waits for 204's measurements (its limits).

## D-028 — 204's plan: one decoder pool for preview and export (2026-10-09)

**Context:** 204's plan (`specs/features/204-decoder-pool`) left five choices to the maintainer.
**Decision:** accepted as recommended. D1: preview sound from audio-only `<audio>` elements for the clip under the
playhead and the next one (not a `<video>` per clip all session). D2: frame bytes counted as width × height × 4. D3: a
paused preview shows the frame on the project's frame grid, the export's frame. D4: picture–sound sync (AC-8)
measured in the self-test through `captureStream()` and an analyser, confirmed by hand in Chrome. D5: the export
decodes full-size frames through the pool unless the spike shows it slower, then resized as today.
**Alternatives:** a muted `<video>` per clip for sound; NV12-sized budgets; a manual-only sync check.
**Consequences:** the pool is the only picture decoder in the editor (the `<video>` path stays for fallback clips).
## D-029 — 405's plan: the roadmap as a road, built from data 404 already records (2026-10-10)

**Context:** the maintainer found the roadmap dashboard "stagnent and boring" and asked for a scrollable road with
animations and the current task progress highlighted (405).
**Decision:** the road is drawn in SVG over a plain list of stops (facts stay in the DOM; the road is decoration),
with CSS, the Web Animations API and `IntersectionObserver` for motion and no library. Everything comes from
`feature.json` through `tools/specs-index` `progress()` (sections, running, blocked, finished tasks, statuses; API 3).
D1: release milestones from an optional phase `release` field in `roadmap.json`, without bumping its `schema` (additive,
every file stays valid). D2: the browser checks are a committed on-demand script (`npm run test:roadmap`), not in
`npm run check` or CI. D3: the hero is the current stop opening in place on the road. D4: filters dim stops on the road;
the separate Results list goes.
**Alternatives:** an AI-rendered scroll film (`/scroll-world`; stale at every ticked task, paid per render); a motion
library; bumping the roadmap schema to 2; a fixed hero panel at the top.
**Consequences:** an open old page asks for a restart (API 3); 404's Results view is replaced by dimming.

## D-030 — Independent tasks run as parallel agent batches (2026-10-10)

**Context:** the maintainer asked for more agents working in parallel to finish tasks faster, within the current
spec-driven workflow (and after D-024 removed the heavier software factory).
**Decision:** the main session orchestrates batches of up to 3 `implementer` agents (`.claude/agents/implementer.md`),
each in its own git worktree with `node_modules` linked as a junction, plus a `reviewer` agent per result
(`.claude/agents/reviewer.md`). Batches are tasks that are independent (`[P]`, no shared files); dependent, manual and
tracking work stays inline. Only the orchestrator edits `feature.json`, `memory/` and the feature branch
(cherry-picks), and runs heavy checks one at a time; it reports at the end of each batch. Recorded as a workflow
section, not a feature spec (maintainer's choice). Answers: parallel [P] tasks + reviewer, up to 3, light record,
pause only at batch ends.
**Alternatives:** implementers only (no reviewer); test-writer + implementer roles per task; whole features in
parallel; a headless runner script (the D-024 factory).
**Consequences:** more tokens per task; merge work for the orchestrator; heavy suites stay serial. Custom agent types
load with a new session; until then the orchestrator starts general-purpose agents with the definition's text.

## D-031 — 203's plan: a stack of picture tracks with a per-clip transform (2026-10-11)

**Context:** 203's plan (`specs/features/203-compositing-pip`) left three choices to the maintainer, and Q6's desktop
limit waited on 204's measurements.
**Decision:** accepted as recommended. D1: a clip's box has the frame's aspect ratio; the clip's own framing (fill or
whole picture) decides what shows inside, so identity is today's look. D2: an overlay clip's fade-in ramps its own
opacity; a main clip's fade-in still darkens the whole frame. D3: the videos-at-once limit counts video clips on every
picture track, hidden ones included; photos don't count. Q6: 3 videos at once on the web, 5 on the desktop app (204).
**Alternatives:** a box with the clip's own aspect ratio; fade overlays from black; count only shown tracks.
**Consequences:** projects without transforms draw exactly as before (AC-10 by construction); a 16:9 clip in a corner
of a 9:16 Reel shows cropped until set to "whole picture".

## D-032 — One edge rule for which clip a time shows (2026-10-11)

**Context:** 203 T013's review found that `videoAt` (paused preview) decided coverage exactly while the export's
`framePlan` (via `frameRange`) put a frame lying a floating-point hair before a cut into the later clip; starts summed by
`pack()` sit ~1e-13 s off the grid, so 201 / 202 preview and export disagreed on a few frames (tinyClips 1, clips500 42
at 30 fps).
**Decision:** `EDGE_EPS` = 1e-9 s in `engine/timeline.ts`, used by `videoAt`, `frameStack` and `mostVideosAt`: a time
within EPS before a boundary belongs to the later clip, as the export already drew it.
**Alternatives:** keep the exact rule and make the export follow it (changes exported files); fps-dependent tolerance.
**Consequences:** preview and export agree on every frame; `local` can be about −1e-13 at such frames (already so in the
export; fades and motion clamp it).


## D-033 — Heavy tests run once per phase, before its release (2026-10-12)

**Context:** e2e runs, the Electron self-test, MCP and timing runs after each task took much of each session, and
writing e2e / self-test checks per task slowed product work (maintainer, 2026-10-12).
**Decision:** while a phase is being built, tasks write and run **unit tests only** (`npm run check`; `npm run build`
when a feature is finished). E2e tests, self-test checks, timing runs and manual checks are **written and run at the
end of the phase**, in its test-pass feature (`x90`: `290` for Phase 2), then every Definition-of-Done gate runs and
the phase is released: every phase ends in a release. A feature lists the checks it defers in `x90`; the ACs they
prove are ticked there. Tasks run one at a time in the main session (D-030's agent batches off by default).
Constitution 2.0.0 (II and the Definition of Done), `workflow.md` Stages 3–5, `/spec-tasks`, `/spec-implement`,
`/spec-verify`, CLAUDE.md. 203: T035, T051, T053, T060 moved to 290; T052 / T054 proven by unit tests.
**Alternatives:** keep per-task area e2e (D-007 as it was); write heavy checks with the code but run them at phase end
(still costs the writing time during the phase).
**Consequences:** faster feature work; regressions in UI, rendering or the desktop app surface later, at the test
pass, so it can be longer and may send fixes back into finished features. Features reach `Implemented` with some ACs
still open (listed in `x90`).

## D-034 — 205's plan: one keyframe evaluation, keys relative to their item (2026-10-12)

**Context:** 205 (keyframes) plan review; spec Q1–Q8 accepted the same day.
**Decision:** keyframes live on their clip or layer (`keys`, times from its start) and one pure module
(`engine/keyframes.ts`) evaluates them for the preview, the export, the stage and the inspector; only start-edge edits
shift them; the store routes edits of animated values into keyframes at the playhead (auto-key). D1: the timeline lane
is one row of diamonds under the selection, expandable per value; D2: K toggles keyframes at the playhead, Alt + [ / ]
jump between them; D3: the diamond's shape shows its easing. The audio risk is handled by a unit-tested pure gain curve
(no self-test spike during the phase, D-033).
**Alternatives:** keys in source time (a slip would move animations); one lane row per value always; buttons only.
**Consequences:** projects without keys take today's code paths; 205's UI and sound are checked in 290.

## D-035 — 206's transitions draw with the 2D canvas, not shaders (2026-10-13)

**Context:** 206 (transitions, P2.6) spec review; the roadmap item said "as shaders", but the video preview and
export draw with the 2D canvas (203, 205).
**Decision:** all twelve proposed answers accepted. Five kinds (Cross-dissolve, Dip to black or white, Wipe and Slide
in four directions, Zoom), centred on the cut using the clips' handles (the project's length never changes), 0.5 s by
default (0.1–3 s), on every picture track, sound always blended, both videos count towards videos at once, removed
when an edit separates the clips. Q4: drawn with the 2D canvas, which does all five exactly and identically in the
preview, the export and every browser; they move to shaders when the video drawing moves to the GPU. The roadmap item
is renamed "Transitions between clips".
**Alternatives:** shaders now (needs the whole video drawing on the GPU first); overlapping clips (shortens the video
and moves later timings).
**Consequences:** no GPU work in 206; P2.6's `gpu/nodes/transition.ts` in editor-implementation.md waits for the GPU
video pipeline.

## D-036 — 206's plan: transitions on the outgoing clip, one tidy rule (2026-10-13)

**Context:** 206 (transitions) plan review; spec Q1–Q12 accepted the same day (D-035).
**Decision:** `frameStack` returns both clips while a transition plays, so the preview, the export, the preview sound
and the decoder pool follow from it; drawing is `transitionOps` (data) on the 2D canvas; sound blends through one
`edgeGain` in 205's gain curve. D1: a transition lives on the outgoing clip and names the clip it leads into (`to`);
`tidyTransitions`, run in the store's `change()` and in `mergeProject`, drops it when that pair no longer touches and
clamps it to its room, so edits stay unaware of transitions. D2: every cut is a focusable timeline button; Enter opens
the Transitions panel for it. D3: Zoom grows the outgoing clip 1× → 1.3× while it dissolves into the next.
**Alternatives:** a transition without `to` (stays on the clip's end after a reorder); a project-level list of cuts;
no cut targets; a zoom through.
**Consequences:** the first task is a spike proving the pool decodes past a clip's out point; 206's UI, golden frames,
sound and timing are checked in 290.

## D-037 — 407: coding standards, a tests folder, lint enforcement (2026-10-13)

**Context:** the maintainer asked for tests outside `src/`, written coding standards, SOLID, JSDoc and no one-letter
names, before 207. Baseline: 34 % one-letter names, 333 of 880 exports without JSDoc, 103 functions over 80 lines,
27 React-rule findings, 379 type assertions and 177 non-null assertions.
**Decision:** spec Q1–Q13 accepted as proposed. Tests move to `tests/{unit,integration,support,e2e,selftest}`
(imported through an `@/` alias, D1); `specs/coding-standards.md`; ESLint enforces names (`id-length`, exceptions `_`,
`x`, `y`; properties exempt so saved formats don't change), JSDoc on exports, function length (80; 250 in `.tsx`),
cognitive complexity 15 (`eslint-plugin-sonarjs`), React's `recommended-latest` rules, typescript-eslint
`strictTypeChecked` and the layers' import direction; no hard file-length limit (a warning at 800). Rules land as
warnings and become errors folder by folder. `noImplicitReturns` / `noImplicitOverride` now,
`noUncheckedIndexedAccess` by the end. The React Compiler last, through the Vite plugin's `oxc-transform-react` (D3),
kept only without regressions. No barrel re-exports after splits (D2).
**Licence:** `eslint-plugin-sonarjs` (LGPL-3.0-only) approved as a development-only lint tool: never shipped, never
bundled, unmodified, so LGPL's distribution terms don't arise; recorded in `specs/licensing.md`.
**Alternatives:** a 500-line file limit (rejected: length is a proxy); ESLint's cyclomatic `complexity` only; the Babel
route for the compiler; tests left beside the code (they never reached the build, but mixed code and tests).
**Consequences:** ~3–5 days of behaviour-neutral clean-up before 207; the full test suite runs inside 407 (Q9).

## D-038 — The coding standards join the Definition of Done (2026-10-14)

**Context:** 407 T020 wrote `specs/coding-standards.md` (AC-4); the spec asks the Definition of Done to point to it.
**Decision:** constitution 2.0.0 → 2.1.0 (MINOR: a gate added). Definition of Done item 11: the code follows
`specs/coding-standards.md`; what lint enforces passes in `npm run check`, the rest is checked in review. It is part
of **Implemented** (not deferred to a phase's test pass). While 407 runs, the new lint rules are warnings outside its
finished folders, so item 11 is judged on review there.
**Consequences:** every feature from 407 on (207 first) is written to the standards from its first line.

## D-039 — `npm run lint` uses ESLint's cache; `lint:full` doesn't (2026-10-14)

**Context:** 407 T023 added typescript-eslint's type-aware presets: `eslint .` went from 13.7 s to 40.3 s. The plan's
mitigation was ESLint's cache, or the type-aware rules on changed files only.
**Decision:** `npm run lint` (so `npm run check`) runs `eslint . --cache --cache-strategy content` (cache in
`node_modules/.cache/eslint/`): 3.4 s warm, 5.5 s after one file changes. `npm run lint:full` runs without it, in CI
(`ci.yml`) and at a feature's close. All rules stay in one config, so there is one lint, not a fast and a slow split.
**Trade-off:** ESLint caches per file, so a type-aware finding in a file whose imports changed can be stale until that
file changes or a full run. Acceptable: CI and the close run in full.

## D-040 — Two strict type-aware rules take their usual options (2026-10-14)

**Context:** 407 T030, the first clean-up. Of `strictTypeChecked`'s findings in `src/`, 576 were
`restrict-template-expressions` on numbers in template strings and 850 `no-confusing-void-expression` on one-line arrow
handlers (`onClick={() => setOpen(false)}`): safe code, and changing it would be churn.
**Decision:** `restrict-template-expressions` with `allowNumber: true` (objects, `null`, `undefined` and unions with
them are still reported) and `no-confusing-void-expression` with `ignoreArrowShorthand: true`. Together 1,426 → 27.
The presets stay whole (AC-13); only these options change.

## D-041 — The print renderer is one named chunk (2026-10-14)

**Context:** 407 T033 split `engine/render.ts` (1,442 lines) into nine modules. Lazy screens that only need `calMonth`
now import `calendarDraw.ts`, so Rolldown kept that in a shared chunk and folded the rest of the renderer into the
entry chunk: entry 327 → 347 KB (budget 350; 407 keeps it at 327). What loads at start-up was the same: the old
`render` chunk was already a static import of the entry (`export.ts`, `state/actions.ts`).
**Decision:** `vite.config.ts` names one chunk, `render`, for the renderer's modules (`PRINT_RENDERER`: `render`,
`themeBackground`, `printText`, `photoSlots`, `postalDecor`, `frontText`, `cardFront`, `cardBack`, `calendarDraw`,
`patterns`), with `includeDependenciesRecursively: false` so `design.ts`, `layout.ts` and the rest stay where they
were. The entry chunk holds the same modules as before (327 KB); `data/holidays.ts` became a small chunk of its own.
**Consequences:** a new module of the print renderer is added to `PRINT_RENDERER`, or it may land in the entry chunk.

## D-042 — The print-file builders load on export (2026-10-14)

**Context:** 407 T035 left the entry chunk at 329 KB (AC-9: ≤ 327 KB): the readable `export.ts` and `analyze.ts`
reach the entry through `state/`. Options: relax AC-9, lazy-load, a named chunk that still loads at start, or trim.
**Decision (maintainer):** lazy-load. `engine/printPages.ts` holds what the studio shows before building (`pagesOf`,
`nup`, `SHEETS`, `exportSummary`, `baseName`); `engine/export.ts` keeps the builders (PDF, PNG, envelope, pack, spec)
and `state/actions.ts` loads it with `import()` on the first export, as it already did for `quote.ts`.
**Consequences:** entry 329 → 317 KB; `export` is a 10.9 KB chunk. Code that only needs pages or the imposition imports
`printPages.ts`, never `export.ts`, or the builders return to the entry chunk.

## D-043 — Print layouts are a table of builders; GPU backends are classes (2026-10-14)

**Context:** 407 T036. `computeLayout` was one 626-line switch (cognitive complexity 193); `openWebGL2` and
`openWebGPU` each built their device as one 200+ line object literal of closures (over the 80-line limit).
**Decision:** `layout.ts` maps every `LayoutId` to a builder (`BUILDERS: Record<LayoutId, LayoutBuilder>`) in
`postcardLayouts.ts` / `printLayouts.ts`, sharing a `LayoutContext` (`layoutParts.ts`); TypeScript asks for a builder
for every new id. The backends are classes implementing `GpuDevice` (`WebGL2Device`, `WebGPUDevice`), made by the
same `open…()` functions. No caller detaches a device method (checked), so `this` is safe.
**Consequences:** a new layout is a builder plus a table entry, not a new `case`; device methods must be called on the
device (`device.read(t)`), never passed around unbound.

## D-044 — data/ holds data only; stored records are checked when read (2026-10-15)

**Context:** 407 T042. Three files in `src/data/` broke the layer rule (data imports nothing of the app but
`types.ts`): `samples.ts` loaded photos (engine/photo, lib/credits), `presets.ts` held logic over `Adjustments`
(engine/adjust), `instagram.ts` took `PhotoType` from engine/photoExport. The IndexedDB code in `lib/db.ts`,
`lib/userFonts.ts` and `lib/userLuts.ts` returned `any` from the store as typed records.
**Decision:** the sample loader moves to `state/samples.ts` (`sampleCredits`, `buildSample`; `data/samples.ts` keeps
the definitions and `SAMPLE_BASE_URL`); the built-in presets and `presetApplied` join `engine/presets.ts`
(`ColourPreset`); `PhotoType` moves to `src/types.ts`. Built-in tables that are never empty are typed as non-empty
tuples (`readonly [T, ...T[]]`), so `TABLE[0]` is the fallback without `firstOf` (data may not import engine). One
IndexedDB helper, `lib/idb.ts`, returns `unknown`; each reader keeps the records that have the fields it relies on
(shallow guards), and designs and presets still go through `mergeDesign()` / `mergePreset()`.
**Consequences:** a malformed stored record (or Pexels result) is skipped instead of reaching the UI; the desktop
bridge's `presetAll()` is typed `unknown[]`. The public library entry (`src/index.ts`) exports `buildSample` /
`sampleCredits` from `state/samples`.

## D-045 — Agent tools split by job and may return directly; AI answers read through guards (2026-10-15)

**Context:** 407 T043. `agent/tools.ts` (581 lines) and `agent/photoTools.ts` (722) held every tool; 28 handlers were
`async` with nothing to await. Provider answers, stored AI settings and keys were cast to their expected shapes.
**Decision:** `tools.ts` is the registry over one file per job (catalogue, design, card photos, AI, output, gallery;
the photo studio's batch and colour, masks, presets and LUTs), with `designSummary.ts`, `photoStudioInfo.ts` and
`photoEdits.ts` for what they share; the order agents see is unchanged. `AgentTool.run` and `AgentResource.read`
return a result or a promise (every caller awaits, so a throw rejects the call either way). Arguments outside a
schema's `enum` (product, orientation, calendar words and marks) are refused with a `ToolError` instead of being
stored. Provider JSON goes through `ai/providers/read.ts` (`fieldOf`, `textField`, `listField`); stored settings
through `mergeAiSettings()` (the chosen provider is a `string`, so a removed provider still gets its message); keys
and `ai-hosts.json` rules are checked when read.
**Consequences:** a new tool goes into the file for its job and is listed in `tools.ts`; MCP schemas, names and order
are byte-identical (checked by snapshot). Malformed answers (an object where text belongs) give '' instead of
"[object Object]", and inputs that crashed with a TypeError now give the handled message.

## D-046 — React Compiler stays off (2026-10-16)

**Context:** 407 T071 (Q11, plan §6, D3). Wired through `@vitejs/plugin-react` 6.1's `compiler` option with
`oxc-transform-react` 0.152 (the plugin's peer range; its native compiler is marked experimental). Diagnostics: 37
functions skipped (dynamic `import()`, `try`/`finally`, `??=`, one rule suppression). e2e failed 3 AI-mask tests until
two external-store hooks were fixed (they read a module Map during render; learnings). Compiled components grow ~40 %:
whole app, entry 313 → 337 KB (AC-9 allows 327); only the lazy media-studio folders (`sources`), entry 314 KB but the
studio chunk 201 → 281 kB.
**Decision:** the maintainer chose to keep it off: Q11's own rule (kept only without regression). `oxc-transform-react`
is not added; the manual `useMemo` / `useCallback` / `memo` stay; the two hook fixes are kept (correct without it).
**Consequences:** AC-12 (the Rules of React lint) still applies, so turning it on later is a config change. Look again
when the native compiler is stable or its output smaller.

## D-047 — `!` allowed on measured hot-loop reads; the look path's order-dependent cost accepted (2026-10-16)

**Context:** 407 T072 (AC-10). `noUncheckedIndexedAccess` (T070) put `?? 0` on every typed-array read; in the blur's
two passes (`engine/detail.ts`) that made clarity 17 % and sharpen 34 % slower in the Electron renderer (V8 15.2;
Node's V8 13.6 barely shows it). `=== undefined` checks there were worse (+55 %). Separately, the Canvas 2D colour
chain with a look is 13–22 % slower than before 407 when a photo is processed without a look first (V8's inlining
budget, after T035's split); seven restructurings didn't fix that order without losing elsewhere.
**Decision:** the maintainer allowed `!` on the 9 blur reads, inside an `eslint-disable` block with the reason and
numbers; `specs/coding-standards.md` §8 says when (`=== undefined` on object arrays, `?? 0` by default on typed arrays,
`!` only where measured). The look path stays as T035 left it, recorded in `performance.md` and the spec's Changelog
as the one exception to AC-10's "no timing check gets slower".
**Consequences:** `no-non-null-assertion` stays an error everywhere else. The look path affects only the fallback
without WebGPU.

## D-048 — Tests follow the standards; two Sonar rules off for tests/ (2026-10-16)

**Context:** 407 T091 left 1,894 standards warnings in `tests/` (outside AC-5). The maintainer asked for them fixed
(T062).
**Decision:** `tests/**` joins `FINISHED`: names, JSDoc, no `!` (`tests/support/defined.ts` throws with what was
missing), seeded randoms (`tests/support/seededRandom.ts`), explicit sort orders. Off for `tests/` in
`eslint.config.js`, with the reason there: `sonarjs/no-floating-point-equality` (tests compare exact pass-through
values on purpose) and, for `tests/e2e/`, `sonarjs/no-skipped-tests` (Playwright skips per project, desktop or phone).
**Consequences:** new test code must pass the same rules as app code; a test that samples at random uses a seed.

## D-049 — Speed (207): plan decisions D1–D5 (2026-10-18)

**Context:** 207's plan left five calls to the maintainer; all were accepted as recommended on 2026-10-18 (Q8: same
pitch, chosen the same day).
**Decision:** D1 a freeze frame is a video clip with `freeze` (source time) and `dur`, not a new clip kind. D2 trimming
or splitting a ramped clip cuts the curve (kept source moments keep their speed). D3 AC-10 reworded: the export draws
only the frames it shows and jumps to the next key frame rather than decoding through. D4 reversed preview lanes decode
at stage size in backward chunks within the byte budget. D5 preview sound keeps pitch with the browser's
`preservesPitch`, the export with our own WSOLA (`engine/timeStretch.ts`): close, not sample-identical.
**Consequences:** one `sourceAt` replaces every `clip.in + local`; no new dependency; a speed that would make a clip
shorter than 0.1 s is refused (AC-2).

## D-050 — A ramp keeps its curve over a fixed source span; trims and splits don't cut it (2026-10-18)

**Context:** 207 T043. D2 (D-049) cut a ramp at a trimmed or split edge (`cutRamp`: points kept at their source
moments, the edge speed added as a point). The monotone spline re-fitted through fewer points changes what plays
between them: on a 4 s part a split changed the parts' length by up to 589 ms on Bullet (32 %), 155 ms Montage, 128 ms
Hero; filling the cut with sampled points still left 130 ms.
**Decision:** the maintainer chose a fixed span: a ramp's shares refer to `rampSpan: [from, to]` (source seconds; missing
= in–out, so a new ramp needs none). The play time is measured along that one curve (held flat past its ends), and
trims and splits only move in and out along it, setting `rampSpan` when it first differs from in–out. `cutRamp` is
dropped.
**Consequences:** every kept frame of a trimmed or split ramp plays exactly as before (within 1 µs) and trimming back
out restores the clip. A clip can carry ramp points outside in–out: the ramp editor (T081) shows the part inside, and
the gate (T060) must read `rampSpan` (finite, from < to) and drop it with the ramp when malformed; saving writes it only
when present.

## D-051 — A freeze frame holds the clip's keyframed values at the cut (2026-10-18)

**Context:** 207 T044. Plan §4 gave a freeze frame the clip's keyframes "scaled to its length", which would replay the
clip's whole box animation over the still and jump at both cuts; Q4 wants the freeze to match the frames around it.
**Decision:** the maintainer chose to hold: the freeze gets one key per animated value, holding its value at the cut
(as `splitKeys` gives a split's parts), and its stored box is that value.
**Consequences:** nothing jumps at either cut; the user can still add keys to the freeze afterwards.
