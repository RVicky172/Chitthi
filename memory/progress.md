# Progress Log

Newest first. One entry per working session.

```
## YYYY-MM-DD — <feature id or "chore">
**Done:** …
**Next:** …
**Blockers:** …
```

---

## 2026-10-06 — 000-baseline (T090–T092) ✔️

**Done:** doc fixes committed as `e549542` (user's OK); on the clean clone check, build (326 KB) and e2e (67 passed)
green again. Known gaps G1–G9 in the spec (G6 npm audit: build tools only; G7 MCP test leaves files in Documents;
G8 15 shown errors without `logError`, 6 that should log). Small fixes: MCP test time ~10 s in testing-strategy,
check-bundle comment 326 KB. All 12 ACs ticked, spec Implemented, roadmap 000 ✔️, clone deleted.
**Next:** `001` (Phase 1 gate, macOS build, 2.10.0); G6–G8 as bug fixes before its release.
**Blockers:** none

## 2026-10-06 — 000-baseline (T030–T032)

**Done:** `spec.md` Baseline inventory (16 areas, all 6 routes, linked docs) and Numbers (plan parity / frame times
beside the baseline's measurements, 6,115 checks, 326 KB entry, 56 tools = 34 + 22). Fixed: P1.12 row said 21 photo
tools (→ 22 since `find_with_ai`); self-test "~6,000" → "~6,100" in CLAUDE.md and `src/data/docs.ts`. Link check
(scratch `links.mjs`, exact case + GitHub slugs): specs/ + docs/ 147 links, 0 broken; only vendored `.claude/skills/`
have broken links. `npm run check` exit 0.
**Next:** T090 (commit needs the user's OK), T091, T092.
**Blockers:** none

## 2026-10-06 — 000-baseline (T021, T023)

**Done:** T021: `lld.md` module map now names every directory and module under `src/` and `electron/` (was 17 of 29
directories and 29 modules missing: GPU graph, light/curve/hsl/detail/deep/raw/tiff, dev/selftest, raw.cjs, …);
routing and components cover `#/instagram` and `#/docs`; `architecture.md` §4 UI and desktop rows updated;
`build.md` Node 22 → 26. T023: every Phase 0–1 item maps to an Unreleased line (no line added); TypeScript 5.9 → 6.0
fixed there. `npm run check` exit 0 (741 tests).
**Next:** T030 (inventory), T031 (numbers; photo-tool count 22 vs 21 in editor-implementation P1.12), T032.
**Blockers:** none

## 2026-10-06 — 000-baseline (T001–T016, T020, T022, T024)

**Done:** spec/plan/tasks committed (`fd2baaf`); clean clone set up; every gate green: check, licences, build
(entry 326 KB), self-test ×3 (6,115 checks, 0 failed), MCP ×3, e2e ×3 (67 passed, 7 skipped). The branch has no CI run
(CI runs only on pushes to main and on PRs); the nearest is main @ `cc192e1`, green. Gaps for T091: npm audit (10), the MCP test leaves
files in Documents, Docker isn't in the local gates, and build.md's Node version is out of date.
Then T020 (tech-stack: Mediabunny row added, react-dom/onnxruntime-web named, lucide 1.51, TypeScript 6.0
note, also in CLAUDE.md), T022 (`src/assests/` unreferenced; user chose to keep it → Known gap), T024 (2.10.0 ships
Phases 0 and 1).
**Next:** T021 (module map), T023 (CHANGELOG).
**Blockers:** none

## 2026-10-06 — chore: spec-driven development set up

**Done:** `specs/` (constitution, workflow, roadmap, tech stack, architecture, testing strategy, templates),
`memory/`, `/spec-*` commands, CLAUDE.md section (D-001). Engineering docs and `docs/planning/` moved into
`specs/` with every link updated (D-002); feature numbering by editor work item (D-003); `npm run check` (D-004);
skills, commands and CLAUDE.md committed (D-005).
**Next:** see `MEMORY.md` → Next step.
**Blockers:** none
