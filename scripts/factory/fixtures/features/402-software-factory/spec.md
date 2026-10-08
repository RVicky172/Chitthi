# 402 — Software factory: agents run the spec-driven line, people decide

**Status:** In Progress <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** Other features (400+) · **Created:** 2026-10-08 · **Owner:** RVicky172

## Summary

Chitthi is built with spec-driven development (D-001): Specify → Plan → Tasks → Implement → Verify, with the state in
`specs/` and `memory/`. Today the maintainer drives every step by hand (types `/spec-implement 202`, waits, reads,
types it again), the rules for which gates a change needs and what an agent must never do are prose only, and one
agent both does the work and judges it. [software-factory.md](../../software-factory.md) describes the target: a
**software factory** where specialist agents move work through the stations on their own, every rule that can be
checked by a machine is, and the line stops and signals whenever a person must decide. The dashboard (phase F8) is
built already (D-011). This feature is phases F1–F7: a backlog a machine can read, gates as code, guardrails,
specialist agents, the orchestrator that runs the loop, batch intake with parallel lines, and a release station.
It is developer tooling only: nothing changes in the app, its builds or what users download.

## User Stories

- **US-1:** As the maintainer, I want to start one command for a feature and have agents implement its tasks one
  after another, each tested, reviewed and recorded, so that I only spend time on decisions.
- **US-2:** As the maintainer, I want the line to stop and tell me (on screen and as a notification) whenever it needs
  me: a 👤 task, a spec that must change, a new dependency, a red gate it couldn't fix, the budget spent, or Verify's
  sign-off, so that nothing happens behind my back.
- **US-3:** As the maintainer, I want the project's rules (approved spec before code, the right gates per change, no
  mass reformatting, no force push or tag) enforced by the tooling, so that agents can't skip them by accident.
- **US-4:** As the maintainer, I want an independent reviewer to check each task against its spec, plan and the
  constitution before it is ticked, so that an agent never approves its own work.
- **US-5:** As the maintainer, I want to see on the dashboard where the loop is (feature, task, station, attempt) and
  the results of every gate run, so that I can follow it without reading logs.
- **US-6:** As the maintainer, I want draft specs for the next work items written in one batch, and independent
  features worked on in parallel, so that the roadmap moves faster without me starting each one.
- **US-7:** As the maintainer, I want a release prepared by a command (versions, cache name, CHANGELOG, dry run) and
  stopped before the tag, so that releases are repeatable and the tag stays my decision.

## Acceptance Criteria

### Backlog (F1)

- [ ] **AC-1:** For every feature folder in the repository today (000, 001, 201, 202, 401, 402), a command prints as
      JSON the next task an agent may take, the open 👤 tasks, tasks stopped with a **Status** note, and tasks whose
      listed dependencies are still open. The result for 202 today is T030 (agent), T001 (stopped), no 👤 task.
      _(unit, on fixtures copied from the real files)_
- [ ] **AC-2:** The tasks template documents optional tags for area and dependencies; tasks written without them
      (every existing `tasks.md`) still parse with the same result as AC-1. The roadmap records which features each
      Phase 2 and Phase 3 item needs, and the command refuses to offer a feature whose needs aren't Done.
      _(unit)_

### Gates as code (F2)

- [ ] **AC-3:** Given a list of changed files, the gate command chooses exactly the gates `workflow.md` asks for: a
      table of at least 12 cases (engine only, a component with its e2e file, `electron/`, `src/agent/`,
      `package.json`, docs only, mixed) gives the expected set. `--verify` runs every Definition-of-Done gate.
      _(unit)_
- [ ] **AC-4:** Each gate run writes one JSON file in the format of software-factory.md §4.3 (time, feature, task,
      each gate's name, pass/fail, duration, a one-line summary with the counts), and the dashboard shows it within
      one refresh. A failing gate makes the command exit non-zero. _(unit for the file; manual check on the
      dashboard)_

### Guardrails (F3)

- [ ] **AC-5:** An agent's attempt to edit a file under `src/` or `electron/` is refused, with the reason, while the
      feature named on the branch (`feat/NNN-*`) has no spec at `Approved` or `In Progress`; editing `specs/`,
      `memory/` and docs is always allowed. _(unit for the decision; a manual check in a Claude Code session)_
- [ ] **AC-6:** These shell commands from an agent are refused with the reason: `sed -i` on a tracked file,
      Prettier writing under `src/`, `git push --force` (any form), `git tag`, `git reset --hard`. A table of at
      least 15 commands (refused and allowed lookalikes such as `git push`, `sed -n`) gives the expected answer.
      _(unit)_
- [ ] **AC-7:** An agent can't end its turn while `npm run check` fails on code it changed: it is told the failure
      and continues. A turn that changed only docs doesn't run the check. _(manual check, recorded)_
- [ ] **AC-8:** The repository keeps storing every text file with LF on any machine, whatever its git settings: a
      file edited to LF in a CRLF working copy, and one edited to CRLF in an LF one, both commit with no line-ending
      change (`git diff --cached` empty for endings), and `git ls-files --eol` shows no `i/crlf`.
      _(manual check, recorded)_

### Specialist agents (F4)

- [ ] **AC-9:** There are agents for the stations of software-factory.md §3.3 F4 (spec writer, planner,
      implementer, reviewer, verifier, scribe, licence auditor), each limited to its tools; the reviewer and the
      licence auditor can't edit files. The `/spec-*` commands use them and keep their names and arguments.
      _(manual check: each agent's tool list; one run per command)_
- [ ] **AC-10:** The reviewer rejects a change that breaks a rule: proven with at least 3 seeded bad changes in a
      scratch branch (code with no test, a change outside the task's files that breaks a spec AC, React imported into
      `src/engine/`), each rejected with a reason naming the rule; and it accepts one correct change.
      _(manual measurement, recorded)_

### The orchestrator (F5)

- [ ] **AC-11:** One command runs a feature's agent tasks in order: for each, implement → gates → review → tick with
      a dated **Result** note quoting the gate run → next. Proven on a real feature with at least 3 agent tasks run
      without a person, each Result note written and each gate run recorded. _(manual measurement, recorded)_
- [ ] **AC-12:** The loop stops, says why and leaves the tree clean or committed (never half-edited) on each of:
      a 👤 task, a stopped task, a needed spec change, a new dependency, the third failure of one task (2 retries),
      the turn or cost budget spent, and the Verify stage (which waits for sign-off). Each stop is proven once.
      _(manual check per stop, recorded)_
- [ ] **AC-13:** While the loop runs, the dashboard shows the feature, task, station and attempt, updated within
      10 s of each change; on a stop it shows the reason, and a desktop notification is sent.
      _(manual check)_
- [ ] **AC-14:** Commits made by the loop follow the project's format (`feat(NNN): … (P2.x)`), stay on the
      feature's branch, never on `main`, and are never pushed. _(manual check of the log after AC-11)_

### Batch intake and parallel lines (F6)

- [ ] **AC-15:** One command drafts the specs of a list of roadmap items (e.g. 203–205) from the vision documents,
      each `Status: Draft` with its open questions marked; nothing is approved, planned or coded.
      _(manual check)_
- [ ] **AC-16:** Two features with no dependency between them run at the same time in separate worktrees; their gate
      runs never overlap (the self-test and e2e use fixed ports), and both finish with green gates.
      _(manual measurement, recorded)_

### Release station (F7)

- [ ] **AC-17:** One command prepares release X.Y.Z: the version in `package.json` (and its lock file), `APP_CACHE` in
      `public/sw.js`, the image tag in `docker-compose.yml`, the plugin version and a CHANGELOG section, as
      `specs/release.md` lists; it then offers the dry run and stops before `git tag`. Proven with a version bump on a
      scratch branch, reverted. _(manual check)_

### Docs

- [ ] **AC-18:** `specs/software-factory.md` (status of each phase, commands), `specs/workflow.md`,
      `CLAUDE.md` and `specs/build.md` describe the factory as built; `memory/decisions.md` records the answers to
      the open questions. _(review)_

## Non-Functional Requirements

- Tooling only: no change to `src/` behaviour, `dist/`, the desktop package, the entry-chunk budget or the licence
  check. `npm run check` stays green and under ~20 s.
- No new runtime dependency; any dev dependency passes `specs/licensing.md` first.
- Local first: runs on the maintainer's Windows machine (the Electron suites need a desktop session); no CI on feature
  branches (D-006).
- Safe: no secret (API key) is written to a committed file; the loop never pushes, tags, merges or force-anything.
- The dashboard stays read-only and offline (no network requests).

## Out of Scope

- Running the factory in GitHub Actions or a cloud runner (would amend D-006).
- Agents approving specs or plans, merging to `main`, tagging or publishing releases.
- A GitHub Projects board or any second place where status is kept.
- Changes to the app itself.
- The dashboard's first version (done, D-011); only the additions in AC-4 and AC-13 belong here.

## Open Questions

- **Q1** ✅ Accepted 2026-10-08 (maintainer: "choose best"): How far may the loop go on its own? _Proposed:_ a whole feature's agent tasks up to
  Verify, then stop for sign-off; a flag limits a run to one task.
- **Q2** ✅ Accepted 2026-10-08 (maintainer: "choose best"): May the loop commit? _Proposed:_ yes, one commit per task on the feature branch,
  never pushed (AC-14).
- **Q3** ✅ Accepted 2026-10-08 (maintainer: "choose best"): Budget per run? _Proposed:_ at most 40 agent turns per task and a cost cap per run set
  by the maintainer (default US$10), both overridable per run.
- **Q4** ✅ Accepted 2026-10-08 (maintainer: "choose best"): Parallel features (F6, AC-16) now, or later? _Proposed:_ later: build it, but run one
  feature at a time until AC-11 has run cleanly on two features.
- **Q5** ✅ Accepted 2026-10-08 (maintainer: "choose best"): The hooks and agents must be committed to be shared, but `.gitignore` ignores
  `.claude/*` except commands and skills (D-005). _Proposed:_ add `.claude/agents/`, `.claude/hooks/` and
  `.claude/settings.json` to the exceptions; personal settings stay in `settings.local.json`.
- **Q6** ✅ Accepted 2026-10-08 (maintainer: "choose best"): Notifications: which channel? _Proposed:_ a Windows desktop notification, plus Claude
  Code's push notification when it's available; nothing external.
- **Q7** ✅ Accepted 2026-10-08 (maintainer: "choose best"): Does the constitution need a principle for autonomous agents? _Proposed:_ yes, version
  1.1.0, "XII. Agents work within the line": what agents may do alone, the stops, and that people approve specs and
  plans and own releases.
- **Q8** ✅ Accepted 2026-10-08 (maintainer: "choose best"): Tests for the tooling: Vitest only runs `src/**/*.test.ts` today. _Proposed:_ include
  `scripts/**/*.test.mjs` so the parsers and gate tables run in `npm run check`.
- **Q9** ✅ Accepted 2026-10-08 (maintainer: "choose best"): Line endings (AC-8): add a `.gitattributes`, or a check that refuses changed endings?
  _Proposed:_ `.gitattributes` with `* -text` for the files as they are today (no renormalising), since mixed endings
  are already committed. **Revised 2026-10-08 (plan):** wrong premise. The index is LF for every text file
  (`git ls-files --eol`: 584 `i/lf w/crlf`, 76 `i/lf w/lf`, 105 binary); the mixed endings are only in this machine's
  working tree (`core.autocrlf=true`). `* -text` would show 584 files as changed and commit CRLF. Instead:
  `* text=auto` (what `autocrlf` does here, for every machine), no renormalising needed; AC-8 reworded.
- **Q10** ✅ Accepted 2026-10-08 (maintainer: "choose best"): Is the release station (F7) part of this feature or its own? _Proposed:_ part of
  this one, last; it can be dropped to its own feature without affecting F1–F6.

## Changelog

- 2026-10-08 — Plan approved (P1–P5); tasks written; Status In Progress.
- 2026-10-08 — Plan: Q9 revised (`* text=auto`, not `* -text`) and AC-8 reworded to match (D-012 amended). Q8
  needs no config change: Vitest's default include already finds `scripts/**/*.test.mjs`.
- 2026-10-08 — Q1–Q10 accepted as proposed (D-012); Status Approved.
- 2026-10-08 — Created from [software-factory.md](../../software-factory.md) Part 3 (F1–F7).
