# Chitthi's software factory

> **Status:** Part 1 describes how we work today. Part 3 is the plan: phase F8 (the dashboard) is built
> (`npm run factory:dashboard`, D-011); phases F1–F7 go through feature `402-software-factory` when it starts.
> Written 2026-10-08 against 2.8.0 + unreleased editor Phases 0–1, 201 and 202 in progress.

This document puts three things in one place: the spec-driven setup we use today (Part 1), what a software factory
is (Part 2), and how we turn the first into the second (Part 3). Part 4 is the dashboard; Part 5 lists other ways to
manage the work.

---

## Part 1 — The spec-driven setup we use today

### 1.1 Why

AI agents start every session with no memory, and a feature like a multi-track timeline spans many sessions. The
spec-driven setup (D-001, 2026-10-06) keeps the **what**, the **how**, the **progress** and the **lessons** in files
in the repository, so any agent or person can stop and pick up again without losing anything.

### 1.2 The five stages

```
 Vision / roadmap item
        │
        ▼
 1. SPECIFY ──► 2. PLAN ──► 3. TASKS ──► 4. IMPLEMENT ──► 5. VERIFY ──► Done (roadmap ✔️)
    spec.md       plan.md      tasks.md     code + tests      Definition of Done
    👤 approves    👤 approves                 one task at a time  all gates, docs, memory
```

| Stage | File | What it holds | Gate to leave the stage |
| --- | --- | --- | --- |
| Specify | `spec.md` | User stories, numbered acceptance criteria (`AC-n`, each naming its test type), out of scope, open questions | A person sets `Status: Approved`; no `[NEEDS CLARIFICATION]` left |
| Plan | `plan.md` | Files, interfaces, risks, a test for every AC, the **Constitution check** | A person approves; no new dependency without `tech-stack.md` + licence check |
| Tasks | `tasks.md` | Ordered tasks of ≤ ~1 hour, each with files and its proving test; `[P]` parallel; 👤 for a person; AC coverage table | Every AC covered by a task |
| Implement | code + tests | Test first; one task at a time; a dated **Result** note under each ticked task | `npm run check` (+ that area's e2e, self-test, MCP as needed) green |
| Verify | spec, docs, memory | Every Definition-of-Done gate; every AC ticked only with proof | Spec `Implemented`, roadmap ✔️, memory updated |

Full rules: [workflow.md](workflow.md). The non-negotiables and the 10-point Definition of Done:
[constitution.md](constitution.md).

### 1.3 The files

| Where | What | Who writes |
| --- | --- | --- |
| `CLAUDE.md` | How an agent starts a session, commands, architecture, things that bite | People (agents propose) |
| `specs/constitution.md` | Principles I–XI and the Definition of Done | People, versioned |
| `specs/workflow.md`, `specs/templates/` | The process and the three templates | People |
| `specs/vision/` | Multi-release initiatives (editor roadmap, work items P2.x, P3.x) | Agents draft, people approve |
| `specs/roadmap.md` | Every feature with its status (⬜ 📝 ✅ 🚧 ✔️ ⏸️) | Agents, at Verify |
| `specs/features/NNN-name/` | `spec.md`, `plan.md`, `tasks.md` per feature | Agents draft, people approve |
| `memory/MEMORY.md` | Current state (≤ 40 lines), read first every session | Agents, end of session |
| `memory/decisions.md` | Append-only decision log, `D-001…` | Agents and people, when decided |
| `memory/progress.md` | Session log, newest first: Done / Next / Blockers | Agents, end of session |
| `memory/learnings.md` | Gotchas that cost > 10 minutes | Agents, when found |

Numbering (D-003): `000–099` baseline, `2xx` / `3xx` the editor's work items (P2.1 → `201`), `401+` everything else.

### 1.4 The commands

| Command | Does |
| --- | --- |
| `/spec-new <name>` | Next numbered folder with a draft `spec.md` |
| `/spec-plan <NNN>` | `plan.md` for an approved spec |
| `/spec-tasks <NNN>` | `tasks.md` from the plan |
| `/spec-implement <NNN> [task]` | The next unchecked task(s), test first, gates, Result note |
| `/spec-verify <NNN>` | Every Definition-of-Done gate, AC ticks, docs and memory |

They live in `.claude/commands/` and are committed (D-005).

### 1.5 The gates

| Gate | Command | When |
| --- | --- | --- |
| Fast gate | `npm run check` (typecheck, lint, unit) ~15 s | After every task (D-004) |
| Area e2e | `npx playwright test e2e/<file>.e2e.ts` | Task changes UI or integration |
| Self-test | `npm test` (~6,100 checks, Electron) ~100 s | Task renders, exports or touches an agent tool |
| MCP | `npm run test:mcp` | Task touches IPC or the MCP server |
| Full e2e | `npm run test:e2e` (Playwright + axe, desktop + phone) | Once per spec, at Verify (D-007) |
| Build | `npm run build` (entry ≤ 350 KB, no AI code) | At Verify |
| Licences | `npm run check:licenses` | At Verify; whenever a dependency changes |
| CI | `.github/workflows/ci.yml` (all of the above + Docker) | Only for a release tag or its dry run (D-006) |

### 1.6 What works well and what doesn't

Works: nothing is lost between sessions; every task has evidence (Result notes with numbers); decisions have reasons;
people approve the **what** and the **how**, agents do the work.

Doesn't yet:

1. **A person drives every step.** Someone types `/spec-implement 202`, waits, reads, types it again.
2. **The rules are prose.** Which gates a change needs, "no feature code without an approved spec" and "don't run
   Prettier on old files" are written down, but nothing enforces them.
3. **One agent does everything**, including judging its own work. There is no independent reviewer.
4. **The state is spread over many files.** To know "what's waiting on me" you read the roadmap, five `tasks.md`
   files, `MEMORY.md` and the progress log.
5. **No numbers over time.** Gate results live in prose notes; you can't see trends, rework or waiting time.

---

## Part 2 — What a software factory is

A **software factory** builds software the way a production line builds a product: work enters at one end and leaves
the other as verified, released code, passing through fixed **stations**. Each station has a standard input, a
standard output, a quality gate and an owner. In an AI-assisted factory, most stations are worked by specialised
agents that run on their own; people sit at the decision points.

| Part of a factory | What it means |
| --- | --- |
| **Intake** | A backlog that a machine can read: items, priorities, dependencies |
| **Standard work** | Every station produces the same shape of output (templates) |
| **Stations and workers** | Narrow roles: specify, plan, implement, review, verify, document, release |
| **Quality gates** | Automated checks between stations; a failing gate stops the line (*jidoka*) |
| **Orchestrator** | Moves work from station to station; stops at human gates; retries within limits |
| **Isolation** | Each job in its own worktree or branch, so parallel jobs don't collide |
| **Andon (signals)** | When the line stops or needs a person, it says so at once |
| **Telemetry** | Throughput, lead time, rework, waiting time, gate failures: the dashboard |
| **Continuous improvement** | Every failure becomes a rule, a test or a guard (*kaizen*) |

What it is **not**: an agent that writes code without a spec, or a person replaced. A factory makes the process
repeatable and visible, and spends people's time only on decisions.

### 2.1 How Chitthi's setup maps to a factory

| Factory part | Chitthi today | Gap |
| --- | --- | --- |
| Intake | `roadmap.md`, `vision/` | Not machine-readable; dependencies between items not written down |
| Standard work | `specs/templates/` | — |
| Stations | The five stages | — |
| Workers | One general agent through `/spec-*` | No specialist agents, no independent reviewer |
| Quality gates | Six gate commands | Chosen by hand from prose rules |
| Orchestrator | A person | Nothing chains tasks or stops at human gates |
| Isolation | One feature branch | No worktrees, no parallel features |
| Andon | — | Nothing tells you the line stopped |
| Telemetry | Result notes, progress log | Not collected — **the dashboard (F8) starts this** |
| Kaizen | `learnings.md` | Learnings aren't turned into guards |

Most of the factory exists. What's missing is the automation between the stations.

---

## Part 3 — How we turn it into a factory

### 3.1 Constraints

- **Local first.** D-006: no CI on feature branches; the Electron suites need a Windows desktop session. The factory
  runs on the maintainer's machine. Moving it to CI needs a new decision amending D-006.
- **People approve specs and plans** (Constitution I). The factory drafts them and never approves them.
- **👤 tasks go to a person**, e.g. 202 T001's manual key checks, 001's hardware checks.
- **Known traps from `learnings.md`:** CRLF and LF files side by side; `sed -i` and heredocs mangle them; Prettier
  rewrites old files. The factory must not repeat them.
- **Free and open source** (Constitution V): the factory is tooling for building Chitthi, never a feature or a
  paid service.

### 3.2 The target line

```
 roadmap / vision ─► intake ─► spec-writer ─► 👤 approve ─► planner ─► 👤 approve ─► task splitter
                                                                                        │
     ┌────────────────────────── per task, in a worktree ───────────────────────────────┘
     ▼
  next.mjs ─► implementer ─► gates.mjs ─► reviewer ─► tick + Result + commit ─► next task
     │            ▲              │ red        │ reject       (👤 task, spec drift, new dependency,
     │            └──────────────┴────────────┘ ≤ 2 retries   budget spent → stop and signal)
     ▼
  verifier ─► 👤 sign-off ─► scribe (docs, memory, roadmap) ─► release station ─► 👤 tag
                                        │
                              .factory/runs/*.json ─► dashboard
```

### 3.3 Phases

Each phase is useful on its own. F1–F7 become the tasks of `402-software-factory` (spec first, as always).

**F0 — Decide and specify.** `/spec-new software-factory` → `402`. Decide: how far the factory may go alone (after
each task, each feature, or up to Verify), whether it may commit on a feature branch, the budget per run (turns,
cost), whether features may run in parallel. Log D-0xx; amend the constitution (1.1.0) with an "autonomous agents"
principle if needed.

**F1 — A machine-readable backlog.**
- Task lines get optional tags: owner (`👤` already exists), area (`area: engine | ui:editors | ipc | render | docs`)
  and dependencies (`deps: T020`). Update `templates/tasks-template.md`.
- Roadmap rows get a "Needs" column (203 needs 201, 202; 212 needs 203–211).
- `scripts/factory/next.mjs`: prints, as JSON, the next task an agent can take, plus the 👤 and blocked ones. It
  shares its parser with the dashboard (`scripts/factory/state.mjs`). Unit-tested.

**F2 — Gates as code.**
- `scripts/factory/gates.mjs`: picks gates from the changed files, the rules of `workflow.md` as a table:
  `src/engine/**` → check + self-test; `src/components/**` → check + that area's e2e; `electron/**`,
  `src/agent/**` → + MCP; `package.json` → + licences; `--verify` → the full Definition of Done.
- Each run writes `.factory/runs/<timestamp>-<feature>-<task>.json` (see §4.3), which Result notes quote and the
  dashboard shows.

**F3 — Guardrails as hooks** (`.claude/settings.json`, committed with a `.gitignore` exception, per D-005).
- *PreToolUse* on Edit/Write: refuse `src/**`, `electron/**` while the active feature's spec isn't `Approved` /
  `In Progress`.
- *PreToolUse* on Bash: refuse `sed -i` on tracked files, `prettier --write` on `src/`, `git push --force`,
  `git tag`.
- *Stop*: run `npm run check`; don't finish while it's red.
- A `.gitattributes` (or a hook) so line endings never change silently.

**F4 — Specialist agents** (`.claude/agents/*.md`, committed).

| Agent | Station | Tools |
| --- | --- | --- |
| `spec-writer` | Drafts `spec.md` from a vision work item; marks open questions | Read; write in `specs/` |
| `planner` | `plan.md`, Constitution check, licence check | Read; write in `specs/` |
| `implementer` | One task, test first, runs `gates.mjs` | All, inside its worktree |
| `reviewer` | Reads the task's diff against spec, constitution, `lld.md`; can't edit | Read, Grep, read-only Bash |
| `verifier` | Definition-of-Done gates; ticks ACs only with proof | Bash, Read, Edit for ticks |
| `scribe` | `progress.md`, `MEMORY.md`, roadmap, CHANGELOG | Edit in `memory/`, `specs/`, `CHANGELOG.md` |
| `licence-auditor` | Any new dependency against `licensing.md` | Read, Bash |

The `/spec-*` commands become thin wrappers that hand work to these agents.

**F5 — The orchestrator** (`/factory <NNN>` and `scripts/factory/run.mjs`). Loop per task: `next.mjs` →
implementer in a worktree on `feat/NNN-*` → `gates.mjs` → reviewer → tick, Result note, commit
`feat(NNN): …` (if F0 allows) → next. A red gate or a rejection retries at most twice. **Stops** at a 👤 task, any
spec divergence, a new dependency, the budget, and before Verify's sign-off. Runs headless (`claude -p`, an
allow-list of tools, `--max-turns`, a cost cap) on the maintainer's machine; can run overnight with `/loop` or a
scheduled task. Writes `.factory/state.json` (current station, task, attempt) for the dashboard, and sends a desktop
or phone notification (Andon) when it needs a person.

**F6 — Batch intake and parallel lines.** Draft specs for 203–212 from `vision/editor-implementation.md` in one
batch (all `Draft`, reviewed together). Independent features (e.g. 204 decoder pool and 208 audio) run in separate
worktrees; gate runs are serialised through a lock file because the self-test and e2e use fixed ports.

**F7 — Release station.** `/release X.Y.Z` automates [release.md](release.md): `package.json`, `APP_CACHE` in
`public/sw.js`, `docker-compose.yml`, the plugin version, CHANGELOG, then the dry run of `desktop-release.yml`.
Stops before `git tag`.

**F8 — Telemetry and the dashboard.** ✔️ First version built (Part 4). Later: gate-run trends once F2 writes runs,
lead time per stage, rework (retries), time waiting on a person.

### 3.4 Where people stay

1. Choosing and ordering the roadmap.
2. Approving every spec and every plan.
3. Manual and hardware checks (👤 tasks).
4. Any spec change mid-flight, any new dependency or licence exception.
5. Signing off Verify.
6. Tagging and publishing a release.

### 3.5 Risks

| Risk | Guard |
| --- | --- |
| Cost and runaway loops | Turn and cost caps; ≤ 2 retries; stop on any surprise |
| Flaky Electron / e2e runs stop the line | Testing rule 5: a flaky test is a bug, fixed at the root |
| The reviewer waves through its own kind of work | No Edit tool, fresh context, checks against spec and constitution |
| Line endings and formatting churn | F3 hooks and `.gitattributes` |
| Keys leaking into committed settings | `ANTHROPIC_API_KEY` from the environment only; never in `.claude/settings.json` |
| Spec drift | The orchestrator stops; the spec changes first (workflow.md, "Changing a spec mid-flight") |

---

## Part 4 — The dashboard

```bash
npm run factory:dashboard                 # writes .factory/dashboard.html and prints its path
npm run factory:dashboard -- --serve      # http://127.0.0.1:4310, re-reads the repo on every load, refreshes every 10 s
npm run factory:dashboard -- --serve 5000 # another port
```

`scripts/factory/dashboard.mjs` is read-only: it reads the repository and git, and writes only `.factory/`
(git-ignored). It has no dependencies and loads nothing from the network. The server binds to `127.0.0.1` only.

### 4.1 What it shows

| Panel | Source |
| --- | --- |
| **The line**: one column per station (Backlog, Specify, Plan, Tasks, Implement, Verify, Done) with a card per feature, its tasks and ACs done | `roadmap.md`, `specs/features/*/{spec,plan,tasks}.md` |
| **Now**: active feature, the next task an agent can take, MEMORY's Next step and blockers, branch and uncommitted files | `tasks.md`, `memory/MEMORY.md`, git |
| **Waiting on you**: draft specs to approve, `[NEEDS CLARIFICATION]`, open 👤 tasks, unticked tasks with a **Status** note (stopped mid-way) | specs, tasks |
| **Features**: table with spec status, roadmap status, tasks, ACs | as above |
| **Gate runs**: the latest runs and whether each gate passed | `.factory/runs/*.json` (empty until F2) |
| **Recent sessions** and **decisions**; learnings count; recent commits | `memory/`, git |

### 4.2 How a feature's station is worked out

| Station | When |
| --- | --- |
| Backlog | On the roadmap, no feature folder yet |
| Specify | `spec.md` is `Draft` |
| Plan | Spec `Approved`, no `plan.md` |
| Tasks | `plan.md`, no `tasks.md` |
| Implement | `tasks.md` with an unchecked task outside T09x |
| Verify | Only T09x (Verify tasks) left |
| Done | Spec `Implemented` |

A roadmap status of ⏸️ shows the card as **paused**, wherever it is on the line.

### 4.3 Gate-run file (written by F2's `gates.mjs`, read by the dashboard)

```json
{
  "at": "2026-10-08T14:03:00Z",
  "feature": "202",
  "task": "T030",
  "gates": [
    { "name": "check", "ok": true, "ms": 15200, "summary": "990 tests" },
    { "name": "e2e:editors", "ok": false, "ms": 41000, "summary": "1 failed: video edit tools › ripple" }
  ]
}
```

---

## Part 5 — Other ways to manage the work

The files in `specs/` and `memory/` stay the source of truth (D-001); anything below is a **view** or a **signal**
on top of them, never a second place where the state lives.

| Option | What it gives | Cost and fit |
| --- | --- | --- |
| **The local dashboard** (Part 4) | One page for the whole line; no accounts | Built. Best fit: local, private, no backend |
| **GitHub Projects + Issues** | A board per phase; one issue per feature, linked to its spec; automatic status from PRs | Free; a sync script (`gh`) from the roadmap. Risk: two sources of truth unless the script writes one way only |
| **GitHub milestones per release** | 2.10.0, 3.0.0, 3.1.0 with their features | Small; matches the roadmap's phases |
| **Draft PR per feature** | The PR description holds the task checklist; review happens there; CodeQL already runs on PRs | Fits D-006: CodeQL is not CI. Good place for the reviewer agent's comments |
| **Claude Code `/loop` + notifications** | The factory checks its own state every N minutes and pings you when it stops | Built into Claude Code; pairs with F5 |
| **Scheduled cloud agents (`/schedule`)** | A nightly agent that drafts specs, updates docs or runs the licence check | Can't run the Electron suites (needs a Windows desktop); fine for docs and drafts |
| **A published dashboard artifact** | The dashboard as a private claude.ai page you can open on the phone or share | Needs a publish step after each change; good for a weekly status |
| **Weekly status from the progress log** | A short summary of the week (done, next, blocked, numbers) | A script over `memory/progress.md`; zero new tools |
| **Obsidian or VS Code Markdown preview over `specs/` and `memory/`** | Links, graph view, search across decisions and specs | No change to the repo; personal choice |
| **`/graphify` over `specs/` + `memory/`** | A knowledge graph of features, decisions and the code they touch | Already installed; useful before planning a feature with many dependencies |

Recommended order: the dashboard now; a draft PR per feature with F4's reviewer posting there; a weekly status from
the progress log; GitHub Projects only if more people join.
