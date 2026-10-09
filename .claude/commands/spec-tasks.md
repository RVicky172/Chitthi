---
description: Break an approved plan into ordered, test-backed tasks
argument-hint: <NNN>
---

Create `tasks.md` for feature $ARGUMENTS.

1. Read the feature's `spec.md` and `plan.md` (the plan must be approved; if not, stop and ask).
2. Using `specs/templates/tasks-template.md`, write small ordered tasks (≤ ~1 h each). Each task names its files and
   the test that proves it. Tests come before or with the code. Mark parallelizable tasks `[P]`.
3. Fill the AC coverage table: every acceptance criterion is covered by at least one task.
4. Set the spec Status to `In Progress`, the roadmap status to 🚧, and update `memory/MEMORY.md`.
