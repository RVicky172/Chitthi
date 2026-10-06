# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository.

## Project

**{{PROJECT_NAME}}** — <!-- FILL: one-line description (same as the constitution's mission). -->

## Start Every Session

1. Read `memory/MEMORY.md` (current state + active feature).
2. Read the newest entry in `memory/progress.md`.
3. Open the active feature in `specs/features/NNN-*/` and find the next unchecked task.
4. If the task touches principles, re-read `specs/constitution.md`.

## Spec-Driven Workflow (mandatory)

**Specify → Plan → Tasks → Implement → Verify.** Full rules: `specs/workflow.md`.

- Never write feature code without an **Approved** `spec.md`. If none exists, draft one and stop for review.
- Never plan from a spec that still has `[NEEDS CLARIFICATION]` markers — ask the user.
- Work one task from `tasks.md` at a time; tick it only after its tests pass.
- If code must diverge from the spec, update the spec (and its Changelog) first.
- Slash commands: `/spec-new`, `/spec-plan`, `/spec-tasks`, `/spec-implement`, `/spec-verify`.

## Key Docs

| Doc                         | Read when                                               |
| --------------------------- | ------------------------------------------------------- |
| `specs/constitution.md`     | Before any design decision; contains Definition of Done |
| `specs/architecture.md`     | Before touching shared code or adding a module          |
| `specs/tech-stack.md`       | Before adding any dependency                            |
| `specs/testing-strategy.md` | Before writing tests                                    |
| `specs/roadmap.md`          | Choosing what's next                                    |

## Commands

```bash
{{COMMANDS_BLOCK}}
```

`{{CHECK_CMD}}` must pass before any task is marked done.

## Memory Management (project memory in `memory/`)

Full rules: `specs/memory-management.md`.

- **Decision made** (library, pattern, spec change) → append to `memory/decisions.md` right away.
- **Gotcha found** (lost >10 min, non-obvious fix) → add to `memory/learnings.md`.
- **End of session** → add an entry to `memory/progress.md` and update "Current State" in `memory/MEMORY.md`.
- Shared project knowledge goes in `memory/` (committed). Personal agent memory is only for one user's
  preferences — never the only place a project fact lives.
- Use absolute dates. Fix or delete memory that becomes wrong.

## Git

- Commit only when asked. Conventional-style messages referencing the feature: `feat(012): add login form`.
- Run `{{CHECK_CMD}}` before committing.
