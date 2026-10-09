---
description: Implement the next unchecked task(s) of a feature
argument-hint: <NNN> [task-id]
---

Implement feature $ARGUMENTS.

**Who does it:** for each task, hand steps 1–4 to the `implementer` agent (Agent tool,
`subagent_type: "implementer"`; `.claude/agents/implementer.md`), naming the task. It ends with `FACTORY: done` or
`FACTORY-STOP: <kind>: <why>`. On `done`, run the `reviewer` agent (`subagent_type: "reviewer"`) on the change; if it
rejects, give its reasons to the implementer once and review again. On a stop or a second rejection, stop and report
to the user (step 5). Never commit. The unattended version of this loop is `/factory` (`scripts/factory/run.mjs`).
Without the agents, do the steps yourself.

1. Read `memory/MEMORY.md`, `memory/learnings.md`, and the feature's `spec.md`, `plan.md`, `tasks.md`.
2. Take the next unchecked task (or the one named). Write the code (build first: no new tests unless the task is in the **Tests** section; D-023).
3. Run `npm run check` (and `npm run build` if the change touches the build). Fix until green. No e2e, self-test
   or MCP run per task: they run in the Tests section and in `/spec-verify` (D-023, D-017).
4. Tick the task in `tasks.md` with a short dated **Result** note (what was done, numbers measured). Record any
   non-obvious gotcha in `memory/learnings.md` and any decision in `memory/decisions.md`.
5. Continue with the next task only if it is small and in the same area; otherwise stop and report.
   If the code must diverge from the spec, or a result needs the user's call, stop and propose the change first.
