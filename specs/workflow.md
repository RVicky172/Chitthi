# Spec-Driven Workflow

Every feature moves through five gated stages. Each stage produces a file in `specs/features/NNN-short-name/`.
Do not start a stage until the previous one is approved.

```
 1. SPECIFY  ──►  2. PLAN  ──►  3. TASKS  ──►  4. IMPLEMENT  ──►  5. VERIFY
   spec.md        plan.md       tasks.md        code + tests       Definition of Done, docs, memory
   (what/why)     (how)         (steps)
```

## Feature numbering

Matching `roadmap.md`: `000–099` baseline and cross-cutting foundation (`000` baseline, `001` Phase 1 gate and
2.10.0 release), `2xx` editor Phase 2 (multi-track timeline), `3xx` editor Phase 3 (colour and finishing), where the
last two digits are the work-item ID (P2.1 → `201`), and `401+` everything else (print studio, site, desktop).
Commit messages and the CHANGELOG may name both: `feat(201): track model (P2.1)`.

Folder name: `NNN-kebab-name` (e.g. `012-user-login`).

## Stage 1 — Specify (`spec.md`)

Copy `templates/spec-template.md`. Describe **what** and **why**, never **how**:
user stories, acceptance criteria (testable, numbered `AC-1…`, each naming the test type that proves it),
out-of-scope, open questions. Set `Status: Draft`. A human reviews and changes it to `Status: Approved`.
**Gate:** no `[NEEDS CLARIFICATION]` markers remain; every AC is testable.

## Stage 2 — Plan (`plan.md`)

Copy `templates/plan-template.md`. Describe **how**: files touched, interfaces, techniques, risks, a test for every
AC, and a **Constitution check** (each principle: ✅ / ⚠️ with justification). A human approves it.
**Gate:** constitution check passes; no new dependency without a `tech-stack.md` update.

## Stage 3 — Tasks (`tasks.md`)

Copy `templates/tasks-template.md`. Break the plan into small ordered tasks (≤ ~1 hour each), each naming the files
it touches and the test that proves it. Tests are written **before or with** the code they cover. Mark tasks that
can run in parallel with `[P]`. Every AC is covered by at least one task (AC coverage table).

## Stage 4 — Implement

Work one task at a time. After each task:

1. Run `npm run check` (and that area's e2e tests, `npx playwright test e2e/<file>.e2e.ts`, if the change affects
   UI or integration; never the full suite, which runs once in Stage 5, D-007; `npm test` if it renders,
   exports or touches an agent tool; `npm run test:mcp` if it touches IPC or the MCP server). Fix until green.
   `npm run factory:gates -- --task Tnnn` picks these gates from the changed files, runs them and records the run
   in `.factory/runs/` for the Result note.
2. Tick the task in `tasks.md` and add a short dated **Result** note under it: what was done, what was measured,
   anything surprising. These notes are the evidence Stage 5 checks.
3. Record decisions in `memory/decisions.md` and gotchas in `memory/learnings.md` as they happen.

For an important test, prove it can fail: break the code briefly, see the test fail, restore.

## Stage 5 — Verify

Run every gate in the Definition of Done (`constitution.md`): `npm run check`, `npm run test:e2e`, `npm run build`,
`npm test`, `npm run test:mcp`, `npm run check:licenses`. Then:

- Check each AC against its test or measurement; tick only the proven ones. Set `Status: Implemented`.
- Update `roadmap.md`, add a `memory/progress.md` entry, refresh "Current State" in `memory/MEMORY.md`.
- Report honestly anything that failed, was flaky, or was skipped.

## Vision documents and plans spanning releases

Large initiatives start as a vision doc in `specs/vision/` (what and why across releases, e.g. the editor roadmap),
optionally with a work-item breakdown. They are input to specs, not approval: each item becomes a numbered feature
with its own `spec.md` when it starts. When writing one:

- Plan for everyone: free and open source, no paid tier; desktop-only only for technical reasons (Constitution V).
- Start with a status line: state, date written, and the app version it was written against.
- Name every new library, model, binary or asset with its licence, cleared in `licensing.md` first (Constitution VII).
- When an initiative ships, its outcome is written up in `docs/` (product docs) and `specs/architecture.md` /
  `specs/lld.md` (structure), and the vision doc is marked done.

## Changing a spec mid-flight

Stop. Edit `spec.md`, add a line to its **Changelog**, log the decision in `memory/decisions.md`, and re-check
`plan.md`/`tasks.md` for impact (add tasks if needed) — then write the code. Never silently diverge code from spec.

## Slash commands (Claude Code)

Shortcuts in `.claude/commands/`. Each `/spec-*` command hands the work to a specialist agent in `.claude/agents/`
(`spec-writer`, `planner`, `implementer` then `reviewer`, `verifier` then `scribe`).

| Command                   | Does                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| `/spec-new <name>`        | Creates the next numbered feature folder with a draft `spec.md`                 |
| `/spec-plan <NNN>`        | Writes `plan.md` for an approved spec                                           |
| `/spec-tasks <NNN>`       | Writes `tasks.md` from the plan                                                 |
| `/spec-implement <NNN>`   | Implements the next unchecked task(s), running tests                            |
| `/spec-verify <NNN>`      | Runs the Definition-of-Done checklist and updates docs/memory                   |
| `/spec-batch <NNN> …`     | Drafts the specs of several roadmap items at once (Status Draft, nothing more)  |
| `/factory <NNN> [flags]`  | Runs the feature's agent tasks unattended until a stop (see below)              |
| `/release <X.Y.Z>`        | Prepares a release with `npm run release:prepare` and stops before the tag      |

## Running the line (the software factory)

The factory (feature 402, [software-factory.md](software-factory.md), Constitution XII) runs Stage 4 without a
person: agents implement, test, review and commit a feature's tasks, and the line stops whenever a person must
decide. People still approve specs and plans, sign off at Verify, merge, tag and release.

**Start it.** In Claude Code, `/factory <NNN>` checks the branch and the tree, shows the next task (`--plan`),
starts the dashboard and runs the loop in the background; when the loop stops you get a desktop notification
(`scripts/factory/notify.mjs`: a Windows balloon, macOS Notification Center, else one line on stdout) and Claude
Code's own. Without a session: `npm run factory -- <NNN> [flags]` (`scripts/factory/run.mjs`).

- It runs only on the feature's branch `feat/NNN-*` with a clean working tree; otherwise it refuses and says why.
- Per task: the `implementer` agent (`claude -p`, headless) → the gates the changed files need (`gates.mjs`) → the
  `reviewer` agent (read-only, a JSON verdict) → one commit `feat(NNN): … (P2.x)` on the feature branch → the next
  task. A red gate, a rejection, or a task left unticked or without its **Result** note is retried with the
  feedback, three attempts in all. A task whose text starts "Failing tests" or "Tests first" (and doesn't say
  "then" the code) is handed over with the next task as a test-first pair, because its red check can't end a turn.
- It never pushes, merges, tags or resets.

| Flag               | Does                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `--plan`           | Prints the next task(s), the gates guessed from their files and the commit subject; runs nothing |
| `--once`           | Stops after one task is committed                                                                |
| `--budget <US$>`   | The run's budget, default 10; each agent call gets at most US$4 of what is left                  |
| `--max-turns <n>`  | Turn cap per agent call, default 40                                                              |
| `--worktree`       | Runs in `../Chitthi-wt/NNN` (see below); this checkout may be on any branch but `feat/NNN-*`     |
| `--intake 203,204` | Batch intake instead of the loop: one Draft spec per item, never committed                       |

`--worktree` makes or reuses a git worktree on `feat/NNN-*` (the branch is created from `main` if missing) and links
`node_modules`, `electron/resources/libraw` and `electron/resources/fonts` into it as junctions. It refuses when
`feat/NNN-*` is checked out in this checkout (git allows a branch in one worktree only). Every gate run, from
any line, takes a lock in the git folder (`scripts/factory/lock.mjs`), so two lines never run the Electron suites at
once. `npm run factory -- <NNN> --remove-worktree` removes the worktree (links first; the branch stays).

**Stops.** The loop ends with one of these kinds; work not yet committed is stashed
(`git stash push -u -m "factory NNN Tnnn attempt n: <kind>"`) and the stash is named in the message.

| Stop | When | You |
| --- | --- | --- |
| `waiting-on-you` | No agent task is left, but 👤 tasks or tasks with a **Status** note are | Do or answer them |
| `verify` | Only the Verify tasks (T09x) are left | `/spec-verify NNN`, then sign off |
| `spec-change` | The implementer says the spec must change, or `spec.md` / `plan.md` changed | Change the spec first ("Changing a spec mid-flight") |
| `dependency` | The implementer needs a new library, model or asset, or `package.json` dependencies changed | Licence check, decide |
| `question` | The implementer asks (`FACTORY-STOP: question: …`) | Answer, or do the task in a session |
| `retries` | The third failure of one task | Read the last feedback in the stop message |
| `budget`, `turns` | Under US$0.50 left, a call spent its share, or a call hit the turn cap | Look at the stash; run again |
| `once` | With `--once`: one task (or test-first pair) is committed | Run again for the next |
| `not-ready`, `paused`, `done`, `nothing-to-do` | Before each task's first call: needs not Done, ⏸️ on the roadmap, spec Implemented, or no open agent task (or only blocked tasks left) | — |
| `refused`, `error` | Wrong branch or dirty tree (nothing stashed); `claude` or git failed | Fix it and run again |

**Where the evidence is.** Each task's dated **Result** note in `tasks.md` quotes its gate run; each gate run is a
file in `.factory/runs/`; the loop's state (feature, task, station, phase, attempt, cost, turns, stop) is
`.factory/state.json`; the commits are on the feature branch (`git log`). `npm run factory:dashboard -- --serve`
shows all of it, with a **Loop** panel refreshed every 10 s. `.factory/` is git-ignored.

**Guardrails.** In every Claude Code session, and in the loop's headless runs, the hooks in `.claude/hooks/`
refuse what Constitution XII lists (code before an approved spec on a `feat/NNN-*` branch, force pushes, `git tag`,
`git reset --hard`, `sed -i`, Prettier on `src/`, and commands that discard work), and the Stop hook blocks a turn
once when `npm run check` fails on code it changed. `CHITTHI_FACTORY_HOOKS=off` turns them off for a session.
Headless runs may run only the commands on the allow-list in `scripts/factory/permissions.mjs` (tests, gates,
read-only git, `node scripts/…`; D-014); anything else is refused and reported to the loop.

**Writing tasks for the line** (learned on 402's first runs, T054):

- A headless run can't write `.claude/` (protected config), so a task that adds or changes a slash command, agent
  or hook is 👤 work, or puts that file in its own 👤 task. Otherwise the loop stops with `question` on it.
- Real agents stop and ask (`question`) rather than fail three times: expect `question` stops more often than
  `retries`, and answer them in the task's **Status** note or by doing the task in a session.

Other commands: `npm run factory:next [NNN]` prints, as JSON, the next task an agent may take, the 👤, stopped and
blocked tasks and whether the features this one needs are Done. `/spec-batch 203 204` (or
`npm run factory -- --intake 203,204`) drafts specs for review. `/release X.Y.Z` (or
`npm run release:prepare -- X.Y.Z`) bumps the versions, `APP_CACHE` and CHANGELOG on a clean `main` and stops
before the tag ([release.md](release.md)).
