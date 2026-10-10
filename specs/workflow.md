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

## One JSON per feature

A feature is written as data from the start (feature 404, D-026). `specs/features/NNN-name/feature.json` holds the
**spec** (summary, user stories, criteria, questions, other sections, changelog), the **plan** (sections, files,
risks, constitution check) and the **tasks** (each with a status: `todo`, `in-progress`, `blocked`, `done`; its
files, test, the criteria it `covers`, dates, commits and notes). `specs/roadmap.json` holds the phases, items,
statuses, dependencies (`needs`) and backlog. Shapes: `specs/schema/*.schema.json` (editors complete and check them);
collections are `{ "order": [ids], "byId": { … } }`.

`spec.md`, `plan.md`, `tasks.md` and `roadmap.md` are **generated** from the JSON and never edited. Nobody runs a
sync step: the CLI regenerates after each change, a Claude Code hook regenerates after any edit to a JSON file (and
refuses edits to the generated Markdown), and `npm run roadmap` does the same for hand edits while it runs.
`npm run check` fails if a generated file is out of date or the JSON is invalid.

| Command | Does |
| --- | --- |
| `npm run specs -- new NNN <name> "<title>"` | folder, `feature.json` with a spec skeleton, roadmap item 📝 |
| `npm run specs -- status NNN <status>` | `draft`, `approved`, `in-progress`, `implemented`, `superseded`: roadmap status and dates follow |
| `npm run specs -- start NNN Txxx` | task in progress |
| `npm run specs -- block NNN Txxx --reason "…"` | task waits for someone |
| `npm run specs -- done NNN Txxx --result "…" [--commit <hash>]` | task done (or `AC-n` proven) |
| `npm run specs -- undone NNN Txxx` | task back to do (or `AC-n` unticked) |
| `npm run specs:check` | part of `npm run check` |
| `npm run roadmap` | the dashboard on http://localhost:5180: roadmap, and a kanban board per feature |

## Stage 1 — Specify (`spec.md`)

`npm run specs -- new`, then write the `spec` part of `feature.json` (headings as in `templates/spec-template.md`).
Describe **what** and **why**, never **how**:
user stories, acceptance criteria (testable, numbered `AC-1…`, each naming the test type that proves it),
out-of-scope, open questions. Set `Status: Draft`. A human reviews and approves it:
`npm run specs -- status NNN approved`.
**Gate:** no `[NEEDS CLARIFICATION]` markers remain; every AC is testable.

## Stage 2 — Plan (`plan.md`)

Write the `plan` part of `feature.json` (headings as in `templates/plan-template.md`). Describe **how**: files touched, interfaces, techniques, risks, a test for every
AC, and a **Constitution check** (each principle: ✅ / ⚠️ with justification). A human approves it.
**Gate:** constitution check passes; no new dependency without a `tech-stack.md` update.

## Stage 3 — Tasks (`tasks.md`)

Write the `tasks` part of `feature.json` (wording as in `templates/tasks-template.md`). Break the plan into small ordered tasks (≤ ~1 hour each), each naming the files
it touches and the test that proves it. Tests are written **before or with** the code they cover. Mark tasks that
can run in parallel with `[P]`. Every AC is covered by at least one task (AC coverage table).

## Stage 4 — Implement

Work one task at a time. After each task:

1. Run `npm run check` (and that area's e2e tests, `npx playwright test e2e/<file>.e2e.ts`, if the change affects
   UI or integration; never the full suite, which runs once in Stage 5, D-007; `npm test` if it renders,
   exports or touches an agent tool; `npm run test:mcp` if it touches IPC or the MCP server). Fix until green.
2. Finish the task with `npm run specs -- done NNN Txxx --result "**Result (date):** …"` (what was done, what was
   measured, anything surprising); `start` it when you begin, `block` it with a reason when it needs someone. These
   notes are the evidence Stage 5 checks.
3. Record decisions in `memory/decisions.md` and gotchas in `memory/learnings.md` as they happen.

For an important test, prove it can fail: break the code briefly, see the test fail, restore.

### Parallel tasks with agents (D-030)

Independent tasks run in **batches** of up to **3 implementer agents** (`.claude/agents/implementer.md`), each in its
own git worktree, with a **reviewer agent** (`.claude/agents/reviewer.md`) checking each result before it is merged.
The main session is the **orchestrator**: it alone changes `feature.json`, `memory/` and the feature branch.

1. **Pick the batch:** the next tasks that don't depend on each other's results and don't edit the same files (`[P]`
   tasks, or a test-first pair given whole to one agent). A task that depends on another, a single task with no
   partner, a 👤 task, or a change to tracking files is done inline by the orchestrator, as before.
2. `npm run specs -- start NNN Txxx` for each, then start the implementers in **one message** (Agent tool,
   `isolation: "worktree"`), each with its task text, files, proving test and the plan section it implements.
3. As each finishes, a reviewer checks its commit. CHANGES go back to the same implementer once (SendMessage); a
   second CHANGES is fixed inline by the orchestrator.
4. **Merge** the approved commits into the feature branch one by one (cherry-pick), resolving conflicts.
5. Run `npm run check` once, then the heavy checks the batch needs, **one at a time** (`npm test`, the area's e2e,
   `test:roadmap`, `test:mcp`, timing runs): they share ports and caches and timings skew when they overlap.
6. `npm run specs -- done NNN Txxx --result "…"` for each (from the implementer's result note and the orchestrator's
   checks), commit, and remove the worktrees (`cmd /c rmdir <worktree>\node_modules` first: it is a junction, then
   `git worktree remove`).
7. **Report at the batch end** only: what was done, checks, anything that needs the user. Manual tasks, approvals,
   pushes and anything outward-facing still wait for the user.

## Stage 5 — Verify

Run every gate in the Definition of Done (`constitution.md`): `npm run check`, `npm run test:e2e`, `npm run build`,
`npm test`, `npm run test:mcp`, `npm run check:licenses`. Then:

- Check each AC against its test or measurement; tick only the proven ones (`npm run specs -- done NNN AC-n`).
  Then `npm run specs -- status NNN implemented` (spec, roadmap and dates follow).
- Add a `memory/progress.md` entry, refresh "Current State" in `memory/MEMORY.md`.
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

Shortcuts in `.claude/commands/`:

| Command                 | Does                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `/spec-new <name>`      | Creates the next numbered feature folder with a draft `spec.md` |
| `/spec-plan <NNN>`      | Writes `plan.md` for an approved spec                           |
| `/spec-tasks <NNN>`     | Writes `tasks.md` from the plan                                 |
| `/spec-implement <NNN>` | Implements the next task(s), running tests; independent tasks as a parallel batch |
| `/spec-verify <NNN>`    | Runs the Definition-of-Done checklist and updates docs/memory   |
