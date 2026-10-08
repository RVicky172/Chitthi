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
2. Take the next unchecked task (or the one named). Write/adjust its test first and see it fail, then the code.
3. Run `npm run check` (and that area's e2e tests, `npx playwright test e2e/<file>.e2e.ts`, if the change affects
   UI or integration; never the full suite, which runs once in `/spec-verify`, D-017; `npm test` if it renders,
   exports or touches an agent tool; `npm run test:mcp` if it touches IPC or the MCP server). Fix until green. For an important test, briefly break the code to confirm the test catches
   it, then restore.
4. Tick the task in `tasks.md` with a short dated **Result** note (what was done, numbers measured). Record any
   non-obvious gotcha in `memory/learnings.md` and any decision in `memory/decisions.md`.
5. Continue with the next task only if it is small and in the same area; otherwise stop and report.
   If the code must diverge from the spec, or a result needs the user's call, stop and propose the change first.
