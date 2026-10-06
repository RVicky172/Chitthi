---
description: Create the next numbered feature folder with a draft spec.md
argument-hint: <feature-name> [short description]
---

Create a new feature spec for: $ARGUMENTS

1. Read `memory/MEMORY.md`, `specs/roadmap.md`, `specs/workflow.md` and `specs/constitution.md`. Use the feature's
   number from the roadmap if it is listed; otherwise the next free number in the right phase range.
2. Create `specs/features/NNN-<kebab-name>/spec.md` from `specs/templates/spec-template.md`.
3. Fill in summary, user stories, and testable acceptance criteria with concrete numbers (WHAT/WHY only — no
   implementation details). Mark anything ambiguous as a numbered open question with `[NEEDS CLARIFICATION]` and a
   proposed answer.
4. Set `Status: Draft`, set the roadmap status to 📝, and update "Current State" in `memory/MEMORY.md`.
5. Stop and list the open questions for the user. Do NOT write a plan or code.
