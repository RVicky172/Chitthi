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
