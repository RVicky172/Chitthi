# 000 — Baseline · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

The feature writes no app code. It pins the baseline commit, runs every gate on a clean clone, checks the docs against
the code, and writes what it finds into `spec.md` (**Baseline inventory**, **Known gaps**) and the docs it corrects.
Following Q1, small problems found along the way are fixed as logged bug fixes; anything larger becomes a Known gap
with an owner.

**§1 Pin the baseline (Q2).** The baseline is the tip of `feat/editor-phase-1-continued` when the gates are run
(today `963ab6b`, plus this feature's spec and plan commits). Record the full hash at the top of the inventory. If a
Q1 fix lands later, the hash is updated and the gates that fix could touch are re-run.

**§2 Clean clone.** `git clone --branch feat/editor-phase-1-continued D:\CodeBase\Chitthi D:\CodeBase\chitthi-000`
(a sibling folder, so no gitignored files from the working tree leak in: `node_modules`, `dist`,
`electron/resources/libraw`, `electron/resources/fonts`, fetched samples). Then `npm ci`,
`npx playwright install chromium`, `npm run fetch:libraw`. Gates run with `ELECTRON_RUN_AS_NODE` unset. The clone is
deleted when 000 is verified.

**§3 Gates (AC-4 … AC-9).** In CI's order: `npm run check`, `npm run check:licenses`, `npm run build`, `npm test`,
`npm run test:mcp`, `npm run test:e2e`. For each: exit code, duration and the summary line (test counts, warning
count, entry chunk size, self-test check count) go in the task's Result note. **Flakiness (AC-12):** the three
non-deterministic suites — `npm test`, `npm run test:mcp`, `npm run test:e2e` — run 3 times each; a test failing in
any run is listed as flaky. CI (`.github/workflows/ci.yml`, Windows runner) already runs the same gates; the latest
green CI run on the branch is linked as a second platform data point (Q3), not required.

**§4 Baseline inventory (AC-1 … AC-3, Q4).** A new `## Baseline inventory` section in `spec.md`, above Out of Scope:
the baseline hash and version ("2.8.0 + Unreleased", Q5), then one row per capability area (table: area · what it
does · detailed doc), then **Numbers**: parity tolerances and frame times copied from
`specs/vision/editor-implementation.md` with a link to the row they came from, the self-test check count and entry
chunk size measured in §3, and the agent-tool count (today 34 in `tools.ts` + 22 in `photoTools.ts` = 56, matching
README and CHANGELOG; `docs/MCP.md` is checked too). Areas come from the route list in `App.tsx` and the README
feature list, so none is missed.

**§5 Link check (AC-2).** A throwaway Node script (no dependency; kept in the session scratchpad, not committed)
reads Markdown files, extracts relative links, and checks the file exists and, for `#anchor`, that a heading with
that GitHub slug exists. Run on the inventory (AC-2) and, at no extra cost, on all of `specs/` and `docs/`: broken
links there after the D-002 move are fixed as Q1 small fixes.

**§6 Docs against code (AC-10).** List every directory (and top-level file) under `src/` and `electron/` and check
each is named in `specs/lld.md` §1 Module map or `specs/architecture.md` §4 Building blocks; check every path those
two docs name exists. Mismatches are fixed in the docs. Already seen while planning:
- `lld.md` describes `App.tsx` as "Screens (home / studio / sizes)" — the routes are also `paper`, `instagram`, `docs`.
- `src/assests/Images` exists beside `src/assets/fonts` and nothing under `src/` imports it — an unused,
  misspelt folder. Removing it changes no behaviour (a Q1 small fix, after confirming nothing references it, incl.
  `vite.config`, `scripts/` and `public/`); otherwise a Known gap.
- `testing-strategy.md` says about 6,100 self-test checks, CLAUDE.md about 6,000: both set to the §3 count.

**§7 CHANGELOG coverage (AC-11).** For each of P0.1–P0.9 and P1.1–P1.12 marked Done in `editor-implementation.md`,
find the Unreleased entry that covers it (P0.8 "Not needed" is skipped; Phase 0 items with no user-visible change
need at most one line, e.g. "photo and video effects run on the graphics card"). Missing entries are added.

**§8 Shipped packages (AC-9).** List `dependencies` in `package.json` and `BUNDLED` in `scripts/check-licenses.mjs`;
grep each name in `THIRD_PARTY_NOTICES.md` and `specs/tech-stack.md`. Missing ones are added (doc-only fix).

**§9 Version (Q5).** In `specs/vision/editor-implementation.md`'s Progress table, Phase 0's Release becomes "2.10.0
(with Phase 1; 2.9.0 was never tagged)".

**§10 Known gaps (AC-12).** A `## Known gaps` section in `spec.md`: each gap (gate failure, flaky test, unfixed doc
mismatch, Definition-of-Done item the baseline misses) with where it will be handled. Known before running anything:
video clips have no agent tools (Constitution XI) → `212` (P2.12); macOS gates not run → `001`; Firefox/Safari not
tested → backlog.

**§11 Close.** Roadmap 000 → ✔️, `memory/progress.md` entry, `MEMORY.md` Current State → next is `001`. Any decision
taken (e.g. removing `src/assests`) goes in `memory/decisions.md`; anything that cost > 10 minutes in
`memory/learnings.md`.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `specs/features/000-baseline/spec.md` | modify | Baseline inventory (§4), Known gaps (§10), hash |
| `specs/lld.md`, `specs/architecture.md` | modify | Module map and building blocks match the code (§6) |
| `specs/testing-strategy.md`, `CLAUDE.md` | modify | Self-test check count (§6) |
| `specs/vision/editor-implementation.md` | modify | Phase 0 release column (§9) |
| `CHANGELOG.md` | modify, if needed | Unreleased covers every Phase 0–1 item (§7) |
| `THIRD_PARTY_NOTICES.md`, `specs/tech-stack.md` | modify, if needed | Every shipped package listed (§8) |
| `specs/**/*.md`, `docs/**/*.md` | modify, if needed | Broken links fixed (§5) |
| `src/assests/` | delete, if unreferenced | Unused misspelt folder (§6; needs your OK, see below) |
| `specs/roadmap.md`, `memory/*` | modify | Status and memory (§11) |

No file under `src/` or `electron/` changes, except the possible `src/assests/` removal and any Q1 small fix a gate
turns up (each logged in `memory/progress.md`).

## Data Structures & Interfaces

None in the app. The scratch scripts print plain text:

```
link-check:  <file>:<line>  <link>  missing file | missing anchor
docs-vs-code: undocumented <path>  |  documented but missing <path>
packages:    <name>  notices: yes/no  tech-stack: yes/no
```

## Techniques

- Clean clone from the local repo (no push needed), so the gates see exactly the committed tree.
- Heading slugs as GitHub makes them: lower-case, drop punctuation except `-` and spaces, spaces → `-`, repeated
  headings get `-1`, `-2`.
- Gates run sequentially (they share ports 5173/8080 and Electron).

## Test Approach

| AC | Proof | Type |
| --- | --- | --- |
| AC-1 | Inventory reviewed against `App.tsx` routes and the README feature list | manual review |
| AC-2 | Link-check script output: 0 broken links in the inventory | script run (recorded) |
| AC-3 | Numbers compared with `editor-implementation.md`; tool count by grep of `src/agent/` vs README / MCP.md | manual check |
| AC-4 | `npm run check` on the clean clone | gate run |
| AC-5 | `npm run build`; entry chunk size from `check-bundle.mjs` | gate run |
| AC-6 | `npm run test:e2e` × 3, desktop and phone | gate run |
| AC-7 | `npm test` × 3; check count recorded | gate run |
| AC-8 | `npm run test:mcp` × 3 | gate run |
| AC-9 | `npm run check:licenses` + package listing (§8) | gate run + script |
| AC-10 | Docs-vs-code listing shows nothing undocumented or missing | script run + manual |
| AC-11 | Phase 0–1 item → CHANGELOG line mapping in the Result note | manual check |
| AC-12 | Known gaps section reviewed: every failure, flaky test and unmet DoD item has an owner | manual review |

## Risks & Mitigations

- **Clean clone needs files the working tree has but git doesn't** (fetched samples, fonts, LibRaw). That is what
  this feature is meant to find: a gate that fails only for this reason is fixed by documenting (or scripting) the
  setup step in `specs/build.md`, or listed as a Known gap.
- **`ELECTRON_RUN_AS_NODE` set by VS Code** breaks `npm test` / `test:mcp`: unset it in the shell that runs them.
- **Network** for `npm ci`, Playwright's Chromium, LibRaw and the AI subject model in e2e: a network failure is retried
  once, then recorded, not counted as a flaky test.
- **Time:** 3 × (self-test ~100 s + MCP ~30 s + e2e ~30 s) plus setup is about 15 minutes; acceptable.
- **A large gate failure** would turn the baseline into a fix project: per Q1 it is recorded and handed to `001` or a
  new feature instead of being fixed here.

No spike needed: every step uses existing commands.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Approved spec; no feature code. Spec clarified (AC-3, AC-9) with a Changelog line |
| II. Test-gated delivery | ✅ | The feature *is* the gates; each result recorded; flakiness checked with 3 runs |
| III. Small dependencies | ✅ | No dependency; scratch scripts are plain Node and not committed |
| IV. Memory maintained | ✅ | §11: progress, MEMORY.md, decisions for any removal |
| V. Free and open source | ✅ | Nothing changes |
| VI. On device, no backend | ✅ | Nothing changes; network only for setup downloads |
| VII. Permissive licences | ✅ | AC-9 checks every shipped package is listed |
| VIII. WYSIWYG, one code path | ✅ | No rendering change; parity numbers recorded |
| IX. Secure desktop shell | ✅ | No `electron/` change |
| X. Budgets and accessibility | ✅ | Entry chunk size and axe results recorded |
| XI. Agents use the same code | ⚠️ | Baseline misses it for video clips; recorded as a Known gap owned by `212` (P2.12), not fixed here |
