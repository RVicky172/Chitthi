# Agent Memory Management

AI agents (Claude Code and others) start every session with no recollection of previous ones.
This project keeps **durable, version-controlled memory** in the repo so any agent — or human — can pick up where
the last session stopped.

## Memory Layers

| Layer                     | Where                                                      | Scope                          | Who writes it                | Committed?       |
| ------------------------- | ---------------------------------------------------------- | ------------------------------ | ---------------------------- | ---------------- |
| **Rules**                 | `CLAUDE.md`, `specs/constitution.md`                       | How to work; non-negotiables   | Humans (agent proposes)      | Yes              |
| **Specs**                 | `specs/`                                                   | What to build and why          | Agent drafts, humans approve | Yes              |
| **Project memory**        | `memory/`                                                  | Decisions, progress, learnings | Agent + humans               | Yes              |
| **Personal agent memory** | the agent's per-user memory (e.g. Claude Code auto-memory) | One user's preferences         | The agent                    | No (per-machine) |
| **Session context**       | The conversation                                           | One session only               | —                            | No               |

Rule of thumb: if the **next agent on a different machine** would need it, it belongs in `memory/` or `specs/`,
not in personal memory.

## The `memory/` Folder

| File           | Purpose                                                                            | Write when…                                                  |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `MEMORY.md`    | Index + "current state" snapshot (≤ 40 lines). Read first every session.           | Current focus changes                                        |
| `decisions.md` | Append-only decision log (ADR-lite): context, decision, alternatives, consequences | Choosing a library, pattern, or changing a spec/constitution |
| `progress.md`  | Reverse-chronological session log: what was done, what's next, blockers            | End of every working session                                 |
| `learnings.md` | Gotchas and non-obvious facts (library quirks, test tricks, perf findings)         | You lost >10 min to something, or found a non-obvious fix    |

## Session Protocol

**Start of session**

1. Read `CLAUDE.md` → `memory/MEMORY.md` → latest entry in `memory/progress.md`.
2. Open the active feature folder named in `MEMORY.md` and find the next unchecked task.

**During the session**

- Record decisions in `decisions.md` _when they are made_, not at the end.
- Add gotchas to `learnings.md` immediately.

**End of session** (or before context runs out)

1. Add a `progress.md` entry: date, feature, done, next, blockers.
2. Update the "Current State" block in `MEMORY.md`.
3. Make sure `tasks.md` checkboxes reflect reality.

## The scribe agent

`.claude/agents/scribe.md` is the specialist agent for these rules (feature 402,
[software-factory.md](software-factory.md)). It writes `memory/progress.md`, the "Current State" in `MEMORY.md`,
new `decisions.md` entries, `learnings.md`, the roadmap's statuses and the CHANGELOG's Unreleased section, only from
what the session's files and **Result** notes show, with absolute dates. Its tools are Read, Grep, Glob, Edit and
Write: no shell, never code. `/spec-verify` hands it the progress entry and "Current State" at the end of Verify;
in any session you can ask for it by name.

The factory's loop (`npm run factory`, `/factory`) doesn't call the scribe. What it leaves is the evidence: each
task's **Result** note in `tasks.md`, the gate runs in `.factory/runs/`, the loop's state in `.factory/state.json`,
its commits, and any learnings or decisions the implementer recorded. After a run, update `progress.md` and
`MEMORY.md` yourself or with the scribe.

## Hygiene

- **Don't duplicate.** Don't copy code or git history into memory; link to files/specs instead.
- **Keep it true.** If a memory entry turns out to be wrong, fix or delete it — stale memory is worse than none.
- **Keep it short.** `MEMORY.md` ≤ 40 lines. Move `progress.md` entries older than ~30 sessions into `memory/archive/`.
- **Absolute dates** (`2026-10-04`), never "yesterday" or "last week".
- **Decisions are append-only.** Supersede an old decision with a new entry that references it; don't rewrite history.
- **No secrets** in any memory file.
