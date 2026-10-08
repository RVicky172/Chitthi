---
description: Draft the specs of several roadmap items at once (batch intake); drafts only, nothing approved, planned or coded
argument-hint: <NNN> [NNN ...] (e.g. 203 204 205)
---

Draft specs for roadmap items $ARGUMENTS (402 plan §6, AC-15; `specs/software-factory.md`).

Batch intake writes one **Draft** `spec.md` per item, each with its open questions marked, so the maintainer can
answer them together. It never approves a spec, writes a plan or tasks, or touches code.

1. **Check first:** read `memory/MEMORY.md` and `specs/roadmap.md`. For each item: it must be a three-digit number
   on the roadmap, and `specs/features/NNN-*/` must not exist yet. Skip the others and say why (not on the
   roadmap; a spec exists already: use `/spec-plan` or edit it). If `git status --porcelain` shows changes to
   `specs/`, tell the user and stop, so the drafts aren't mixed with their own edits.
2. **One spec-writer per item, one after another** (they all edit `specs/roadmap.md`, so not in parallel): hand
   each to the `spec-writer` agent (Agent tool, `subagent_type: "spec-writer"`; `.claude/agents/spec-writer.md`)
   with this brief: roadmap item **NNN — <title from the roadmap>**; read the work item in
   `specs/vision/editor-implementation.md` (and `specs/vision/editor-roadmap.md` for the what and why); write
   `specs/features/NNN-<kebab-name>/spec.md` from the template with `**Status:** Draft`, today's date and a
   Changelog line; every ambiguity as `**Qn** [NEEDS CLARIFICATION] … _Proposed:_ …`; set the roadmap row to 📝
   with a link; change nothing else; end by listing the open questions.
3. **Check each draft** when its agent returns (don't fix it silently; redo or report): `git status --porcelain`
   shows only the new `spec.md` and `specs/roadmap.md`; the spec says `**Status:** Draft`; its acceptance criteria
   have numbers and a test type. Anything more (a plan, tasks, code, another feature) stops the batch: report it
   and leave it in the tree for the user.
4. **Memory:** update "Current State" in `memory/MEMORY.md` once for the whole batch (the drafts and that they wait
   on answers).
5. **Report and stop:** per item, the spec's path and its open questions (numbered, with the proposed answers), so
   the user can answer them in one go. Do NOT approve, plan or code.

Unattended alternative (no session needed, same checks, stops the batch on a draft that changed more):
`npm run factory -- --intake 203,204,205` (`scripts/factory/run.mjs`, `--budget` / `--max-turns` as for the loop).
It never commits; the drafts are left in the tree for review.
