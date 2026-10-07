# Decision Log

Append-only. Newest at the bottom. To reverse a decision, add a new entry that says `Supersedes D-00X`.

Format:

```
## D-00X — Title (YYYY-MM-DD)
**Context:** … **Decision:** … **Alternatives:** … **Consequences:** …
```

---

## D-001 — Adopt spec-driven development (2026-10-06)

**Context:** Work is done across many sessions, by people and AI agents that don't remember earlier sessions.
**Decision:** Every feature goes Specify → Plan → Tasks → Implement → Verify (`specs/workflow.md`), gated by the
Definition of Done in `specs/constitution.md`; durable project memory lives in the committed `memory/` folder.
**Alternatives:** ad-hoc issues/PR descriptions only; an external tracker.
**Consequences:** Specs and memory are part of every feature's diff; `/spec-*` commands drive the stages.

## D-002 — Engineering docs live in specs/, product docs in docs/ (2026-10-06)

**Context:** SDD adds `specs/`; the repo already had HLD, LLD, technologies, testing, licensing, build and release
docs in `docs/` beside the product docs, plus `docs/planning/` with the editor roadmap and implementation plan.
**Decision:** Move (git mv) HLD → `specs/architecture.md`, LLD → `specs/lld.md`, TECHNOLOGIES → `specs/tech-stack.md`,
TESTING → `specs/testing-strategy.md`, LICENSING → `specs/licensing.md`, BUILD → `specs/build.md`, RELEASE →
`specs/release.md`, `docs/planning/*` → `specs/vision/`. `docs/` keeps product, user and operator docs
(MEDIA-STUDIO, AI, MCP, PEXELS, DESKTOP, OPERATIONS, TROUBLESHOOTING, ACCESSIBILITY, PERFORMANCE, SPECIFICATIONS,
print-quote, screenshots). All links updated, including the in-app docs (`SPEC()` helper in `src/data/docs.ts`).
**Alternatives:** move only `docs/planning`; keep LICENSING.md in `docs/`.
**Consequences:** One home for how-we-build docs; external links to the old `docs/` paths on GitHub break.

## D-003 — Feature numbers follow the editor work-item IDs (2026-10-06)

**Context:** The editor plan already names work items P2.1 … P3.9, used in commits and the CHANGELOG.
**Decision:** `000–099` baseline/foundation, `2xx` = editor Phase 2 (P2.1 → 201), `3xx` = Phase 3, `401+` other.
Phases 0–1 are done and stay recorded in `specs/vision/editor-implementation.md`, without feature folders.
**Alternatives:** the template's tens ranges (000–009, 010–019 …) with no link to P-IDs; drafting all 21 specs now.
**Consequences:** Specs are written when an item starts (`/spec-new`); `roadmap.md` tracks status from Phase 2 on.

## D-004 — `npm run check` is the fast gate (2026-10-06)

**Context:** The per-task gate needed typecheck, lint and unit tests as three commands.
**Decision:** Add `"check": "npm run typecheck && npm run lint && npm run test:unit"` to `package.json`. The full
Definition of Done adds `test:e2e`, `build`, `test`, `test:mcp` and `check:licenses` (as CI runs).
**Alternatives:** document the three commands without a script.
**Consequences:** One command to run before ticking any task.

## D-005 — Claude Code skills, commands and CLAUDE.md are committed (2026-10-06)

**Context:** `.claude/` and `CLAUDE.md` were gitignored as per-developer, so the `/spec-*` commands and the
session-start rules existed on one machine only.
**Decision:** Commit `CLAUDE.md`, `.claude/commands/`, `.claude/skills/` (sdd-setup, hallmark with its MIT LICENSE)
and `skills-lock.json`. `.claude/settings.local.json` stays ignored. `scroll-world` stays local: no known source or
licence (`specs/licensing.md`).
**Alternatives:** keep them local per developer.
**Consequences:** Every contributor and agent session gets the same workflow; third-party skills follow the licence
policy like any other asset.

## D-006 — CI runs only for a release tag, never on feature branches (2026-10-06)

**Context:** `ci.yml` runs on every pull request and every push to `main`; feature branches had no CI run (000 gap
G5). The maintainer decided CI is a release step, not a per-branch or per-PR one.
**Decision:** Never run CI on feature branches. CI runs once, when a new version tag (`vX.Y.Z`) is being released;
that run is the full check of the project before the release goes out. Day-to-day verification is local:
`npm run check` per task, the full Definition of Done gates before a feature is Implemented.
**Alternatives:** CI on every PR and push to `main` (today's `ci.yml`); CI on every push to any branch.
**Consequences:** Local gate runs (recorded in each feature's Result notes) are the evidence for a feature; a red CI
at tag time blocks the release. Docker image and the Windows runner are first checked at the release tag.
Follow-ups, done in 001 T010–T011 (2026-10-06): `ci.yml` is a reusable workflow (`workflow_call` only) that the
Desktop release workflow runs first (`build` needs it); `specs/release.md`, `testing-strategy.md`, `build.md`,
`CONTRIBUTING.md`, `docs/OPERATIONS.md`, `docs/ACCESSIBILITY.md` and `docs/DESKTOP.md` say so.
**Amended (2026-10-06, 001 plan D2, D3):** a release may have one dry run before its tag: the Desktop release workflow
run by hand (`workflow_dispatch`) on `main`, which runs CI and builds installers without publishing. CodeQL
(`codeql.yml`: pull requests, pushes to `main`, weekly) is a security scan, not the CI gates, and keeps its triggers.

## D-007 — Full e2e runs once per spec, at verification, not after every task (2026-10-07)

**Context:** Running the whole Playwright suite (`npm run test:e2e`) after every UI task made features slow to finish.
**Decision:** During implementation, don't run the full e2e suite. If a task changes UI or integration, run only the
e2e tests for that spec's area (`npx playwright test e2e/<file>.e2e.ts [-g "<name>"]`). The full `npm run test:e2e`
runs once, at the end of each spec, as a Definition of Done gate in `/spec-verify`.
**Alternatives:** the full suite after every UI or integration task (the old rule in `workflow.md`, `constitution.md`
and `/spec-implement`).
**Consequences:** Tasks finish faster. A regression in another area may only show up at verification, and is fixed
before the spec is marked Implemented. `workflow.md`, `constitution.md` and `.claude/commands/spec-implement.md` say so.
