---
description: Write plan.md for an approved feature spec
argument-hint: <NNN>
---

Write the implementation plan for feature $ARGUMENTS.

1. Open `specs/features/$ARGUMENTS-*/spec.md`. If Status is not `Approved` or any `[NEEDS CLARIFICATION]` remains,
   stop and ask the user.
2. Read `specs/constitution.md`, `specs/architecture.md`, `specs/tech-stack.md`, `specs/testing-strategy.md`, and
   `memory/learnings.md`, then the code the feature will touch.
3. Create `plan.md` next to the spec from `specs/templates/plan-template.md`: approach (numbered sections), files,
   interfaces, techniques, a test for every AC, risks (with a spike task for any risky unknown), and the
   Constitution Check table.
4. If a new dependency is needed, propose the `specs/tech-stack.md` change and a `memory/decisions.md` entry — ask
   before adding it.
5. Stop for user review; list any points you want the user to decide.
