# 402 — Software factory: agents run the spec-driven line, people decide · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved --> (2026-10-08: maintainer chose the recommended answers, P1–P5 below)

## Approach

Everything here is developer tooling: Node scripts under `scripts/factory/`, Claude Code configuration under
`.claude/`, and docs. Nothing under `src/`, `electron/` or `public/` changes, and no npm package is added. The rule
that carries the whole design: **logic lives in small pure modules with unit tests; the parts that touch git, the
file system, Claude Code or Windows are thin wrappers around them.** The orchestrator decides from files and git,
never from what an agent says it did.

### §1 Shared reader (`state.mjs`) and the backlog command (`next.mjs`) — F1, AC-1, AC-2

- Move the readers out of `dashboard.mjs` into `scripts/factory/state.mjs` (roadmap, features, tasks, progress,
  decisions, memory, runs, loop state), each taking text in and returning data, so tests feed them fixtures. The
  dashboard keeps its output exactly (checked by rendering before and after the move).
- Task tags (optional, at the end of a task's first line, after the existing `· files: … · test: …`):
  `· area: engine | ui:<e2e file> | ipc | render | docs | tooling` and `· deps: T020, T021`. A task without tags
  depends on nothing beyond order: the next agent task is still the first unchecked one that is not 👤 and has no
  **Status** note.
- Roadmap: a new **Needs** column in the Phase 2, Phase 3 and 400+ tables (e.g. 203 needs `201, 202`; 212 needs
  `203–211`). Ranges expand. A feature is **ready** when every feature it needs is Done (spec `Implemented`).
- `node scripts/factory/next.mjs [NNN]` prints `{ feature, station, ready, next, human[], stopped[], blocked[] }`
  as JSON; with no argument it picks the active feature as the dashboard does. Exit 0 always (it only reports).

### §2 Gates as code (`gates.mjs`) — F2, AC-3, AC-4

- `gateRules` is a data table (first match adds gates; all matches accumulate):

  | Changed path | Gates |
  | --- | --- |
  | any code (`src/`, `electron/`, `scripts/`, `e2e/`, `*.config.*`, `package*.json`) | `check` |
  | `src/engine/**`, `src/data/**`, `src/agent/**`, `src/dev/**`, `src/ai/**` (not test files; T021: "components that render" can't be told from a path, so components get their e2e area) | + `selftest` |
  | `src/components/**`, `src/styles/**`, `src/state/**`, `index.html` | + `e2e:<area>` (file from the task's `area: ui:<file>` tag, else the map below) |
  | `electron/**`, `src/agent/**`, `scripts/mcp-*.mjs` | + `mcp` |
  | `package.json`, `package-lock.json` | + `licenses` |
  | `nginx/**`, `vite.config.ts` | + `build` |
  | only `specs/`, `memory/`, `docs/`, `*.md` | none |

  Area map for e2e when no tag: `components/studio/**`, `components/ig/**`, `state/video.ts` → `editors`;
  `components/Instagram*` → `instagram`; settings / AI → `instagram`; print studio → `studio`. Unknown → no e2e,
  and the run says so (the reviewer sees it).
- `--verify` = the Definition of Done: `check`, `build`, `e2e` (full), `selftest`, `mcp`, `licenses`.
- `chooseGates(paths, task)` is pure. `runGates()` runs each command, captures counts from its output with small
  per-gate parsers (Vitest "Tests N passed", Playwright "N passed / N failed / N flaky", self-test "N / M",
  MCP "passed", licences "N packages"), and writes `.factory/runs/<ISO>-<NNN>-<Tnnn>.json` (software-factory.md
  §4.3). Exit 1 if any gate failed. Changed files come from `git diff --name-only HEAD` plus untracked files.
- Gate runs take the **gate lock** (§6) so two lines never run the Electron suites at once.

### §3 Guardrails (`.claude/hooks/`, `.claude/settings.json`) — F3, AC-5 to AC-8

- `scripts/factory/rules.mjs` (pure): `editAllowed(path, branch, specStatusOf)` and `commandAllowed(command)`;
  each returns `{ ok, reason }`.
  - Edits: refuse `src/**`, `electron/**` when the branch is `feat/NNN-*` and that feature's spec is missing or
    not `Approved` / `In Progress` / `Implemented`. Other branches (fixes, chores) are allowed, as Constitution I
    allows bug fixes without a spec.
  - Commands (Bash and PowerShell): refuse `sed -i` / `sed --in-place` on anything, `prettier … --write` whose
    targets include `src/`, `git push` with `--force`, `-f`, `--force-with-lease` or a `+refspec`, `git tag`,
    `git reset --hard`, `git clean -f…`, `git checkout -- .` / `git restore .`. Split on `;`, `&&`, `||`, `|` and
    check each part, so lookalikes (`sed -n`, `git push`, `git tag -l` → allowed, read-only) answer correctly.
- `.claude/hooks/pre-tool.mjs`: reads the hook JSON from stdin, calls the rules, exits 2 with the reason on stderr
  to refuse (Claude Code shows it to the agent), else 0. Must answer in < 150 ms: reads the branch from `.git/HEAD`
  (or the worktree's gitdir), the spec status with one file read; no `git` process on the hot path.
- `.claude/hooks/stop.mjs`: if no code path is dirty (`git status --porcelain` filtered to code paths), exit 0. Else
  hash `git diff` of those paths; if the hash equals `.factory/check-ok`, exit 0; else run `npm run check`: green →
  write the hash, exit 0; red → exit 2 with the last 40 lines. Honour `stop_hook_active` (don't loop forever: the
  second refusal in a row lets the turn end and writes a **stopped** loop state instead).
- `.claude/settings.json` (committed, Q5): `PreToolUse` with matchers `Edit|Write|MultiEdit|NotebookEdit` and
  `Bash|PowerShell`; `Stop`. No permissions or keys in it.
- `.gitignore`: add `!.claude/agents/`, `!.claude/hooks/`, `!.claude/settings.json` (Q5).
- `.gitattributes`: `* text=auto` (Q9 revised); a second line marks the known binaries (`*.png`, `*.jpg`,
  `*.woff2`, `*.onnx`, `*.dng`, …) `binary` to be explicit.

### §4 Specialist agents (`.claude/agents/*.md`) — F4, AC-9, AC-10

Seven agent files with frontmatter `name`, `description`, `tools`, `model` and a body that points at the repo's own
rules rather than copying them (the constitution, workflow, testing strategy, learnings):

| Agent | Tools | Writes | Output |
| --- | --- | --- | --- |
| `spec-writer` | Read, Grep, Glob, Write, Edit | `specs/features/**/spec.md`, roadmap row | Draft spec, open questions |
| `planner` | Read, Grep, Glob, Write, Edit, Bash (read) | `plan.md` | Plan + Constitution check |
| `implementer` | All except Agent | code, tests, `tasks.md` tick + Result note | `FACTORY: done` or `FACTORY-STOP: <kind>: <why>` |
| `reviewer` | Read, Grep, Glob, Bash (read-only) | nothing | JSON verdict (§5) |
| `verifier` | Read, Grep, Glob, Bash, Edit | AC ticks, spec Status | Gate table, unproven ACs |
| `scribe` | Read, Edit, Write | `memory/`, roadmap, CHANGELOG | — |
| `licence-auditor` | Read, Grep, Glob, Bash (read-only) | nothing | Verdict per package |

The reviewer's checklist: every changed line belongs to the task's files or is justified; a test for the change
exists and was written first (task order and Result note); spec ACs it touches still hold; constitution rules that
apply to the paths (engine without React, `logError`, IPC through `ipc.cjs`, CSP in both places, data in
`src/data/`); no new dependency; no formatting churn. The five `/spec-*` commands keep their names and arguments and
say which agent does the work.

### §5 The orchestrator (`run.mjs`, `/factory`) — F5, AC-11 to AC-14

```
run(NNN, { once, budgetUsd = 10, maxTurns = 40, worktree })
  loop:
    s = next(NNN)                                   // §1
    stop if: s.next is null and s.human/stopped     → "waiting on you"
             station is Verify                      → "ready for sign-off"
             feature not ready (needs)              → "blocked by …"
    for attempt in 1..3:
      implementer: claude -p --agent implementer --output-format stream-json --verbose
                   --max-turns <maxTurns> --max-budget-usd <left> --permission-mode acceptEdits
                   "<task prompt + last feedback>"      (stdin 'ignore'; T001: error_max_turns ends it)
      if output has FACTORY-STOP → stop with its kind (spec-change | dependency | question)
      deterministic checks: package.json deps changed → stop "dependency";
                            spec.md / plan.md changed → stop "spec-change";
                            task not ticked or no Result note → feedback, retry
      gates = runGates(changed, task)                                               // §2
      if red → feedback = failing gate summaries; continue
      review = claude -p --agent reviewer --json-schema verdict.json "<task, diff>"
      if !review.ok → feedback = review.reasons; continue
      commit "feat(NNN): <task summary> (P2.x)" on feat/NNN-*; record; break
    after the third failure → stash -u "factory NNN Tnnn attempt 3", stop "retries"
    stop if budget left < $0.50 → "budget"
    stop if once
```

- **Clean on every stop** (AC-12): a stop before a commit runs `git stash push -u -m "factory …"` and names the stash
  in the stop message and the loop state; nothing is reset or deleted.
- **Commits** (Q2, AC-14): refuse to start unless the branch is `feat/NNN-*` for this NNN and the tree is clean;
  never `push`, `merge`, `tag`. The message's work-item suffix comes from the roadmap row, e.g. `(P2.2)`.
- **Loop state** `.factory/state.json`: `{ feature, task, station, attempt, phase: implement|gates|review|commit,
  startedAt, costUsd, turns, stop?: { kind, reason, stash? } }`, written on every phase change. The dashboard shows
  it as a **Loop** panel at the top and on the feature's card (AC-13; `--serve` already refreshes every 10 s).
- **Notifications** (Q6): `notify.mjs` raises a Windows toast through PowerShell (`System.Windows.Forms.NotifyIcon`
  balloon; no module to install) and rings the terminal bell; on macOS `osascript`, elsewhere stdout only.
  `/factory` runs `run.mjs` in the background from a Claude Code session, which also sends Claude Code's push
  notification when it ends.
- **Budget** (Q3): `--max-budget-usd` per call from what's left; `total_cost_usd` from each result event adds up;
  turns per task capped at 40.
- **Permissions** (found in T041, D-014): a headless run can't answer permission prompts, so every shell command
  outside the allow-list is refused (`permission_denials` in the result). The loop passes `--permission-mode
  acceptEdits` and `--allowedTools` with, for both `Bash(…)` and `PowerShell(…)`: `npm run:*`, `npm test:*`,
  `npx vitest:*`, `npx playwright test:*`, `git status:*`, `git diff:*`, `git log:*`, `git show:*`,
  `node scripts/:*`. Everything still passes the §3 hooks. The list lives in `scripts/factory/permissions.mjs`.
- **Test-first pairs** (T041): a "failing tests" task leaves `npm run check` red, and the Stop hook won't end a turn
  on red, so the loop hands a tests task and its implementation task to the implementer together (`T010 + T011`):
  a task whose text starts "Failing tests" / "Tests first" is paired with the next task.
- **Prompts** live in `scripts/factory/prompts/*.md` (task, retry with feedback, review), filled from `next.mjs`'s
  data, so they can be read and changed without touching code.

### §6 Batch intake and parallel lines — F6, AC-15, AC-16

- `/spec-batch 203 204 205` and `run.mjs --intake 203,204,205`: one `spec-writer` run per item, each reading the
  work item in `vision/editor-implementation.md`; each ends `Status: Draft`, roadmap 📝. No plan, no code.
- `run.mjs NNN --worktree`: `git worktree add ../Chitthi-wt/NNN feat/NNN-*` (created from `main` if missing), with
  `node_modules` as a directory junction to the main checkout's (spike T002: Vite, Electron and Playwright must
  work through it; fallback `npm ci` in the worktree). Git-ignored resources the gates need are linked the same way
  (T041: `test:mcp` fails without `electron/resources/libraw`; also `electron/resources/fonts`), and the ignored
  `.claude/` files exist in a worktree only once they are committed (Q5). Removal: junctions first (T002).
- Gate lock: `<git common dir>/factory-gates.lock`, created with `open(…, 'wx')` holding `{ pid, feature, since }`;
  a lock whose pid is gone is stale and taken over; waiting is shown in the loop state ("waiting for gates: 204").
  Every gate run, from any line, takes it — the self-test and e2e use fixed ports.
- Q4: parallel runs are built and proven once (AC-16), then used only after two features ran cleanly alone.

### §7 Release station (`release.mjs`, `/release`) — F7, AC-17

- `bumpRelease(files, version, date)` (pure) returns the new text of `package.json`, `public/sw.js` (`APP_CACHE`),
  `docker-compose.yml` (image tag), `plugins/chitthi/.claude-plugin/plugin.json` and `CHANGELOG.md` (Unreleased →
  `## [X.Y.Z] — YYYY-MM-DD`, a fresh empty Unreleased above). The wrapper writes them and runs
  `npm version X.Y.Z --no-git-tag-version` for the lock file; it refuses unless on `main`, clean and the version is
  greater than the current one.
- It then prints the remaining checklist of `specs/release.md` and asks before `gh workflow run desktop-release.yml
  --ref main` (the dry run). It contains no `git tag` and no `git push`; the §3 hook refuses them anyway.

### §8 Constitution, workflow and docs — AC-18

- Constitution 1.1.0 (Q7): **XII. Agents work within the line** — agents may implement, test, review and commit on a
  feature branch within a budget; they stop at 👤 tasks, spec changes, new dependencies, repeated failures and
  Verify; people approve specs and plans, merge, tag and release; hooks enforce what can be enforced. Governance:
  MINOR bump, reason in `decisions.md`.
- `workflow.md`: a "Running the line" section (`/factory`, stops, where the evidence is). `tasks-template.md`: the
  tags. `software-factory.md`: each phase's status and the commands. `CLAUDE.md`, `build.md`,
  `testing-strategy.md` (scripts' tests run in `test:unit`), `memory-management.md` (the scribe).

### Review decisions (2026-10-08)

- **P1** Spikes T001 (headless flags, turn cap) and T002 (worktree `node_modules`) come first.
- **P2** Hooks fail open on their own crash (logged to `.factory/hook-errors.log`); `CHITTHI_FACTORY_HOOKS=off`
  turns them off for one session.
- **P3** Branches that name no feature (fixes, chores) may edit code without a spec (Constitution I).
- **P4** The first real loop run (AC-11) is on 402's own later tasks, not on 202.
- **P5** `tech-stack.md` → "Build and tooling" gets a row for the Claude Code CLI (dev tool, not shipped).

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `scripts/factory/state.mjs` | new | Readers shared by dashboard, next, run (§1) |
| `scripts/factory/state.test.mjs` | new | Parsers on fixtures (AC-1, AC-2) |
| `scripts/factory/fixtures/` | new | Copies of today's roadmap, 202 / 001 tasks, a spec, progress (frozen) |
| `scripts/factory/next.mjs` | new | Backlog command (§1) |
| `scripts/factory/gates.mjs`, `gates.test.mjs` | new | Gate choice + runner + run files (§2, AC-3, AC-4) |
| `scripts/factory/rules.mjs`, `rules.test.mjs` | new | Edit and command rules (§3, AC-5, AC-6) |
| `scripts/factory/run.mjs`, `run.test.mjs` | new | Orchestrator; the pure step decisions tested (§5) |
| `scripts/factory/notify.mjs` | new | Desktop notification (§5) |
| `scripts/factory/lock.mjs`, `lock.test.mjs` | new | Gate lock (§6) |
| `scripts/factory/release.mjs`, `release.test.mjs` | new | Release station (§7, AC-17) |
| `scripts/factory/prompts/*.md`, `verdict.schema.json` | new | Agent prompts, reviewer's output schema |
| `scripts/factory/dashboard.mjs` | modify | Use `state.mjs`; Loop panel; gate runs |
| `.claude/hooks/pre-tool.mjs`, `stop.mjs` | new | Hook wrappers (§3) |
| `.claude/settings.json` | new | Hook registration (§3) |
| `.claude/agents/*.md` (7) | new | Specialist agents (§4) |
| `.claude/commands/factory.md`, `spec-batch.md`, `release.md` | new | Commands (§5–§7) |
| `.claude/commands/spec-*.md` (5) | modify | Hand work to the agents (§4) |
| `.gitignore`, `.gitattributes` | modify / new | Q5, Q9 |
| `package.json` | modify | Scripts: `factory`, `factory:next`, `factory:gates`, `release:prepare` (no dependencies) |
| `specs/roadmap.md` | modify | **Needs** column |
| `specs/templates/tasks-template.md` | modify | Task tags |
| `specs/constitution.md` | modify | 1.1.0, principle XII |
| `specs/workflow.md`, `specs/software-factory.md`, `specs/build.md`, `specs/testing-strategy.md`, `specs/memory-management.md`, `CLAUDE.md` | modify | Docs (AC-18) |

## Data Structures & Interfaces

```js
// state.mjs
parseRoadmap(text) → [{ id, title, status, phase, needs: string[] }]
parseTasks(text)   → [{ id, done, human, text, note, area?, deps: string[] }]
parseSpec(text)    → { title, status, acDone, acTotal, clarify }
readRepo(root)     → { features, progress, decisions, memory, runs, loop, git }
nextFor(feature, features) → { feature, station, ready, next, human, stopped, blocked }

// gates.mjs
chooseGates(paths: string[], task?: { area?: string }, opts?: { verify?: boolean }) → GateName[]
runGates(gates, { feature, task }) → Run      // also writes .factory/runs/*.json
type Run = { at, feature, task, gates: [{ name, ok, ms, summary }] }

// rules.mjs
editAllowed(path, branch, specStatus: (nnn) => string | null) → { ok, reason? }
commandAllowed(command: string) → { ok, reason? }

// run.mjs (pure parts)
decide(state, event) → { action: 'implement'|'gates'|'review'|'commit'|'retry'|'stop', reason? }
parseAgentOutput(text) → { done: boolean, stop?: { kind: 'spec-change'|'dependency'|'question', why } }

// verdict.schema.json  (reviewer, via --json-schema)
{ ok: boolean, reasons: [{ rule: string, file?: string, line?: number, why: string }] }

// .factory/state.json
{ feature, task, station, attempt, phase, startedAt, costUsd, turns, stop?: { kind, reason, stash? } }
```

## Techniques

- **No new packages.** Node 24 built-ins only (`child_process`, `fs`, `http`, `crypto` for the diff hash). Vitest's
  default include already finds `scripts/**/*.test.mjs` (checked: no `test.include` in `vite.config.ts`), and
  ESLint already covers `scripts/**/*.mjs`.
- **Determinism over trust:** the orchestrator checks the tree, `tasks.md` and the gate results itself; an agent's
  "done" only ends its turn.
- **Claude Code headless** (`claude` 2.1.294): `-p`, `--agent`, `--output-format stream-json --verbose`,
  `--json-schema`, `--max-budget-usd`, `--permission-mode`, and `--max-turns` (works though unlisted in `--help`;
  T001). Results come from the final `result` event (`subtype`, `num_turns`, `total_cost_usd`,
  `structured_output`). An agent run with `--json-schema` must list `StructuredOutput` in its `tools:` (T001);
  `claude` is spawned with stdin `'ignore'` (it waits 3 s for stdin otherwise). Per-call budget ≥ US$0.50. Hooks apply to
  headless runs too (never `--bare`), so the §3 guardrails hold inside the loop.
- **Line endings:** new files are written LF; the index is LF everywhere, and `* text=auto` keeps it so. Edits to
  existing files use the Edit tool or read-normalise-write with `chr()` endings (learnings).
- **Windows first:** paths with `path.join`; commands through `spawn` with `shell: false` where possible; PowerShell
  only for the toast. Hook scripts start with plain `node` (no `npx`) to stay fast.
- **Security:** `.claude/settings.json` holds hooks only. The API key comes from the environment or Claude Code's
  own login, never a file in the repo. The dashboard stays read-only and on `127.0.0.1`.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `state.test.mjs`: fixtures of every feature folder → expected next / human / stopped / blocked; 202 → T030, T001 stopped | unit |
| AC-2 | `state.test.mjs`: tags parsed; untagged fixtures give AC-1's results; `needs` ranges; not-ready feature refused | unit |
| AC-3 | `gates.test.mjs`: ≥ 12 path sets → gate sets; `--verify` = DoD list | unit |
| AC-4 | `gates.test.mjs`: run file shape and exit code with stubbed commands; output parsers on captured real outputs; dashboard shows a run (manual, recorded) | unit + manual |
| AC-5 | `rules.test.mjs`: paths × branches × statuses; one refused edit in a live session (recorded) | unit + manual |
| AC-6 | `rules.test.mjs`: ≥ 15 commands, refused and allowed lookalikes | unit |
| AC-7 | Session with a deliberately failing test: the turn doesn't end; docs-only turn skips the check (recorded) | manual |
| AC-8 | Scratch branch: LF-edited CRLF file and CRLF-edited LF file → no ending change in `git diff --cached`; `git ls-files --eol` has no `i/crlf` (recorded) | manual |
| AC-9 | Each agent's tool list read back from `claude agents`; one run per `/spec-*` command (recorded) | manual |
| AC-10 | Scratch branch with 3 seeded bad changes + 1 good → verdicts recorded | manual measurement |
| AC-11 | `run.test.mjs` for `decide` / `parseAgentOutput`; a real run of ≥ 3 agent tasks (202's T030–T031 or 402's own later tasks), Result notes and run files checked | unit + manual measurement |
| AC-12 | `run.test.mjs`: every stop kind from `decide`; each stop triggered once for real, tree clean or stashed (recorded) | unit + manual |
| AC-13 | Dashboard during a run: loop panel within 10 s; toast on stop (recorded) | manual |
| AC-14 | `git log` / `git branch -r` after AC-11: format, branch, nothing pushed | manual |
| AC-15 | `/spec-batch` on 2–3 items in a scratch branch: drafts only (reverted after) | manual |
| AC-16 | `lock.test.mjs` (take, wait, stale); two worktrees running together, gate runs never overlap (timestamps) | unit + manual measurement |
| AC-17 | `release.test.mjs` on copies of the five files; a scratch-branch bump, reverted | unit + manual |
| AC-18 | Docs review at Verify | review |

The usual gates still apply at Verify: `npm run check`, `build`, `test:e2e`, `npm test`, `test:mcp`,
`check:licenses` — they must be unchanged, since the app doesn't change.

## Risks & Mitigations

- **No `--max-turns` in this Claude Code version** → **spike T001**: try the hidden flag; else count turns in
  `stream-json` and end the process cleanly (a stash keeps the work). Also confirm `--agent`, `--json-schema` and
  `--max-budget-usd` together in one `-p` run, and that project hooks fire in `-p` mode. **Resolved (T001):** the
  hidden flag works; hooks fire; `StructuredOutput` must be in the agent's tools.
- **Worktrees without `node_modules`** → **spike T002**: a junction to the main `node_modules`; check Vite, the
  Electron self-test and Playwright run from the worktree. Fallback: `npm ci` per worktree (slower, ~1–2 min).
- **A hook that is slow or wrong blocks every session** → rules are pure and table-tested; the wrapper fails
  *open* on its own crash (logs to `.factory/hook-errors.log`, exit 0) so a bug can't lock the maintainer out;
  `CHITTHI_FACTORY_HOOKS=off` turns them off for one session.
- **The Stop hook loops** → `stop_hook_active` handling and the hash cache; second refusal ends the turn and
  records a stop.
- **Agents game the review** (e.g. tick without a test) → the orchestrator checks the tick, the Result note, the
  gate run and the diff itself; the reviewer has no Edit tool and a fresh context per task.
- **Cost** → per-call `--max-budget-usd`, run budget US$10 default, ≤ 3 attempts, turn cap.
- **Parsing drift** (templates change and the parsers break) → fixtures are copies of real files; a template change
  updates the fixtures in the same task.
- **Toast needs a desktop session** → falls back to the bell and stdout; the dashboard shows the stop anyway.
- **`/factory` launched on the wrong branch or a dirty tree** → refuses to start, says why.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | 402 Approved (D-012); the hooks enforce this principle for later features |
| II. Test-gated delivery | ✅ | Every rule, parser and decision is unit-tested; manual ACs recorded as Result notes |
| III. Small dependencies | ✅ | No new package; Node built-ins only. ⚠️ Uses the Claude Code CLI already installed as a dev tool (not shipped, not in `package.json`); `tech-stack.md` → "Build and tooling" gets a row saying so |
| IV. Memory maintained | ✅ | The scribe agent and the loop's Result notes keep `memory/` current; decisions D-011, D-012 |
| V. Free and open source | ✅ | Tooling for building Chitthi; the app, its features and licence are untouched |
| VI. On device, no backend | ✅ | The app makes no new network call. The tooling calls the Anthropic API from the maintainer's machine, as Claude Code already does; no new destination in either CSP |
| VII. Permissive licences | ✅ | Nothing shipped is added; `check:licenses` unchanged |
| VIII. WYSIWYG, one code path | ✅ | No rendering change |
| IX. Secure desktop shell | ✅ | `electron/` untouched; fuses unchanged |
| X. Budgets and accessibility | ✅ | Entry chunk unchanged. The dashboard (dev only) keeps light/dark, 390 px without sideways scroll |
| XI. Agents use the same code | ✅ | No user-facing feature, so no agent tool; the loop drives the same `/spec-*` commands people use |
| XII. Agents work within the line (new, 1.1.0) | ✅ | Added by this feature (§8) |
