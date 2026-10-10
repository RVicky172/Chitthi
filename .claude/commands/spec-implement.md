---
description: Implement the next task(s) of a feature
argument-hint: <NNN> [task-id]
---

Implement feature $ARGUMENTS.

1. Read `memory/MEMORY.md`, `memory/learnings.md`, and the feature's `feature.json` (or its generated `spec.md`,
   `plan.md`, `tasks.md`).
2. Take the task in progress, else the next task to do (or the one named); skip blocked ones. Run
   `npm run specs -- start NNN Txxx`. Write/adjust its test first and see it fail, then the code.
3. Run `npm run check` (and that area's e2e tests, `npx playwright test e2e/<file>.e2e.ts`, if the change affects
   UI or integration; never the full suite, which runs once in `/spec-verify`, D-007; `npm test` if it renders,
   exports or touches an agent tool; `npm run test:mcp` if it touches IPC or the MCP server). Fix until green. For an
   important test, briefly break the code to confirm the test catches it, then restore.
4. Finish it with `npm run specs -- done NNN Txxx --result "**Result (YYYY-MM-DD):** …" [--commit <hash>]` (what was
   done, numbers measured). If it needs the user (a manual check, a decision), use
   `npm run specs -- block NNN Txxx --reason "…"` instead and say so. Never tick boxes in the Markdown: it is
   generated. Record any non-obvious gotcha in `memory/learnings.md` and any decision in `memory/decisions.md`.
5. **Parallel batch (D-030):** when the next tasks include up to 3 that are independent (`[P]`, no shared files, none
   waiting on another's result), run them as a batch instead: `start` each, launch one `implementer` agent per task
   in one message (`isolation: "worktree"`), have a `reviewer` agent check each commit, cherry-pick the approved ones,
   run `npm run check` and the needed heavy checks one at a time, `done` each with its result, commit, remove the
   worktrees, and report at the batch end. Details: `specs/workflow.md` "Parallel tasks with agents".
6. Otherwise continue with the next task only if it is small and in the same area; else stop and report.
   If the code must diverge from the spec, or a result needs the user's call, stop and propose the change first.
