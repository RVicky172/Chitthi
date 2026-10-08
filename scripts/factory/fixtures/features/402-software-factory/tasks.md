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

- [ ] **T010** — Fixtures: copy today's `specs/roadmap.md`, every `specs/features/*/spec.md` and `tasks.md`,
      `memory/progress.md`, `memory/decisions.md`, `memory/MEMORY.md` into `scripts/factory/fixtures/` (frozen; a
      README says so). · files: `scripts/factory/fixtures/**` · test: none (data)
- [ ] **T011** — Failing tests for the readers: roadmap rows and phases; `needs` (none yet → `[]`, a range
      `203–211` expands); tasks (done, 👤, `[P]`, Status note, Result notes not swallowed into the text, `area:` and
      `deps:` tags); spec status, AC counts, `[NEEDS CLARIFICATION]` count; progress and decisions; and
      `nextFor`: 202 → next T030, stopped [T001], human []; 001 → next none, 11 human; 000/201/401 → Done; a
      feature whose `needs` aren't Done → `ready: false`; a task with open `deps` → blocked (AC-1, AC-2). · files:
      `scripts/factory/state.test.mjs` · test: fails (no `state.mjs`)
- [ ] **T012** — `scripts/factory/state.mjs`: move the readers out of `dashboard.mjs`, text in / data out, plus
      `needs`, tags and `nextFor`, until T011 passes. Dashboard rewired to it: its HTML for today's repo is
      identical before and after (diff of the two outputs, timestamp line excepted). · files:
      `scripts/factory/state.mjs`, `scripts/factory/dashboard.mjs` · test: T011; the HTML diff
- [ ] **T013** — `scripts/factory/next.mjs` (+ `npm run factory:next`) printing T011's JSON; the **Needs** column in
      `specs/roadmap.md`, taken from the dependencies each work item lists in `vision/editor-implementation.md`
      (e.g. 212 ← 203–211; 4xx: none unless stated); tags documented in `specs/templates/tasks-template.md`. · files:
      `scripts/factory/next.mjs`, `package.json`, `specs/roadmap.md`, `specs/templates/tasks-template.md` · test:
      `npm run factory:next 202` prints next T030, stopped T001; `npm run factory:next 203` prints `ready: false`
      until 202 is Done; T011 still green on the real files (one extra test reads the live repo)

## F2 — Gates as code (§2)

- [ ] **T020** — Failing tests: `chooseGates` on ≥ 12 path sets (engine only; a timeline component with and
      without an `area: ui:editors` tag; print studio component; `src/state/video.ts`; `electron/main.cjs`;
      `src/agent/tools.ts`; `package.json`; `vite.config.ts`; docs only; `scripts/` only; mixed), and
      `{ verify: true }` = the DoD list (AC-3). Output parsers on captured real outputs (Vitest, Playwright with a
      failure and a flaky, self-test, MCP, licences) saved as fixtures. · files: `scripts/factory/gates.test.mjs`,
      `scripts/factory/fixtures/gate-output/*` · test: fails (no module)
- [ ] **T021** — `scripts/factory/gates.mjs`: rules table, area map, parsers, `runGates` (spawns each command,
      timing, run file `.factory/runs/<ISO>-<NNN>-<Tnnn>.json`, exit 1 on a red gate), changed files from git, the
      gate lock call (stub until T060). `npm run factory:gates`. · files: `scripts/factory/gates.mjs`,
      `package.json` · test: T020; a stubbed-command test for the run file and exit code (AC-4)
- [ ] **T022** — Dashboard: the **Gate runs** panel reads the real run files; one real `npm run factory:gates`
      on the current tree, seen on the dashboard within one refresh. · files: `scripts/factory/dashboard.mjs` ·
      test: manual, recorded (AC-4)

## F3 — Guardrails (§3)

- [ ] **T030** — Failing tests: `editAllowed` (paths × branches `feat/402-*`, `feat/203-*` with no folder, a Draft
      spec, `main`, `fix/x`, a worktree gitdir) and `commandAllowed` on ≥ 15 commands, refused and allowed
      lookalikes: `sed -i`, `sed --in-place`, `sed -n`, `npx prettier --write src/x.ts`, `npx prettier --check src`,
      `git push`, `git push -f`, `git push --force-with-lease`, `git push origin +main`, `git tag v1`, `git tag -l`,
      `git reset --hard`, `git reset HEAD~1 --soft`, `git clean -fd`, `git restore .`, chained `npm run check &&
      git push --force`, PowerShell form (AC-5, AC-6). · files: `scripts/factory/rules.test.mjs` · test: fails
- [ ] **T031** — `scripts/factory/rules.mjs` until T030 passes. · files: `scripts/factory/rules.mjs` · test: T030
- [ ] **T032** — Hook wrappers and registration: `.claude/hooks/pre-tool.mjs` (stdin JSON → rules → exit 2 with the
      reason; fails open with a log line, P2; `CHITTHI_FACTORY_HOOKS=off`), `.claude/settings.json` (PreToolUse for
      `Edit|Write|MultiEdit|NotebookEdit` and `Bash|PowerShell`), `.gitignore` exceptions (Q5). Timing: 20 calls
      under 150 ms each. · files: `.claude/hooks/pre-tool.mjs`, `.claude/settings.json`, `.gitignore` · test: a
      wrapper test feeding hook JSON through a child process (refuse, allow, crash → allow + log); manual: a refused
      `git tag` and a refused `src/` edit on a Draft-spec branch in a live session, recorded (AC-5)
- [ ] **T033** — Stop hook `.claude/hooks/stop.mjs`: code-path filter, diff hash cache in `.factory/check-ok`,
      `npm run check`, `stop_hook_active`, second refusal ends the turn and writes a stopped loop state; registered
      in `settings.json`. · files: `.claude/hooks/stop.mjs`, `.claude/settings.json` · test: unit for the filter and
      the hash decision; manual: a session with a failing test can't end, a docs-only turn doesn't run the check,
      recorded (AC-7)
- [ ] **T034** [P] — `.gitattributes`: `* text=auto` and the binary list; `git add --renormalize --dry-run .` (or
      `git status`) shows no change; AC-8's two edits on a scratch branch, deleted afterwards. · files:
      `.gitattributes` · test: manual, recorded (AC-8)

## F4 — Specialist agents (§4)

- [ ] **T040** — `.claude/agents/`: `spec-writer`, `planner`, `implementer`, `reviewer`, `verifier`, `scribe`,
      `licence-auditor` (frontmatter `name`, `description`, `tools`, `model`; bodies point at the repo's rules);
      `scripts/factory/verdict.schema.json`. · files: `.claude/agents/*.md`, `scripts/factory/verdict.schema.json` ·
      test: `claude agents` lists all seven with the tools of plan §4; the reviewer and licence auditor have no
      Edit / Write (AC-9)
- [ ] **T041** — The five `/spec-*` commands hand their work to the agents, names and arguments unchanged. ·
      files: `.claude/commands/spec-*.md` · test: one run of each on a scratch feature folder (deleted after),
      recorded (AC-9)
- [ ] **T042** — Reviewer proof: a scratch branch with 3 seeded bad changes (code without a test; a change that
      breaks one of 202's ACs; `import React` in `src/engine/`) and 1 good one; `claude -p --agent reviewer
      --json-schema …` on each. · files: scratch branch only · test: 3 rejections naming the rule, 1 acceptance,
      recorded (AC-10)

## F5 — The orchestrator (§5)

- [ ] **T050** — Failing tests for `decide(state, event)` (every transition and every stop kind of AC-12: 👤 task,
      stopped task, spec-change, dependency, third failure, budget, Verify, not ready) and `parseAgentOutput`
      (`FACTORY: done`, `FACTORY-STOP: dependency: …`, noise around them, none). · files:
      `scripts/factory/run.test.mjs` · test: fails
- [ ] **T051** — `decide`, `parseAgentOutput`, the commit-message builder (`feat(402): … `, work-item suffix from the
      roadmap) in `scripts/factory/run.mjs` until T050 passes. · files: `scripts/factory/run.mjs` · test: T050
- [ ] **T052** — The runner around them: start checks (branch `feat/NNN-*`, clean tree); implementer and reviewer
      calls as T001 found; turn count and kill; deterministic checks (tick, Result note, `package.json`, spec /
      plan changed); `gates.mjs`; commit; stash on every stop before a commit; `.factory/state.json` on each phase;
      prompts in `scripts/factory/prompts/`. `npm run factory`. · files: `scripts/factory/run.mjs`,
      `scripts/factory/prompts/*.md`, `package.json` · test: a dry mode (`--dry`) with a stubbed `claude` that
      replays recorded streams: one green task, one red-then-green, one three-times-red (stash made, stop),
      one `FACTORY-STOP` (AC-12, unit + scripted)
- [ ] **T053** — Notifications and the dashboard's **Loop** panel: `scripts/factory/notify.mjs` (Windows balloon via
      PowerShell, bell, stdout fallback); the panel and the active card read `.factory/state.json`; `/factory`
      command (`.claude/commands/factory.md`) starts `run.mjs` in the background and pushes a notification when it
      ends. · files: `scripts/factory/notify.mjs`, `scripts/factory/dashboard.mjs`, `.claude/commands/factory.md` ·
      test: manual: a `--dry` run shows each phase on the dashboard within 10 s and a toast on its stop (AC-13)
- [ ] **T054** 👤 — First real run (P4): `/factory 402` on the tasks marked **(loop)** below, budget US$10; watch
      the dashboard. · files: whatever the loop's tasks touch · test: ≥ 3 agent tasks done without a person, each
      with a Result note quoting its gate run and a commit `feat(402): …` on `feat/402-*`, nothing pushed (AC-11,
      AC-14); every stop kind not yet seen is triggered once by hand and recorded (AC-12)

## F6 — Batch intake and parallel lines (§6)

- [ ] **T060** — **(loop)** Failing tests then `scripts/factory/lock.mjs`: take, wait, release, a stale pid taken
      over, the path from `git rev-parse --git-common-dir`; `gates.mjs` uses it. · files:
      `scripts/factory/lock.mjs`, `scripts/factory/lock.test.mjs`, `scripts/factory/gates.mjs` · test:
      `lock.test.mjs` (AC-16)
- [ ] **T061** — **(loop)** `run.mjs --worktree` (create from `main` if the branch is missing; `node_modules` as
      T002 found) and `--intake 203,204`; `/spec-batch` command. · files: `scripts/factory/run.mjs`,
      `.claude/commands/spec-batch.md` · test: unit for the argument handling and the worktree path; T062, T063
- [ ] **T062** 👤 — `/spec-batch 203 204` on a scratch branch: two Draft specs with open questions, roadmap 📝, no
      plan or code; branch deleted after. · test: recorded (AC-15)
- [ ] **T063** 👤 — Two scratch features in two worktrees, each with one tiny tooling task, run at once: both green,
      gate runs never overlap (run-file timestamps), worktrees removed after. · test: recorded (AC-16)

## F7 — Release station (§7)

- [ ] **T070** — **(loop)** Failing tests then `bumpRelease` in `scripts/factory/release.mjs`: on copies of
      `package.json`, `public/sw.js`, `docker-compose.yml`, `plugins/chitthi/.claude-plugin/plugin.json`,
      `CHANGELOG.md` (fixtures); version must increase; the CHANGELOG gets the dated section and a new empty
      Unreleased. · files: `scripts/factory/release.mjs`, `scripts/factory/release.test.mjs`,
      `scripts/factory/fixtures/release/*` · test: `release.test.mjs` (AC-17)
- [ ] **T071** — **(loop)** The wrapper (`main` and clean checks, `npm version --no-git-tag-version`, the checklist,
      asks before the dry run, no tag / push) and `/release`; `npm run release:prepare`. · files:
      `scripts/factory/release.mjs`, `.claude/commands/release.md`, `package.json` · test: a scratch-branch run with
      the `main` check overridden by a test flag, every file diffed, then reverted (AC-17)

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
| AC-13 | T053                     |
| AC-14 | T051, T054               |
| AC-15 | T061, T062               |
| AC-16 | T002, T060, T061, T063   |
| AC-17 | T070, T071               |
| AC-18 | T080, T081, T090         |
