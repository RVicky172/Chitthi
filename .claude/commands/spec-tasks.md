---
description: Break an approved plan into ordered tasks: code first, the feature's tests at the end
argument-hint: <NNN>
---

Create `tasks.md` for feature $ARGUMENTS.

**Who does it:** check step 1 yourself, then hand steps 2–3 to the `planner` agent (Agent tool,
`subagent_type: "planner"`; `.claude/agents/planner.md`) with these steps as its brief. When it returns, check that
every AC is in the coverage table, then do step 4 yourself. Without the agent, do all the steps yourself.

1. Read the feature's `spec.md` and `plan.md` (the plan must be approved; if not, stop and ask).
2. Using `specs/templates/tasks-template.md`, write small ordered tasks (≤ ~1 h each). Each task names its files and
   nothing else: code tasks first, then the feature's tests in a **Tests** section before Verify (D-023). Mark
   parallelizable tasks `[P]`.
3. Fill the AC coverage table: every acceptance criterion is covered by at least one task.
4. Set the spec Status to `In Progress`, the roadmap status to 🚧, and update `memory/MEMORY.md`.
