---
description: Implement the next task(s) of a feature
argument-hint: <NNN> [task-id]
---

Implement feature $ARGUMENTS.

1. Read `memory/MEMORY.md`, `memory/learnings.md`, and the feature's `feature.json` (or its generated `spec.md`,
   `plan.md`, `tasks.md`).
2. Take the task in progress, else the next task to do (or the one named); skip blocked ones. Run
   `npm run specs -- start NNN Txxx`. Write/adjust its test first and see it fail, then the code.
3. Run `npm run check` (typecheck, lint, unit tests) and fix until green. Nothing heavier: e2e, `npm test`,
   `test:mcp` and timing runs are written and run in the phase's test pass (`x90`, D-033). For an important test,
   briefly break the code to confirm the test catches it, then restore.
4. Finish it with `npm run specs -- done NNN Txxx --result "**Result (YYYY-MM-DD):** …" [--commit <hash>]` (what was
   done, numbers measured). If it needs the user (a manual check, a decision), use
   `npm run specs -- block NNN Txxx --reason "…"` instead and say so. Never tick boxes in the Markdown: it is
   generated. Record any non-obvious gotcha in `memory/learnings.md` and any decision in `memory/decisions.md`.
5. Work one task at a time in this session; no implementer / reviewer agent batches unless the maintainer asks for
   them (D-033).
6. Continue with the next task only if it is small and in the same area; else stop and report.
   If the code must diverge from the spec, or a result needs the user's call, stop and propose the change first.
