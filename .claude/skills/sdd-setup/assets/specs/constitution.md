# {{PROJECT_NAME}} — Constitution

> The non-negotiable principles of this project. Every spec, plan, task, and line of code must comply.
> If a change needs to break a principle, amend this document first (see "Governance & Amendments").

**Version:** 1.0.0 · **Ratified:** {{TODAY}}

---

## Mission

<!-- FILL: one or two sentences — what this project is, for whom, and what success looks like. -->

## Core Principles

### I. Spec Before Code

No feature code is written without an approved spec in `specs/features/NNN-name/`.
The flow is always **Specify → Plan → Tasks → Implement → Verify** (see `workflow.md`).
Bug fixes and refactors that do not change behavior may skip the spec but must still be logged in `memory/progress.md`.

### II. Test-Gated Delivery

- No task is "done" until its tests pass: {{GATE_RUN}}.
- Pure logic is unit-tested, test-first: write the failing test, then the code.
- Tests wait on real signals, never fixed sleeps; anything time-dependent takes time as an input so tests are
  deterministic.

### III. Simplicity and Small Dependencies

- Prefer the platform and small in-house helpers over new libraries.
- Adding a runtime dependency requires a justification in `specs/tech-stack.md` (size, license, why not
  hand-rolled) and a `memory/decisions.md` entry.
- YAGNI: build what the current roadmap phase needs, nothing more.

### IV. Memory Is Maintained

- Agents and humans keep `memory/` current: decisions, progress, and learnings (see `memory-management.md`).
- A session that changes direction or discovers a pitfall records it before ending.

<!-- FILL: project-specific principles, numbered V, VI, … Each gets a short heading and concrete, checkable rules
(e.g. "No backend: the site is static; no runtime calls to third parties", "Public API follows semver",
"p95 latency ≤ 200 ms", "Every asset has a license line in CREDITS.md"). Delete this marker when done. -->

## Quality Gates (Definition of Done)

A feature is **Done** when all are true:

1. Spec status is `Implemented` and every acceptance criterion is checked — each one proven by a test or a
   recorded measurement.
{{DOD_GATES}}
{{DOD_DOCS_N}}. `memory/progress.md`, `memory/MEMORY.md` and `specs/roadmap.md` are updated.

<!-- FILL: add project-specific gates here if any (bundle/perf budgets, no console errors in E2E, coverage
threshold, docs built…), or delete this marker. -->

## Governance & Amendments

- This constitution supersedes all other docs. Conflicts are resolved in its favor.
- Amend by editing this file in a dedicated change: bump the version (MAJOR = principle removed/redefined,
  MINOR = principle added, PATCH = wording), and record the reason in `memory/decisions.md`.
