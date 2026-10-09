---
description: Create the next numbered feature folder with a draft spec (feature.json)
argument-hint: <feature-name> [short description]
---

Create a new feature spec for: $ARGUMENTS

1. Read `memory/MEMORY.md`, `specs/roadmap.json`, `specs/workflow.md` and `specs/constitution.md`. Use the feature's
   number from the roadmap if it is listed; otherwise the next free number in the right phase range.
2. Run `npm run specs -- new NNN <kebab-name> "<title>"` (add `--phase <id>` if the number isn't on the roadmap): it
   creates the folder and `feature.json` with a spec skeleton, sets the roadmap item to 📝 and generates `spec.md`.
3. Write the spec **in `feature.json`** (`spec`; shape in `specs/schema/feature.schema.json`): `summary`, `stories`,
   `criteria` (testable, numbered `AC-1…`, each with its `proof` and concrete numbers; WHAT/WHY only — no
   implementation details), the Non-Functional Requirements and Out of Scope sections, and `questions` (anything
   ambiguous, `open: true`, with a proposed answer in the text), and a `changelog` line. Keep `status: "draft"`.
   `spec.md` is regenerated on every save (hook); never edit it.
4. Run `npm run specs:check`. Update "Current State" in `memory/MEMORY.md`.
5. Stop and list the open questions for the user. Do NOT write a plan or code.
