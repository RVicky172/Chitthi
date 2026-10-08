# NNN — <Feature Name> · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. 👤 = a person does it (written right after the task id).
Each task lists files and the proving test.
Optional tags at the end of a task's line, read by `npm run factory:next` and the factory (software-factory.md):
`· area: engine | ui:<e2e file> | ipc | render | docs | tooling` (which gates its changes need) and
`· deps: T020, T022–T023` (tasks that must be ticked first). Without tags, tasks are done in order.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. A task stopped part-way gets a **Status (YYYY-MM-DD):** note instead and stays
unticked; the factory treats it as waiting on a person.

## Setup

- [ ] **T001** — … · files: `…` · test: `…`

## Tests First

- [ ] **T010** — Write failing tests for … · files: `tests/...`

## Core

- [ ] **T020** — Implement … · files: `src/...` · test: T010

## Integration

- [ ] **T030** — …

## Verify

- [ ] **T090** — Update `specs/architecture.md` with what this feature established.
- [ ] **T091** — Every Definition-of-Done gate green (`specs/constitution.md`); record the numbers.
- [ ] **T092** — Tick ACs in `spec.md` (Status `Implemented`), update `roadmap.md`, `memory/progress.md`,
      `memory/MEMORY.md`.

## AC coverage

| AC   | Tasks      |
| ---- | ---------- |
| AC-1 | T010, T020 |
