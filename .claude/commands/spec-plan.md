---
description: Write the plan (feature.json plan) for an approved feature spec
argument-hint: <NNN>
---

Write the implementation plan for feature $ARGUMENTS.

1. Open `specs/features/$ARGUMENTS-*/feature.json`. If `status` is not `approved` or any question is still `open`,
   stop and ask the user.
2. Read `specs/constitution.md`, `specs/architecture.md`, `specs/tech-stack.md`, `specs/testing-strategy.md`, and
   `memory/learnings.md`, then the code the feature will touch.
3. Write the plan **in `feature.json`** (`plan`; shape in `specs/schema/feature.schema.json`, headings as in
   `specs/templates/plan-template.md`): `header` (spec link and plan status), `sections` in order — Approach
   (numbered §1, §2…), Files (`files` data), Data Structures & Interfaces, Techniques, Test Approach (a test for every
   AC), Risks & Mitigations (`risks` data, a spike task for any risky unknown), Constitution Check (`constitution`
   data, one row per principle). `plan.md` is regenerated on save; never edit it.
4. If a new dependency (library, model, binary, font, asset) is needed, check it against `specs/licensing.md` first,
   then propose the `specs/tech-stack.md` change and a `memory/decisions.md` entry — ask before adding it.
5. Run `npm run specs:check`. Stop for user review; list any points you want the user to decide.
