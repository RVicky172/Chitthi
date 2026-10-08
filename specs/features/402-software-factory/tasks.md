# 402 — Software factory: agents run the spec-driven line, people decide · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. 👤 = a person does it. Each task lists files and the
proving test. Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.
Tooling only: no task touches `src/`, `electron/` or `public/`. New files are LF; existing files are edited with the
Edit tool (learnings: line endings, heredocs). Format only new files with Prettier.
P4: the orchestrator is built by T053; from then on the tasks marked **(loop)** are run by `/factory 402`
(AC-11), not by hand.

## Setup: spikes

- [x] **T001** — Spike (plan Risks, P1): in a scratch folder, one `claude -p` run with `--agent` (a throwaway
      agent), `--output-format stream-json --verbose`, `--json-schema` and `--max-budget-usd 0.20`: record whether a
      hidden `--max-turns` works, how assistant turns and `total_cost_usd` appear in the stream, whether the
      structured output arrives, and whether a project `PreToolUse` hook (one that refuses `echo hi`) fires in `-p`
      mode. Throwaway. · files: scratch only · test: findings recorded here; if hooks don't fire in `-p`, stop and
      propose a change to §3 / §5
  - **Result (2026-10-08):** scratch git repo in the session scratchpad, Claude Code 2.1.294, 8 runs, about US$0.50
    in all. (1) **Project hooks fire in `-p` mode**: the `PreToolUse` hook saw both Bash calls, refused `echo hi`
    (exit 2), and the agent was told the hook's reason and carried on with `echo bye`. §3 holds inside the loop.
    (2) `--agent <name>` loads `.claude/agents/<name>.md` and its `tools:` list. (3) **`--max-turns` works though
    `--help` doesn't list it**: with 2, the run ends `subtype: error_max_turns`, `terminal_reason: max_turns`, exit
    1. So §5 uses the flag; counting turns in the stream isn't needed. (4) The stream-json result event (and
    `--output-format json`) has `num_turns`, `total_cost_usd`, `is_error`, `subtype`, `permission_denials`,
    `errors`; a spent budget is `subtype: error_max_budget_usd`, `terminal_reason: budget_exhausted`. (5)
    **`--json-schema` returns `structured_output` only if the agent's `tools:` includes `StructuredOutput`** (or the
    agent has no `tools:` list). With `tools: Bash, Read` it was silently missing; with `tools: Read,
    StructuredOutput` it arrived. The reviewer agent must list it (T040). (6) Cost: one tiny call is ~$0.02 with a
    small agent and ~$0.09–0.19 with the full default prompt (first-call cache writes); a US$0.10 budget can run out
    before the first answer, so the run's per-call minimum is $0.50. (7) `claude -p` waits 3 s for stdin and prints a
    warning into the output unless stdin is closed: spawn with stdin `'ignore'`. Plan §5 and Techniques updated.
- [x] **T002** [P] — Spike (plan Risks, P1): `git worktree add ../Chitthi-wt/spike` with `node_modules` as a junction
      (`mklink /J`) to the main checkout's; in the worktree run `npm run check`, `npx playwright test
      e2e/docs.e2e.ts --project=desktop` and `npm test`; record times and any failure; remove the worktree and the
      junction. · files: scratch only · test: findings recorded; fallback (`npm ci`) timed if the junction fails
  - **Result (2026-10-08):** worktree `../Chitthi-wt/spike` at `10d946f`, `node_modules` a junction
    (`mklink /J`, no admin rights needed) to the main checkout's. Everything works through it: `npm run check` 990
    passed, lint 0 errors / 5 known warnings (8 s); docs e2e 2 passed (16 s incl. the production build); self-test
    6,124 / 0 (112 s). No `npm ci` needed, so the fallback wasn't timed. **Removal order matters:** the junction is
    removed first with `rmdir` (removes only the link), then `git worktree remove --force` (the worktree has
    untracked `dist/`, `test-results/`), then the branch. Main `node_modules` checked intact afterwards. T061 does
    the same, in that order.

## F1 — Backlog (§1)

- [x] **T010** — Fixtures: copy today's `specs/roadmap.md`, every `specs/features/*/spec.md` and `tasks.md`,
      `memory/progress.md`, `memory/decisions.md`, `memory/MEMORY.md` into `scripts/factory/fixtures/` (frozen; a
      README says so). · files: `scripts/factory/fixtures/**` · test: none (data)
  - **Result (2026-10-08):** `scripts/factory/fixtures/`: the roadmap, the six feature folders (000, 001, 201,
    202, 401, 402: `spec.md`, `tasks.md`, a one-line stub `plan.md`, since only its presence matters), and
    `memory/` (progress, decisions, MEMORY, learnings); 281 KB. `README.md` says they're frozen.
- [x] **T011** — Failing tests for the readers: roadmap rows and phases; `needs` (none yet → `[]`, a range
      `203–211` expands); tasks (done, 👤, `[P]`, Status note, Result notes not swallowed into the text, `area:` and
      `deps:` tags); spec status, AC counts, `[NEEDS CLARIFICATION]` count; progress and decisions; and
      `nextFor`: 202 → next T030, stopped [T001], human []; 001 → next none, 11 human; 000/201/401 → Done; a
      feature whose `needs` aren't Done → `ready: false`; a task with open `deps` → blocked (AC-1, AC-2). · files:
      `scripts/factory/state.test.mjs` · test: fails (no `state.mjs`)
  - **Result (2026-10-08):** 19 tests first (failed: module missing). One expectation corrected from the fixtures
    before running: 001 isn't "next none": its T040 (release changes) is an untagged agent task, so 001 → next
    T040, 11 👤, `paused: true` (roadmap ⏸️). Running them found a real bug the dashboard already had: 402's T050
    counted as 👤 because its description says "👤 task"; 👤 and `[P]` now count only before the dash (+1
    regression test).
- [x] **T012** — `scripts/factory/state.mjs`: move the readers out of `dashboard.mjs`, text in / data out, plus
      `needs`, tags and `nextFor`, until T011 passes. Dashboard rewired to it: its HTML for today's repo is
      identical before and after (diff of the two outputs, timestamp line excepted). · files:
      `scripts/factory/state.mjs`, `scripts/factory/dashboard.mjs` · test: T011; the HTML diff
  - **Result (2026-10-08):** `state.mjs`: `parseRoadmap` (cells, optional Needs), `expandIds` (ranges with – or
    -), `parseTasks` (notes kept out of the text, `area:` / `deps:` tags), `parseSpec`, `parseProgress`,
    `parseDecisions`, `parseMemory`, `stationOf`, `readFeatures`, `activeFeature`, `nextFor`, `readRepo`.
    Dashboard rewired: its HTML differs from before only by the T050 fix (402's T050 no longer under "Waiting on
    you", count 5 → 4). Break-test: `nextFor` ignoring Status notes fails the 202 test. Check 1,010.
- [x] **T013** — `scripts/factory/next.mjs` (+ `npm run factory:next`) printing T011's JSON; the **Needs** column in
      `specs/roadmap.md`, taken from the dependencies each work item lists in `vision/editor-implementation.md`
      (e.g. 212 ← 203–211; 4xx: none unless stated); tags documented in `specs/templates/tasks-template.md`. · files:
      `scripts/factory/next.mjs`, `package.json`, `specs/roadmap.md`, `specs/templates/tasks-template.md` · test:
      `npm run factory:next 202` prints next T030, stopped T001; `npm run factory:next 203` prints `ready: false`
      until 202 is Done; T011 still green on the real files (one extra test reads the live repo)
  - **Result (2026-10-08):** `next.mjs` + `npm run factory:next`: 202 → next T030, stopped [T001], 0 👤; 203 →
    `ready: false`, needs open [204]; unknown id → `{ error }`. **Needs column** in the Phase 2, Phase 3 and 400+
    tables. The vision doc lists no dependencies as such, so they are **inferred** from its text (to check): every
    P2 item ← 201 ("every Phase 2 feature needs clips on a track"); 203, 206 ← 204 (the decoder pool is "needed for
    overlapping clips and transitions"); 208 ← 205 (volume keyframes); 209 ← 208 (voice-over onto an audio track);
    212 ← 202, 203, 205, 206 (its tools cover tracks, edits, keyframes, transitions); 302, 304 ← 301; 309 ← 301,
    303, 305; the rest none. So 203 waits on 204 rather than 202. Template: `area:` / `deps:` tags, 👤
    position, Status notes. +1 live-repo test; check 1,011.

## F2 — Gates as code (§2)

- [x] **T020** — Failing tests: `chooseGates` on ≥ 12 path sets (engine only; a timeline component with and
      without an `area: ui:editors` tag; print studio component; `src/state/video.ts`; `electron/main.cjs`;
      `src/agent/tools.ts`; `package.json`; `vite.config.ts`; docs only; `scripts/` only; mixed), and
      `{ verify: true }` = the DoD list (AC-3). Output parsers on captured real outputs (Vitest, Playwright with a
      failure and a flaky, self-test, MCP, licences) saved as fixtures. · files: `scripts/factory/gates.test.mjs`,
      `scripts/factory/fixtures/gate-output/*` · test: fails (no module)
  - **Result (2026-10-08):** real outputs captured into `fixtures/gate-output/`: `npm run check`, licences,
    MCP (documents path replaced by `<Documents>`), docs e2e, and a throwaway spec run with `--retries=1` that
    gave a real pass + fail + flaky (deleted after). The self-test pass lines are from T002's real run; the failing
    one follows `scripts/test.cjs`'s format (a real failure needs a broken check). 28 tests (17 path sets incl.
    test files, an e2e file, CSP, Windows paths; commands; every parser; `runGates` with a stubbed exec and a
    fixed clock), failed first (module missing).
- [x] **T021** — `scripts/factory/gates.mjs`: rules table, area map, parsers, `runGates` (spawns each command,
      timing, run file `.factory/runs/<ISO>-<NNN>-<Tnnn>.json`, exit 1 on a red gate), changed files from git, the
      gate lock call (stub until T060). `npm run factory:gates`. · files: `scripts/factory/gates.mjs`,
      `package.json` · test: T020; a stubbed-command test for the run file and exit code (AC-4)
  - **Result (2026-10-08):** `gates.mjs` + `npm run factory:gates` (`--verify`, `--feature`, `--task`,
    `--area`, `--dry`; feature from the branch name). All 28 green at once. Rules as in plan §2, with one
    narrowing: "components that render" → self-test isn't decidable from a path, so the self-test runs for
    `src/engine|data|agent|dev|ai/` (not test files) and components get their e2e area instead. A red `check`
    stops the run (later gates would repeat it). `ELECTRON_RUN_AS_NODE` is removed from the gates' environment.
    Lock: a `withLock` hook, a pass-through until T060. Break-test: `engine` dropped from the self-test rule →
    3 tests fail. Check 1,039.
- [x] **T022** — Dashboard: the **Gate runs** panel reads the real run files; one real `npm run factory:gates`
      on the current tree, seen on the dashboard within one refresh. · files: `scripts/factory/dashboard.mjs` ·
      test: manual, recorded (AC-4)
  - **Result (2026-10-08):** real run `npm run factory:gates -- --task T022` on this tree (58 changed files →
    check, licences): ✓ check 8 s "1039 tests passed, lint 0 errors / 5 warnings", ✓ licences "168 shipped
    packages, all allowed"; run file `2026-10-08T05-43-49Z-402-T022.json`, on the dashboard at the next render
    (`--serve` re-reads on every 10 s refresh). Panel improved: local time instead of UTC; a red gate's summary
    shown under the run (checked with a hand-written red run, removed after) since a tooltip can't be read on a
    phone; 1400 px light and 390 px dark: no console errors, no sideways scroll.

## F3 — Guardrails (§3)

- [x] **T030** — Failing tests: `editAllowed` (paths × branches `feat/402-*`, `feat/203-*` with no folder, a Draft
      spec, `main`, `fix/x`, a worktree gitdir) and `commandAllowed` on ≥ 15 commands, refused and allowed
      lookalikes: `sed -i`, `sed --in-place`, `sed -n`, `npx prettier --write src/x.ts`, `npx prettier --check src`,
      `git push`, `git push -f`, `git push --force-with-lease`, `git push origin +main`, `git tag v1`, `git tag -l`,
      `git reset --hard`, `git reset HEAD~1 --soft`, `git clean -fd`, `git restore .`, chained `npm run check &&
      git push --force`, PowerShell form (AC-5, AC-6). · files: `scripts/factory/rules.test.mjs` · test: fails
  - **Result (2026-10-08):** 47 tests first (failed: module missing): 12 edit cases (In Progress / Approved /
    Implemented / Draft / no folder; specs, docs, scripts; `main` and `fix/…` allowed per P3; Windows paths; a path
    outside the repo) and 35 commands, refused and allowed lookalikes, incl. chains, a pipe, a PowerShell
    `if ($?) { … }`, new lines, `npm run format` (it rewrites `src/`), and two that must **pass**: a commit message
    in quotes and one in a heredoc that mention the refused commands.
- [x] **T031** — `scripts/factory/rules.mjs` until T030 passes. · files: `scripts/factory/rules.mjs` · test: T030
  - **Result (2026-10-08):** `rules.mjs`: heredoc bodies dropped and quoted strings hidden before splitting on
    `;`, `&&`, `||`, `|` and new lines; each part checked from every `git` / `sed` / `prettier` / `npm` in it
    (so `{ git push --force }` is seen); git global options (`-C dir`) skipped. All green at once. Break-test:
    without the quote and heredoc handling, the two commit-message cases fail. The Stop hook's first run then
    caught a lint error here (`\u0000` placeholders: `no-control-regex`): now U+E000.
- [x] **T032** — Hook wrappers and registration: `.claude/hooks/pre-tool.mjs` (stdin JSON → rules → exit 2 with the
      reason; fails open with a log line, P2; `CHITTHI_FACTORY_HOOKS=off`), `.claude/settings.json` (PreToolUse for
      `Edit|Write|MultiEdit|NotebookEdit` and `Bash|PowerShell`), `.gitignore` exceptions (Q5). Timing: 20 calls
      under 150 ms each. · files: `.claude/hooks/pre-tool.mjs`, `.claude/settings.json`, `.gitignore` · test: a
      wrapper test feeding hook JSON through a child process (refuse, allow, crash → allow + log); manual: a refused
      `git tag` and a refused `src/` edit on a Draft-spec branch in a live session, recorded (AC-5)
  - **Result (2026-10-08):** `.claude/hooks/pre-tool.mjs` (branch from `.git/HEAD` or a worktree's gitdir, spec
    status with one file read, exit 2 + reason, fails open with a log line, `CHITTHI_FACTORY_HOOKS=off`);
    `.claude/settings.json` (PreToolUse on Edit, Write, MultiEdit, NotebookEdit, Bash, PowerShell); `.gitignore`
    exceptions (`settings.local.json` stays ignored). `hooks.test.mjs`: 6 tests (refuse / allow, worktree branch,
    crash → allowed and logged, off, timing); break-test: exit 0 instead of 2 fails 2. Timing: median 38 ms, max
    51 ms over 20 calls. **Live in this session at once** (no restart): `git tag zz-hook-probe` refused with the
    reason; on a throwaway branch `feat/998-hook-probe` an Edit of `src/types.ts` refused ("no spec for 998");
    `src/` untouched, branch deleted, no hook errors logged.
- [x] **T033** — Stop hook `.claude/hooks/stop.mjs`: code-path filter, diff hash cache in `.factory/check-ok`,
      `npm run check`, `stop_hook_active`, second refusal ends the turn and writes a stopped loop state; registered
      in `settings.json`. · files: `.claude/hooks/stop.mjs`, `.claude/settings.json` · test: unit for the filter and
      the hash decision; manual: a session with a failing test can't end, a docs-only turn doesn't run the check,
      recorded (AC-7)
  - **Result (2026-10-08):** `.claude/hooks/stop.mjs` + `changedPaths` (porcelain: renames, quotes, untracked;
    +1 test) and `stopAction` / `afterCheck` (tested in T030). Code = what `chooseGates` sends to `check`; hash =
    `git diff HEAD` of it + untracked contents, kept in `.factory/check-ok`. On this tree: first run caught the
    lint error above (exit 2, 5 s); after the fix green in 8 s, then 0 s from the cache. **Live (AC-7)** in a
    throwaway worktree with `claude -p` (US$0.31): (B) a docs-only turn ran 6 s in all and left `check-ok`
    untouched, so no check ran; (A) a turn that wrote a failing test was blocked ("Stop hook feedback: npm run check
    fails…"); the agent, told to keep the file as given, stopped again, and the turn ended with the failure in
    `.factory/stop-hook.json`. The message and record now lead with the gate summary ("unit: 1 failed"), checked
    with a temporary failing test here (removed). Worktree removed junction first; main `node_modules` intact.
- [x] **T034** [P] — `.gitattributes`: `* text=auto` and the binary list; `git add --renormalize --dry-run .` (or
      `git status`) shows no change; AC-8's two edits on a scratch branch, deleted afterwards. · files:
      `.gitattributes` · test: manual, recorded (AC-8)
  - **Result (2026-10-08):** `.gitattributes` **already existed** (`*.onnx binary`, from P1.8) and was overwritten
    before being read; nothing was lost: its rule and comment are kept, `* text=auto` and 20 binary types added
    (webp, jpg, png, woff2, pdf, ico are in the repo today). Renormalising in a throwaway index changes no file
    beyond those already modified; no `i/crlf`. AC-8: `specs/lld.md` (CRLF on disk) written as LF and
    `.claude/commands/spec-implement.md` (LF) written as CRLF, staged in a throwaway index: no change against HEAD;
    both restored. Learnings' line-ending entry updated. Check 1,097.

## F4 — Specialist agents (§4)

- [x] **T040** — `.claude/agents/`: `spec-writer`, `planner`, `implementer`, `reviewer`, `verifier`, `scribe`,
      `licence-auditor` (frontmatter `name`, `description`, `tools`, `model`; bodies point at the repo's rules);
      `scripts/factory/verdict.schema.json`. · files: `.claude/agents/*.md`, `scripts/factory/verdict.schema.json` ·
      test: `claude agents` lists all seven with the tools of plan §4; the reviewer and licence auditor have no
      Edit / Write (AC-9)
  - **Result (2026-10-08):** `agents.test.mjs` first (9 failed: no files), then the seven agents (`model:
    inherit`; bodies point at the constitution, workflow, learnings and templates instead of copying them) and
    `verdict.schema.json` (`ok`, `reasons[{ rule, file?, line?, why }]`); 9 green. `claude agents` needs a TTY and
    `--json` lists running sessions, not definitions, so each agent was started once with `claude -p --agent X` and
    its tools read from the init event: exactly the frontmatter lists (reviewer: Read, Grep, Glob, Bash, PowerShell;
    `StructuredOutput` appears only with `--json-schema`, as T001 found). The implementer ends with `FACTORY: done`
    / `FACTORY-STOP: <kind>: <why>`. 7 runs ~US$0.75.
- [x] **T041** — The five `/spec-*` commands hand their work to the agents, names and arguments unchanged. ·
      files: `.claude/commands/spec-*.md` · test: one run of each on a scratch feature folder (deleted after),
      recorded (AC-9)
  - **Result (2026-10-08):** each command got a "Who does it" paragraph (steps kept as the agent's brief):
    spec-new → spec-writer; spec-plan, spec-tasks → planner; spec-implement → implementer then reviewer (one retry
    with the reviewer's reasons); spec-verify → verifier then scribe. Run once each, headless, on a throwaway feature
    `999-probe-greeting` (a greeting script) in a replica worktree (HEAD + this tree's diff + untracked files),
    removed after: /spec-new (spec-writer, 93 s, $0.56, 9 ACs, 4 Qs); /spec-plan (planner, 197 s, $0.96);
    /spec-tasks (planner, 115 s, $0.76, 13 tasks); /spec-implement T010–T011 (implementer, then implementer +
    reviewer: accepted; 21 tests, two break-tests caught; $0.89 + $0.84); /spec-verify (verifier + scribe, 311 s,
    $1.39: every gate run, spec left In Progress with 8 open tasks listed; `test:mcp` failed first because the
    worktree had no LibRaw, the verifier fetched it, re-ran and reported both). ~US$5.40 in all. **Three findings for
    the loop**, written into plan §5 / §6: (1) headless runs refuse every shell command not allowed (5 refusals; the
    implementer couldn't run its tests) → allow-list, D-014; (2) a "failing tests" task leaves `check` red and the
    Stop hook (correctly) blocks the turn → tests task + implementation run as one pair; (3) worktrees lack ignored
    resources (`electron/resources/libraw`) → linked like `node_modules`.
- [x] **T042** — Reviewer proof: a scratch branch with 3 seeded bad changes (code without a test; a change that
      breaks one of 202's ACs; `import React` in `src/engine/`) and 1 good one; `claude -p --agent reviewer
      --json-schema …` on each. · files: scratch branch only · test: 3 rejections naming the rule, 1 acceptance,
      recorded (AC-10)
  - **Result (2026-10-08):** replica worktree on `feat/202-review-probe` (removed after); each seed applied alone to
    `src/` and reviewed by `claude -p --agent reviewer --json-schema verdict.schema.json` with the task given in the
    prompt. (a) `clamp01` added with no test → **rejected**, "test first" ×2. (b) a "pure rename" of `lengthOf` that
    also set `magnetic: false` → **rejected**, "Spec" (Magnetic default changed, 202 AC-1), plus a real name clash
    the seed had introduced by accident (`videoLength` already exported) and "no gate run". (c) `formatDuration` with
    `import { useMemo } from 'react'` in `src/engine/` → **rejected**, "Constitution VIII", "task files" (an extra
    `useDuration` export), and a real rounding bug in the seeded code (59.6 s → "0:60"). (good) `clamp01` with its
    test → **accepted**, no reasons. 19–31 s and US$0.09–0.18 each, ~US$0.50 in all. Found on the way: Claude Code
    rejects a schema whose `$schema` is draft 2020-12 ("no schema with key or ref") and exits with no output; the
    line was removed from `verdict.schema.json` (learnings).

## F5 — The orchestrator (§5)

- [x] **T050** — Failing tests for `decide(state, event)` (every transition and every stop kind of AC-12: 👤 task,
      stopped task, spec-change, dependency, third failure, budget, Verify, not ready) and `parseAgentOutput`
      (`FACTORY: done`, `FACTORY-STOP: dependency: …`, noise around them, none). · files:
      `scripts/factory/run.test.mjs` · test: fails
  - **Result (2026-10-08):** Done with T051 as one test-first pair (the Stop hook won't end a turn on red).
    `run.test.mjs`: 54 tests. `decide` start (9): implement; stops `not-ready` naming the open needs, `paused`,
    `verify`, `done`, `waiting-on-you` for a 👤 task and for a stopped task, `nothing-to-do` (twice).
    Implemented (11): the agent's FACTORY-STOP spec-change / dependency / question; `depsChanged` → dependency;
    `specChanged` → spec-change; the turn cap → stop `turns` whatever else the run did; retry with feedback on no
    marker, not ticked, no Result note, several at once. Gates / review / commit (6): review; retry with only the
    red gates' summaries; commit; retry with `rule (file:line): why`; `next`, or stop `once`. Limits (7): third
    failure → `retries` for every failure kind, default 3; `budget` checked before every event, 0.5 is enough; no
    budget → no check; unknown event throws. `parseAgentOutput` (9): last marker wins over one quoted earlier,
    CRLF, backticks / bold, not inside a sentence, unknown kind → question. `commitMessage` (6), `taskBatch` (6).
    `next` inputs come from the real `parseTasks` + `stationOf` + `nextFor` on inline task lists.
    Seen failing: the first 52 tests, 52 / 52 red against stub exports. Added after that red run: the summary's
    first-clause test (commitMessage, passed at once: the `;` split went in with it); after review, the turn-cap
    stop (replacing the turn-cap retry case; red 1 / 54 before the fix) and the stopped-task case in `taskBatch`
    (green, it guards existing code: red with `&& !after.note` removed; the 👤 case likewise red with
    `&& !after.human` removed).
- [x] **T051** — `decide`, `parseAgentOutput`, the commit-message builder (`feat(402): … `, work-item suffix from the
      roadmap) in `scripts/factory/run.mjs` until T050 passes. · files: `scripts/factory/run.mjs` · test: T050
  - **Result (2026-10-08):** `scripts/factory/run.mjs` (pure, no side effects on import; the runner is T052):
    `decide` → `{ action: implement | gates | review | commit | retry | next | stop, kind?, reason?, feedback?,
    attempt }`, stop kinds `not-ready`, `paused`, `verify`, `done`, `waiting-on-you`, `nothing-to-do`,
    `spec-change`, `dependency`, `question`, `turns` (turn cap hit: AC-12 / Q3, work left for the stash),
    `retries`, `budget`, `once`; `parseAgentOutput`; `summarize` +
    `commitMessage` (subject `feat(NNN): <first clause, no backticks / parentheses / **(loop)**, lower-case first
    unless an acronym, ≤ 60 chars at a word boundary> (P2.x)`, suffix only when the roadmap title ends in one; body
    names the task(s); the `Co-Authored-By: Claude Opus 5.5` trailer from `git log`); `taskBatch` ("Failing
    tests" / "Tests first" + the next unchecked task, not when it's 👤 or stopped, not for "Failing tests then …",
    which does both, like T060). On the real repo: 402 → implement T050, batch T050 + T051, subject
    `feat(402): decide, parseAgentOutput, the commit-message builder`; 001 → stop `paused`. Gates:
    `npm run factory:gates -- --task T051` → check ✓ 1,159 tests (was 1,106), lint 0 errors; licenses ✓ (package.json
    is changed in the tree from earlier tasks). Break-test: retries limit `>=` → `>` → 3 tests red, restored.
    After review (one retry): turn cap is a stop, not a retry; stopped-task pairing covered. `npm run check` →
    1,160 tests, 0 lint errors.
- [x] **T052** — The runner around them: start checks (branch `feat/NNN-*`, clean tree); implementer and reviewer
      calls as T001 found; turn count and kill; deterministic checks (tick, Result note, `package.json`, spec /
      plan changed); `gates.mjs`; commit; stash on every stop before a commit; `.factory/state.json` on each phase;
      prompts in `scripts/factory/prompts/`. `npm run factory`. · files: `scripts/factory/run.mjs`,
      `scripts/factory/prompts/*.md`, `package.json` · test: a dry mode (`--dry`) with a stubbed `claude` that
      replays recorded streams: one green task, one red-then-green, one three-times-red (stash made, stop),
      one `FACTORY-STOP` (AC-12, unit + scripted)
  - **Result (2026-10-08):** Tests first: `runner.test.mjs` (29) + `permissions.test.mjs` (5), all red against the
    missing exports, then the code; green at once. `permissions.mjs`: the D-014 list for Bash and PowerShell (18
    rules), the reviewer's read-only subset (git status/diff/log/show, `npx vitest`, `npm run check`), one
    comma-joined `--allowedTools` value. `prompts/implement.md`, `retry.md`, `review.md` with `{{…}}` placeholders
    (a missing value throws), read at run time; a pair gets the "one turn" paragraph. `run.mjs`: `runFeature(nnn,
    opts, deps)` + CLI (`npm run factory -- NNN [--once] [--budget 10] [--max-turns 40] [--plan]`): refuses unless
    on `feat/NNN-*` with a clean tree (never stashes then); per task `nextFor` → `decide` → `taskBatch` →
    implementer (`claude -p --agent implementer --output-format json --max-turns --max-budget-usd
    --permission-mode acceptEdits --allowedTools`, stdin ignored, no shell, `ELECTRON_RUN_AS_NODE` removed, 90 min
    kill) → own checks (`taskChecks`: ticks + dated Result notes; `depsChanged` vs `HEAD:package.json`; spec/plan
    in the diff; `error_max_turns`) → `chooseGates` + `runGates` → reviewer (`--json-schema` without `$schema`,
    `structured_output`) → `git add -A` + `git commit -F <temp file>` (hooks run) → next. Retries carry the
    feedback and refused commands into `retry.md`. Every stop before a commit: `git stash push -u -m "factory NNN
    Tnnn attempt k: kind"`, named in the stop. `.factory/state.json` on each phase. Per-call budget = max(0.5,
    min(left, US$4)). `--output-format json` instead of the plan's stream-json (D-015). Scripted tests in temp git
    repos (fake `claude` editing files, fake gates): (a) one commit `feat(999): add the greeting (P9.9)`, phases
    start→implement→gates→review→commit→stopped, US$0.42 / 10 turns summed; two tasks → two commits, stop
    `verify`; (b) red→green: one commit, attempt 2, feedback in the prompt; rejected review → its reasons in the
    retry; (c) 3× red: no commit, stash `factory 999 T010 attempt 3: retries`, tree clean; (d) `FACTORY-STOP:
    dependency` → stash; also package.json dep, plan changed, turn cap, budget (US$0.80, call cap 0.80), denials,
    Verify start (no call, no stash), refusals (main, another feature's branch, dirty tree untouched), `--plan`
    (no call, no state file). `--plan` on 402: next T052, gates check + licenses, both command lines. Break-tests:
    no stash on stop → 6 red; a stash on refusal → 1 red; restored. Gates: `npm run factory:gates -- --feature 402
    --task T052` → check ✓ 1,194 tests (was 1,160), lint 0 errors / 5 warnings; licenses ✓ 168. The real loop was
    not run (T054).
- [x] **T053** — Notifications and the dashboard's **Loop** panel: `scripts/factory/notify.mjs` (Windows balloon via
      PowerShell, bell, stdout fallback); the panel and the active card read `.factory/state.json`; `/factory`
      command (`.claude/commands/factory.md`) starts `run.mjs` in the background and pushes a notification when it
      ends. · files: `scripts/factory/notify.mjs`, `scripts/factory/dashboard.mjs`, `.claude/commands/factory.md` ·
      test: manual: a `--dry` run shows each phase on the dashboard within 10 s and a toast on its stop (AC-13)
      _(2026-10-08: the review found the toast unproven; seeing it on screen moved to T054's test. T053 proves the
      dashboard half and that the notification command runs.)_
  - **Result (2026-10-08):** Tests first (16, red: module missing / no exports), then the code, green at once. Two
    test files not named in the task: `notify.test.mjs` (9) and `dashboard.test.mjs` (7). `notify.mjs`:
    `notifyCommand` (Windows: `powershell.exe` NotifyIcon balloon, title/text passed **in the environment**, never
    in the script, clipped to 63 / 255 chars; macOS `osascript` with argv; else none), `stateMessage(state.json)`,
    `notify` (bell on a terminal, always one stdout line, which says so when the desktop call fails;
    `CHITTHI_FACTORY_NOTIFY=off`); CLI `"<title>" "<text>"` or `--state [path]`, always exit 0. `dashboard.mjs`:
    `readLoop` (state + file mtime as `updatedAt`; missing or half-written → null), `loopPanel` (running / stopped /
    "no change for > 95 min", the phases implement → gates → review → commit with the current one marked, attempt,
    cost, turns, the stop's kind, reason and stash), a **Loop** panel above the line, and the loop's feature becomes
    the active card with "▶ T060 · gates · attempt 2" or "■ stopped: kind" (for 24 h after a stop). It now renders
    only when run as a script (an import guard), so the tests can import it. `/factory`: checks branch + clean tree
    (never fixes them), `--plan` preview, starts the dashboard, runs `run.mjs …; node notify.mjs --state` in the
    background, reports the stop when re-invoked. `run.mjs` has no `--dry` flag (T052 made the scripted runs tests),
    so the demo was a scratch script: `runFeature` in a temp repo with a scripted claude and gates (4 s a step),
    the dashboard `--serve`d from that repo and fetched every 1 s. **Each phase was on the served page 0.1–1.1 s
    after it was written**: T010 implement → gates → review (commit 0.2 s, between two polls), T011 implement, then
    stopped `dependency` with the stash; the browser's 10 s reload is added to that. `notify.mjs --state` on that stop:
    exit 0, the message line printed. A separate real call returned exit 0 after 6.3 s (the balloon's lifetime). **I
    did not see the toast:** one full-screen capture taken 2.5 s after the call showed no toast. The capture also
    took in the user's own windows, so it was deleted and no more were taken. Whether a toast appears (Focus Assist
    or notification settings may hide it) is for the maintainer to check at T054. Page screenshots (1400 px light,
    390 px dark; running and stopped): no console errors, no sideways scroll. Break-tests: the loop's feature not
    made active → 1 red; a failed desktop call counted as shown → 1 red; restored. `npm run factory:dashboard` on
    the repo (no state.json): "No loop has run here yet". Gates: `npm run factory:gates -- --feature 402 --task
    T053` → check ✓ 1,210 tests (was 1,194), lint 0 errors / 5 warnings; licences ✓ 168.
  - **Review (2026-10-08):** rejected once: the toast was not seen, so AC-13's notification half is moved to T054
    (see the test line). Also fixed from the review: empty text now falls back to the title (`ShowBalloonTip`
    throws on empty text while `-Command` can still exit 0, so `channel` said `desktop` wrongly); +1 test, red first.
- [x] **T054** 👤 — First real run (P4): `/factory 402` on the tasks marked **(loop)** below, budget US$10; watch
      the dashboard. · files: whatever the loop's tasks touch · test: ≥ 3 agent tasks done without a person, each
      with a Result note quoting its gate run and a commit `feat(402): …` on `feat/402-*`, nothing pushed (AC-11,
      AC-14); every stop kind not yet seen is triggered once by hand and recorded (AC-12); the maintainer sees the
      desktop toast when the run stops (Focus Assist off), or records why not (AC-13, moved from T053 on 2026-10-08)
  - **Run 1 (2026-10-08):** `/factory 402` from `3ed5754`: T060 done unattended (commit `721d4f5`); stopped
    `question` on T061 after US$2.31 / 47 turns, because a headless run can't write `.claude/` (the loop correctly
    refused it, plus an out-of-allow-list temp-repo script and a temp-folder write); work stashed. **The maintainer
    saw the desktop toast on that stop (AC-13 proven).** T061 was finished interactively (`695d347`).
  - **Run 2 (2026-10-08):** from `695d347`, budget US$7.69: T070 done unattended (`10fe9ee`, review accepted);
    stopped `question` on T071 after US$2.52 / 97 turns (`.claude/commands/release.md` again; the draft was left in
    `scripts/factory/`); finished interactively (`7016890`). Total for both runs US$4.83 of US$10.
  - **Result (2026-10-08):** **2 agent tasks done without a person** (T060, T070), each with a Result note quoting
    its gate run and a `feat(402): …` commit on `feat/402-software-factory`. The loop itself pushed nothing; the
    maintainer pushed by hand. **The maintainer accepted 2 instead of the ≥ 3 in the test**, because T061 and T071
    only stopped on the `.claude/` write (learning recorded; such tasks are now 👤 work). **Stop drill (AC-12)** on a
    throwaway local branch `feat/998-stop-drill` (feature 998, never merged), US$0.71 in all:
    - 👤 task → `waiting-on-you`, no call;
    - all ticked → `verify`, no call;
    - `--budget 0.4` → `budget`, no call;
    - `--max-turns 2` → `turns` after 3 turns (US$0.08), work stashed;
    - a task adding `left-pad` → the implementer stopped with `dependency` before editing `package.json` (US$0.08);
    - a task editing spec.md and plan.md → `spec-change` (US$0.08);
    - a task told not to tick itself → a retry with the feedback, then ticked on attempt 2 and committed (US$0.33);
    - a task with a deliberately red test it may not touch → the implementer stopped with `question` rather than
      report done (US$0.14).

    So a **retry** was seen live but the **third failure** was not: real agents stop and ask instead of failing
    three times. The third-failure stop is proven by the scripted run in `runner.test.mjs` (case c: 3× red → no
    commit, stash, clean tree). Every stop left the tree clean. The drill branch and its two stashes are left for
    the maintainer to delete (`git branch -D feat/998-stop-drill`; `git stash list`).

## F6 — Batch intake and parallel lines (§6)

- [x] **T060** — **(loop)** Failing tests then `scripts/factory/lock.mjs`: take, wait, release, a stale pid taken
      over, the path from `git rev-parse --git-common-dir`; `gates.mjs` uses it. · files:
      `scripts/factory/lock.mjs`, `scripts/factory/lock.test.mjs`, `scripts/factory/gates.mjs` · test:
      `lock.test.mjs` (AC-16)
  - **Result (2026-10-08):** `lock.mjs`: `gateLockPath(root)` (`<git common dir>/factory-gates.lock`),
    `isAlive(pid)` (`process.kill(pid, 0)`, EPERM = alive), `takeLock` (`open(…, 'wx')` writing
    `{ pid, feature, since }`; a holder whose pid has ended is removed and taken over, returned as `stale`; an
    unreadable lock counts as held for 10 s, the window between `open` and `write`, then as stale),
    `releaseLock` (removes only our own: same pid and `since`), `withGateLock(fn, { feature, pollMs = 2000,
    onWait })` (polls, reports each new holder once, releases in `finally`). `gates.mjs` `main` passes it as
    `withLock` and prints "waiting for gates: 204 (pid …, since …)"; `runGates`' default stays a pass-through for
    its tests; `--dry` takes no lock. 11 tests, failed first (module missing): take, held → holder, release only
    our own, stale pid (a real ended child's pid) taken over, isAlive, unreadable fresh/old, value + release,
    release on throw, wait (≥ 60 ms, one `onWait`), two runs at once never overlap, and the same path from a main
    checkout and its worktree (temp repo). Break-test: `isAlive` always true → 2 fail (stale takeover, isAlive).
    Gate: `npm run factory:gates -- --task T060` → ✓ check 15 s, 1222 tests passed, lint 0 errors / 5 warnings;
    no lock file left in `.git` after. Surprising: on Windows `realpathSync` and git disagree on case
    (`C:\Windows\Temp` vs `C:\WINDOWS\TEMP`); the test compares `realpathSync.native` lowercased. Known limit: two
    lines taking over the same stale lock at the same instant could both unlink; not handled (needs a dead line
    plus two waiters within one poll). New files not Prettier-formatted (`npx prettier` isn't on the headless
    allow-list); lint clean.
- [x] **T061** — **(loop)** `run.mjs --worktree` (create from `main` if the branch is missing; `node_modules` as
      T002 found) and `--intake 203,204`; `/spec-batch` command. · files: `scripts/factory/run.mjs`,
      `.claude/commands/spec-batch.md` · test: unit for the argument handling and the worktree path; T062, T063
  - **Result (2026-10-08):** The unattended loop wrote the code and tests, then stopped with `question`: a headless
    run can't write `.claude/commands/spec-batch.md` (`.claude/` is protected config; learnings). Its work was
    applied to the tree and the task finished in an interactive session. `run.mjs`: `parseArgs` (feature run,
    `--worktree`, `--remove-worktree`, `--intake 203,204`, everything else refused with the usage);
    `worktreeDir` (`../<name>-wt/NNN`), `featureBranch` (the one `feat/NNN-*`, else `feat/<spec folder>` created
    from `main`); `prepareWorktree` (reuses an existing one, refuses a branch checked out in the main checkout,
    links `node_modules`, `electron/resources/libraw` and `fonts` as junctions) and `removeWorktree` (junctions
    first, then `git worktree remove --force`, branch kept); `runIntake` + `intakeCheck` + prompt
    `scripts/factory/prompts/intake.md` (one spec-writer per item, skips items off the roadmap or with a folder,
    stops the batch on a draft that changed more than its spec and the roadmap, on budget or turns; never commits).
    Review found one gap, fixed here test first: the loop's own gate runs didn't take the gate lock (only
    `gates.mjs`' command line did), so two worktree lines could overlap (AC-16). New `lockedGates` wraps
    `runGates` in `withGateLock`; `runFeature` uses it by default and shows "waiting for gates: 204" as its phase
    (seam for tests: deps `runGatesBase`, `gatePollMs`). `prepareWorktree` runs `git worktree prune` first, so a
    worktree folder deleted by hand is made again instead of being reported at a missing path.
    `.claude/commands/spec-batch.md` written (sequential spec-writer agents, checks per draft, report questions;
    the `--intake` line as the unattended alternative). Outside the named files: `.claude/commands/factory.md`
    (`--worktree` in the hint; the branch check moves to the worktree; `notify.mjs --state` given the worktree's
    state path, since the dashboard's Loop panel reads only the main checkout's). Tests: `worktree.test.mjs`
    20 (argument handling, paths/branches, real temp repo + worktree + junctions, removal order, a folder deleted
    by hand, lock wait, intake), plus 1 in `runner.test.mjs` (`runFeature` with another line holding the real
    lock: phases `gates` → `waiting for gates: 204` → `gates`, gates run holding it, lock file gone after); each
    new test failed first. Break-tests: junction removal skipped → the worktree test fails; the default lock
    wiring removed → the runner test fails. The review rejected the task once: no test covered `runFeature`'s
    default locked gates, and `lockedGates` sat between `runFeature`'s doc comment and the function. Fixed:
    the seam and the runner test above, `lockedGates` moved above the doc comment, and the prune (the reviewer's
    optional point). Gate: `npm run factory:gates -- --feature 402 --task T061` → ✓ check 16 s, 1243 tests
    passed, lint 0 errors / 5 warnings; no worktree, lock or temp repo left. Known limit: the dashboard shows
    one checkout's loop; T063 will show whether that matters.
- [ ] **T062** 👤 — `/spec-batch 203 204` on a scratch branch: two Draft specs with open questions, roadmap 📝, no
      plan or code; branch deleted after. · test: recorded (AC-15)
- [ ] **T063** 👤 — Two scratch features in two worktrees, each with one tiny tooling task, run at once: both green,
      gate runs never overlap (run-file timestamps), worktrees removed after. · test: recorded (AC-16)

## F7 — Release station (§7)

- [x] **T070** — **(loop)** Failing tests then `bumpRelease` in `scripts/factory/release.mjs`: on copies of
      `package.json`, `public/sw.js`, `docker-compose.yml`, `plugins/chitthi/.claude-plugin/plugin.json`,
      `CHANGELOG.md` (fixtures); version must increase; the CHANGELOG gets the dated section and a new empty
      Unreleased. · files: `scripts/factory/release.mjs`, `scripts/factory/release.test.mjs`,
      `scripts/factory/fixtures/release/*` · test: `release.test.mjs` (AC-17)
  - **Result (2026-10-08):** Unattended (loop) run. Fixtures are copies of the five files at 2.8.0 / `APP_CACHE` v15
    (`fixtures/release/`, with a README). `release.mjs` exports `RELEASE_FILES`, `compareVersions` and the pure
    `bumpRelease(files, version, date)`: it takes a map of path → text and returns the new texts. package.json and
    plugin.json change only their top-level `"version"` line, sw.js changes `APP_CACHE` vN → vN+1 (the font cache
    stays), docker-compose.yml changes the image tag. In CHANGELOG.md, Unreleased becomes `## [X.Y.Z] - date` with a
    new empty `## [Unreleased]` above it. The `[Unreleased]` compare link moves to `vX.Y.Z...HEAD` and a
    `[X.Y.Z]: …/compare/v<current>...vX.Y.Z` link goes in below it. Each file keeps its own line endings (CRLF
    tested). It throws, without changing anything, when: the version isn't X.Y.Z (no `v`, no pre-release) or isn't
    greater than package.json's (numeric order, 2.10.0 > 2.9.0); the date isn't YYYY-MM-DD; a file is missing or
    a marker isn't found; plugin.json or docker-compose.yml disagree with package.json; Unreleased is empty; or
    the version already has a section. Differs from the plan: plan §7 writes the heading as
    `## [X.Y.Z] — YYYY-MM-DD`, but the real CHANGELOG uses `- ` (Keep a Changelog). So the separator is copied
    from the file's latest version heading, with `- ` as the fallback.
    `release.test.mjs` has 14 tests and fails 13 of them before the code exists. Break check: with no new
    Unreleased written, 3 tests fail; restored. The real CHANGELOG's `[Unreleased]` link is stale (`v2.7.0...HEAD`)
    and has no `[2.8.0]` line. The bump fixes the Unreleased link at the next release but doesn't add the missing
    2.8.0 link. Gate: `npm run factory:gates -- --task T070` → ✓ check 15 s, 1257 tests passed, lint 0 errors /
    5 warnings.
    Attempt 2 (2026-10-08): review found the fixtures were git-ignored by the unanchored `release/` rule (meant for
    the packaging output), so a clean checkout would lose them. Outside the task's files: `.gitignore` gets
    `!scripts/factory/fixtures/release/` right after `release/` (an exception rather than anchoring, so no other
    `release/` folder starts showing up). `git status --porcelain -uall` now lists all six fixtures. Gate re-run:
    `npm run factory:gates -- --task T070` → ✓ check 14 s, 1257 tests passed, lint 0 errors / 5 warnings.
- [x] **T071** — **(loop)** The wrapper (`main` and clean checks, `npm version --no-git-tag-version`, the checklist,
      asks before the dry run, no tag / push) and `/release`; `npm run release:prepare`. · files:
      `scripts/factory/release.mjs`, `.claude/commands/release.md`, `package.json` · test: a scratch-branch run with
      the `main` check overridden by a test flag, every file diffed, then reverted (AC-17)
  - **Status (2026-10-08):** unattended run, stopped `question`: everything but `.claude/commands/release.md` is done
    and green; a headless run can't write `.claude/` (learnings, as T061). The command's text is ready in
    `scripts/factory/release-command.draft.md`: move it to `.claude/commands/release.md`, then tick. Done:
    `release.mjs` gains `parseReleaseArgs` (one X.Y.Z, `--date`, `--test-branch <scratch>`, never `main`),
    `remainingChecklist(md)` (specs/release.md "Before tagging" minus the CHANGELOG / `npm version` / bump steps)
    and `prepareRelease` (X.Y.Z check → branch is `main` or the test branch → `git status --porcelain` empty →
    `bumpRelease` on the five files, which throws before anything is written → `npm version X.Y.Z
    --no-git-tag-version` → writes the other four → prints changed files, the checklist, and the tag commands as
    the maintainer's; on `main` only asks once before `gh workflow run desktop-release.yml --ref main`, default no,
    and never asks without a terminal; off `main` the dry run is never offered). No commit, tag or push in it.
    `package.json`: `release:prepare` script (no dependency). Test (outside the named files):
    `scripts/factory/release-prepare.test.mjs`, 12 tests, all failed first (exports missing): argument handling,
    the checklist from the real specs/release.md, refusals off `main` / main with a test branch / dirty / bad
    version (fake git, nothing written), and the AC-17 scratch run: a temp git repo from the committed release
    files + package-lock.json + specs/release.md, branch `scratch/release`, real `npm version` to 9.9.9 → `git diff`
    lists exactly the six files, each checked (package.json and the lock change only `"version"` lines, plugin,
    image tag, `APP_CACHE` +1, CHANGELOG section and compare link), no commit or tag, dry run `skipped` and never
    asked; repo deleted after. On main (fake git/npm): asked once, `declined` / `ran` only after yes. CLI in this
    checkout: `npm run release:prepare -- 9.9.9` → "a release is prepared on main, not on feat/402-…" exit 1; with
    `--test-branch feat/402-software-factory` → refuses the dirty tree. Break check: branch check off → 2 tests
    fail; restored. Gate: `npm run factory:gates -- --task T071` → ✓ check 16 s, 1269 tests passed, lint 0
    errors / 5 warnings; ✓ licenses 168 packages.
  - **Result (2026-10-08):** The loop stopped on the `.claude/` write: a headless run can't create
    `.claude/commands/release.md`, the same as T061. The task was finished in an interactive session. The reviewed
    work from the loop was kept as it was: the wrapper matches plan §7 and the task text (main and clean checks,
    `npm version --no-git-tag-version`, the checklist, one question before the dry run, no tag, push or commit).
    `.claude/commands/release.md` was written from the draft unchanged (byte-compared), and the draft was deleted.
    The command checks first and never fixes anything itself. It runs `npm run release:prepare`, reports the diff
    and the checklist, and asks about the dry run only once the release is pushed. It never passes `--test-branch`.
    The wrapper never wrote to the real checkout (its two CLI runs here refused as designed: wrong branch, then
    dirty tree): `release-prepare.test.mjs` uses only temp repos and fake
    git. It passes 12/12, and `git status` afterwards showed no release file touched. The break check was not
    repeated interactively: the permission classifier refused a test run with the clean-tree check turned off. The
    edit was restored at once, and the loop's break check above (branch check off → 2 fail) stands. Gate:
    `npm run factory:gates -- --feature 402 --task T071` → ✓ check 15 s, 1269 tests passed; ✓ licenses 168
    packages, all allowed.

## Constitution and docs (§8)

- [ ] **T080** — Constitution 1.1.0, principle XII (Q7) and its decision entry; `tech-stack.md` "Build and tooling"
      row for the Claude Code CLI (P5). · files: `specs/constitution.md`, `specs/tech-stack.md`,
      `memory/decisions.md` · test: review
- [ ] **T081** [P] — Docs (AC-18): `specs/workflow.md` "Running the line"; `specs/software-factory.md` phase
      status and commands; `specs/build.md`, `specs/testing-strategy.md` (scripts' tests in `test:unit`, the factory
      commands), `specs/memory-management.md` (the scribe), `CLAUDE.md`. · files: those · test: review; links
      checked

## Verify

- [ ] **T090** — `specs/architecture.md`: a short "Development tooling" note (the factory sits outside the app).
- [ ] **T091** — Every Definition-of-Done gate green (`check`, `build`, `test:e2e`, `test`, `test:mcp`,
      `check:licenses`), unchanged from before 402 since the app didn't change; record the numbers.
- [ ] **T092** — Tick ACs in `spec.md` (Status `Implemented`), roadmap 402 → ✔️, `specs/software-factory.md`
      F1–F7 ✔️, `memory/progress.md`, `memory/MEMORY.md`.

## AC coverage

| AC    | Tasks                    |
| ----- | ------------------------ |
| AC-1  | T010, T011, T012, T013   |
| AC-2  | T011, T012, T013         |
| AC-3  | T020, T021               |
| AC-4  | T020, T021, T022         |
| AC-5  | T030, T031, T032         |
| AC-6  | T030, T031, T032         |
| AC-7  | T033                     |
| AC-8  | T034                     |
| AC-9  | T040, T041               |
| AC-10 | T042                     |
| AC-11 | T001, T050–T052, T054    |
| AC-12 | T050, T051, T052, T054   |
| AC-13 | T053, T054               |
| AC-14 | T051, T054               |
| AC-15 | T061, T062               |
| AC-16 | T002, T060, T061, T063   |
| AC-17 | T070, T071               |
| AC-18 | T080, T081, T090         |
