---
name: sdd-setup
description: Set up spec-driven development (SDD) in a project — a `specs/` folder (constitution with a Definition of Done, workflow, roadmap, spec/plan/tasks templates), a committed `memory/` folder (current state, decision log, progress log, learnings), the `/spec-new`, `/spec-plan`, `/spec-tasks`, `/spec-implement`, `/spec-verify` slash commands, and a CLAUDE.md section that enforces Specify → Plan → Tasks → Implement → Verify. Use this whenever the user wants to set up, bootstrap, scaffold or add SDD / spec-driven development / spec-first workflow / a spec kit / "specs and memory like my other project" to a new or existing repository, wants Claude to keep durable project memory across sessions, or asks for slash commands that drive features from spec to verified code — even if they misspell it ("ssd", "spec driven") or only say "set up the workflow for this repo".
---

# SDD setup

Installs a lightweight spec-driven development system into a repository. Every feature becomes a numbered folder
(`specs/features/NNN-name/`) that moves through five gated stages — **spec.md** (what/why, testable acceptance
criteria) → **plan.md** (how) → **tasks.md** (small test-backed steps) → implementation → verification against a
Definition of Done. A committed `memory/` folder lets any later session (or person) pick up where the last stopped.

The system was battle-tested on a real project; the templates in `assets/` carry its conventions. Your job is to
fit it to _this_ project: its stack, its commands, its constraints. Generic boilerplate that names commands the
project doesn't have is worse than nothing, because later sessions will trust it.

## What gets created

```
specs/
  README.md             index of the docs below
  constitution.md       mission, non-negotiable principles, Definition of Done (quality gates)
  workflow.md           the five stages, gates, numbering, changing a spec mid-flight
  roadmap.md            phases → numbered features with status
  tech-stack.md         approved technologies + rejected alternatives
  architecture.md       structure, contracts, conventions (grows with each feature)
  testing-strategy.md   test layers, rules, commands
  memory-management.md  how memory/ is kept
  templates/{spec,plan,tasks}-template.md
  features/             (empty; /spec-new fills it)
memory/
  MEMORY.md             ≤ 40-line index + "Current State" — read first every session
  decisions.md          append-only decision log (D-001 …)
  progress.md           session log, newest first
  learnings.md          gotchas and non-obvious fixes
.claude/commands/spec-{new,plan,tasks,implement,verify}.md
CLAUDE.md               gains a "Start every session / Spec-driven workflow / Memory" section
```

## Steps

### 1. Inspect the project first

Read before asking, so you only ask what the repo can't tell you:

- Is it empty/new or an existing codebase? Look at the top-level files, README, and a sample of the source.
- Stack and commands: `package.json` scripts, `pyproject.toml`/`setup.cfg`/`tox.ini`, `Makefile`, `go.mod`,
  `Cargo.toml`, `*.csproj`, CI workflows (`.github/workflows/*`). Work out the real commands for: the fast gate
  run after every task (typecheck + lint + unit tests), unit tests alone, E2E/integration tests (if any), build,
  format.
- Existing pieces: `CLAUDE.md`, `AGENTS.md`, `.claude/commands/`, `specs/`, `docs/adr`, `memory/`. Never clobber
  these — the scaffold script skips existing files, and you merge by hand afterwards.

If the fast gate needs several commands and there's no single script for it, suggest adding one (e.g. an npm
`check` script, a `make check` target) — a single named command is what makes "run the gate before ticking a task"
stick. Ask before editing build files.

### 2. Ask only what's missing

One short round of questions, with your proposed defaults filled in so the user can just say "yes". Typically:

1. **Mission** — one or two sentences: what the project is and for whom (draft it from the README if there is one).
2. **Project-specific principles** — the non-negotiables beyond the generic ones (e.g. "no backend", "offline
   first", "public API is semver-stable", performance or bundle budgets, accessibility, licensing of assets).
   Propose 2–5 from what you saw in the code.
3. **Quality gate commands** — confirm what you detected (fast gate, E2E, build). If there are no tests yet, the
   first roadmap feature should add them; say so.
4. **Roadmap** — phases and first features, or "just a Phase 0 to start". For an existing codebase, propose a
   `000` baseline that records what already exists.

If the user wants it fast ("just set it up"), use your defaults and list them in the final report instead.

### 3. Scaffold

Write a values file and run the script (it copies `assets/` into the project, fills `{{PLACEHOLDERS}}`, and never
overwrites an existing file):

```bash
python <skill-dir>/scripts/scaffold.py --target <project-root> --values <values.json> [--dry-run]
```

`values.json` (all strings; omit `E2E_CMD` / `BUILD_CMD` if the project has none — the script drops those gates):

```json
{
  "PROJECT_NAME": "Acme API",
  "TODAY": "2026-10-06",
  "CHECK_CMD": "npm run check",
  "TEST_CMD": "npm test",
  "E2E_CMD": "npm run test:e2e",
  "BUILD_CMD": "npm run build",
  "FORMAT_CMD": "npm run format"
}
```

The script prints what it created, what it skipped because it already existed, and where `CLAUDE.md` content
went (a new `CLAUDE.md`, or `CLAUDE.sdd-section.md` next to an existing one for you to merge).

### 4. Fill in the project-specific parts

The templates contain `<!-- FILL: … -->` markers where only you can write the content. Replace every one with real,
specific text for this project — and delete the marker. In particular:

- **constitution.md** — mission; the project-specific principles from step 2 (numbered after the generic ones,
  each with concrete, checkable rules); any project-specific Definition-of-Done gates (budgets, no console errors…).
- **tech-stack.md** — the actual languages, frameworks, test tools, package manager, hosting; rejected alternatives
  if known. Empty rows are fine for a brand-new project; invented ones are not.
- **architecture.md** — for an existing codebase, a real directory map and the main modules/contracts you read in
  step 1. For a new project, a short "to be defined by 000" note.
- **testing-strategy.md** — the real test layers, locations and commands.
- **roadmap.md** — the phases and features agreed in step 2, numbered by range (e.g. `000–009` foundation,
  `010–019` phase 1…); keep `workflow.md`'s numbering line consistent with it.
- **memory/decisions.md** — `D-001 — Adopt spec-driven development` is pre-filled; add entries for any real
  decisions the user stated (stack choices, principles).
- **memory/MEMORY.md** — "Current State": phase, what exists, the next step (usually `/spec-new 000-…`).
- **CLAUDE.md** — merge the SDD section into an existing file: keep the user's content, add the session-start
  routine, workflow rules, key-docs table, commands and memory rules; remove duplicates. If the project uses
  `AGENTS.md` for other agents, add a one-line pointer there too.

Also adjust the slash commands if the stack calls for it (e.g. a library with no E2E layer: drop the E2E mention in
`spec-implement.md`). They should name the project's real commands.

### 5. Check your work

```bash
python <skill-dir>/scripts/scaffold.py --target <project-root> --check
```

This lists any leftover `{{…}}` placeholders or `<!-- FILL` markers. Fix until it reports none. Then re-read
`constitution.md` and `CLAUDE.md` once with fresh eyes: would a new session, reading only these, know exactly what
to run before ticking a task and what "done" means? Don't commit unless the user asks.

### 6. Report

Tell the user, briefly: what was created vs. skipped/merged, the gate commands wired in, the defaults you chose
without asking, and how to start — `/spec-new <feature>` drafts the first spec, then `/spec-plan`, `/spec-tasks`,
`/spec-implement`, `/spec-verify`. Mention that the commands appear after Claude Code restarts or reloads if they
don't show up immediately.

## Conventions the templates encode (keep them when customising)

These came from real use; each prevents a failure that actually happened:

- **Gates between stages.** No plan from a spec with `[NEEDS CLARIFICATION]`; no code without an Approved spec.
  The agent stops and asks at each gate instead of running ahead.
- **Spec changes go first.** If code must diverge, update `spec.md` (+ its Changelog) and log a decision before
  writing the code — so the spec stays the source of truth.
- **One task at a time, ticked only when its test passes**, with a short dated "Result" note under the task
  (numbers, what was measured, what was fixed). These notes become the evidence `/spec-verify` checks.
- **Prove tests can fail.** For important tests, briefly break the code ("sabotage") and confirm the test fails,
  then restore it.
- **Tick only proven acceptance criteria** at verify time, and report flaky or skipped checks honestly.
- **Memory is committed and short.** `MEMORY.md` ≤ 40 lines with absolute dates; decisions append-only; learnings
  only for things that cost real time. Personal agent memory is never the only home of a project fact.
