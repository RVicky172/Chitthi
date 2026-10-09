---
description: Break an approved plan into ordered, test-backed tasks (feature.json tasks)
argument-hint: <NNN>
---

Write the tasks for feature $ARGUMENTS.

1. Read the feature's `feature.json` (spec and plan; the plan must be approved; if not, stop and ask).
2. Write the tasks **in `feature.json`** (`tasks`; shape in `specs/schema/feature.schema.json`, wording as in
   `specs/templates/tasks-template.md`): `intro`, `sections` in order, and `items` — small ordered tasks (≤ ~1 h
   each), each with `text`, `section`, `status: "todo"`, `files`, `test` (the test that proves it), `covers` (the
   criteria it proves), `parallel` for `[P]`, `manual` for 👤. Tests come before or with the code. Every criterion is
   covered by at least one task (the AC coverage table in `tasks.md` is generated from `covers`).
3. Run `npm run specs -- status NNN in-progress` (spec Status, roadmap 🚧 and dates follow), then
   `npm run specs:check`. Update `memory/MEMORY.md`.
