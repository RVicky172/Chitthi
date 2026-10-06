# 000 — Baseline

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** Baseline · **Created:** 2026-10-06 · **Owner:** RVicky172

## Summary

Chitthi Studio already exists: version 2.8.0 plus the unreleased editor Phases 0–1 (GPU render graph P0.1–P0.9 and
the advanced photo editor P1.1–P1.12) on branch `feat/editor-phase-1-continued`. Spec-driven development started on
2026-10-06 (D-001), after all of that was built. This feature records what exists as the starting point every later
spec builds on, and proves that the Definition of Done in `specs/constitution.md` holds for it today, so that a
failure seen while working on `001`, `201` … is known to be new rather than inherited. It adds no user-facing
behaviour.

## User Stories

- **US-1:** As a contributor (person or AI agent) starting a new feature, I want one page that says what the app does
  today and where each part is described, so that I don't re-specify or break existing behaviour.
- **US-2:** As a contributor, I want every Definition-of-Done gate known to pass on a clean clone of the baseline, so
  that a red gate during later work points at my change.
- **US-3:** As the maintainer, I want the engineering docs (`specs/architecture.md`, `specs/lld.md`,
  `specs/tech-stack.md`, `specs/testing-strategy.md`) and product docs (`docs/`) checked against the code, so that
  specs written from them start from the truth.
- **US-4:** As the maintainer, I want the baseline's known gaps written down (not fixed silently), so that each one
  becomes a bug fix or a later feature on purpose.

## Acceptance Criteria

### Inventory (what exists)

- [x] **AC-1:** The spec's **Baseline inventory** section lists every capability area below, each with one line on
      what it does and a link to the doc that describes it in detail: print studio (4 products, sizes, layouts,
      themes, print packs with bleed), photo studio (batch, layers, the Phase 1 editor: light, colour, curve, mixer,
      detail, presets, LUTs, masks incl. AI masks, RAW, WebP/AVIF/16-bit TIFF export), video studio (Reels / Shorts,
      YouTube, MP4 export), desktop app (Windows, macOS; storage, RAW, updates), MCP server and Claude Code plugin,
      AI with the user's key, Pexels search, in-app docs. No area of the app's top-level routes (`home`, `studio`,
      `sizes`, `paper`, `instagram`, `docs`) is missing. _(manual review)_
- [x] **AC-2:** Every link in the inventory resolves to an existing file and heading. _(manual check, or a link
      checker run recorded in the Result note)_
- [x] **AC-3:** The inventory records the baseline's measured numbers already in
      `specs/vision/editor-implementation.md` (GPU vs Canvas 2D parity: worst 2 levels for colour edits, 3 with detail
      effects; frame times per 1080 × 1350 frame) and the count of agent tools registered in `src/agent/`
      (`tools.ts` and `photoTools.ts`), matching the count stated in `docs/MCP.md` and the README.
      _(manual check against the code)_

### Gates (Definition of Done on a clean clone)

On a fresh clone of the baseline commit, after `npm ci` (and `npx playwright install chromium`,
`npm run fetch:libraw`), on Windows 11:

- [x] **AC-4:** `npm run check` exits 0: typecheck clean, ESLint 0 errors and no more than the 5 known react-hooks
      warnings, every Vitest test passing. _(gate run, output summary in the Result note)_
- [x] **AC-5:** `npm run build` exits 0 with the entry chunk ≤ 350 KB and no AI or shader code in it; the entry chunk's
      size is recorded. _(gate run)_
- [x] **AC-6:** `npm run test:e2e` passes on both the desktop and phone projects with 0 axe violations and 0 console
      errors (CSP included). _(gate run)_
- [x] **AC-7:** `npm test` (Electron self-test) reports 0 failures; the total check count is recorded (expected
      about 6,000). _(gate run)_
- [x] **AC-8:** `npm run test:mcp` passes, including developing the DNG with LibRaw. _(gate run)_
- [x] **AC-9:** `npm run check:licenses` exits 0, and every shipped package (`dependencies` in `package.json` and
      the bundled devDependencies in `BUNDLED` in `scripts/check-licenses.mjs`) appears in `THIRD_PARTY_NOTICES.md`
      and in `specs/tech-stack.md`. _(gate run + manual check)_

### Docs match the code

- [x] **AC-10:** `specs/architecture.md` and `specs/lld.md` name every directory under `src/` and `electron/`, and
      every module they name exists. Mismatches are fixed in the docs (not the code). _(manual check)_
- [x] **AC-11:** `CHANGELOG.md`'s **Unreleased** section covers every Phase 0–1 work item marked Done in
      `specs/vision/editor-implementation.md`. _(manual check)_

### Known gaps

- [x] **AC-12:** A **Known gaps** section lists every gate failure, flaky test (a test that failed at least once in
      3 runs of its suite), doc mismatch that wasn't fixed, and Definition-of-Done item the baseline doesn't meet
      (e.g. a user-facing feature without an agent tool — video clips get theirs in P2.12). Each gap names where it
      will be handled: a bug fix logged in `memory/progress.md`, feature `001`, a `2xx`/`3xx`/`4xx` feature, or the
      roadmap backlog. _(manual review)_

## Non-Functional Requirements

- Performance: none new. The baseline's existing budgets (`docs/PERFORMANCE.md`, the 350 KB entry chunk) are
  recorded, not changed.
- Accessibility / security / compatibility: none new; AC-6 records that today's axe and CSP checks pass.

## Baseline inventory

**Baseline:** `e549542bed2e12b36fe7ff1e1a210179e4a5b5ac` on `feat/editor-phase-1-continued` (gates run at `fd2baaf`;
`e549542` adds only doc fixes, re-checked in T090) · **Version:** 2.8.0 +
Unreleased (editor Phases 0–1; ships as 2.10.0 in `001`, no 2.9.0 tagged).

One line per capability area; the linked doc is the detailed record. Routes are the hash routes in `App.tsx`
(`screenOf()` in `src/state/store.ts`).

| Area | Route | What it does | Detailed doc |
| --- | --- | --- | --- |
| Home | `home` | Landing page: the two studios side by side, a section per platform and per print product, live renders | [README: What it does](../../../README.md#what-it-does) |
| Print studio | `studio` | 4 products (postcards, calendars, framed prints, fridge magnets) in 34 sizes and 47 layouts, 25 occasion themes, 46 fonts; six steps with a live preview that is what prints; matching envelopes | [README: Print studio](../../../README.md#print-studio), [SPECIFICATIONS.md](../../../docs/SPECIFICATIONS.md) |
| Print files | `studio` | Print-shop PDFs with bleed and crop marks, sheet PDFs, 300 dpi PNGs, print pack ZIP with print spec, quote request and envelope; print-colours soft proof; 3D preview | [README: Print studio](../../../README.md#print-studio), [lld §4.4 Export](../../lld.md#44-export-exportts) |
| Smart photos and library | `studio` | Photo analysis (shape, colour, light, sharpness), ranking per slot, auto-arrange, subject-centred crops; the photo library | [lld §4.6](../../lld.md#46-photo-analysis-and-arrangement-engineanalyzets-statetraitsts) |
| Sizes guide | `sizes` | Size table, to-scale diagram, layouts at the chosen size | [SPECIFICATIONS.md: Current sizes](../../../docs/SPECIFICATIONS.md#current-sizes) |
| Paper sizes in 3D | `paper` | Every size on a cutting mat at true relative scale, side by side, stacked or imposed, plus an actual-size view | [lld §8 Components](../../lld.md#8-components) |
| Photo studio | `instagram` | Instagram batch of up to 20 photos (4:5, 1:1, 3:4, 1.91:1, 9:16 at 1080 px) with text, shape, sticker, drawing and image layers, blend modes and layer masks | [MEDIA-STUDIO.md: Instagram photos](../../../docs/MEDIA-STUDIO.md#instagram-photos-formats) |
| Photo editor (Phase 1) | `instagram` | Light and white balance, tone curve, colour mixer, detail and effects, presets and `.cube` LUTs, saved presets, brush / gradient / range masks and AI masks (subject, sky, background), on the GPU with a Canvas 2D fallback | [MEDIA-STUDIO.md: Editing](../../../docs/MEDIA-STUDIO.md#editing), [editor-implementation.md](../../vision/editor-implementation.md) |
| RAW and photo export | `instagram` | Camera RAW (LibRaw on desktop, embedded JPEG on web); JPEG, PNG, WebP, AVIF (where the browser writes it), 16-bit TIFF; ZIP or share | [MEDIA-STUDIO.md: RAW photos](../../../docs/MEDIA-STUDIO.md#raw-photos), [Export and posting](../../../docs/MEDIA-STUDIO.md#export-and-posting) |
| Video studio | `instagram/video`, `instagram/youtube` | Reels / Shorts (9:16, 4:5, 1:1) and YouTube (16:9, up to 4K60 on desktop) on a timeline with music; H.264 + AAC MP4 with fast start, streamed to a file for YouTube | [MEDIA-STUDIO.md: Video editor](../../../docs/MEDIA-STUDIO.md#video-editor-reels-shorts-and-youtube) |
| In-app docs | `docs` | Using the app and developer pages, rendered from `src/data/docs.ts` | [README: Documentation](../../../README.md#documentation) |
| AI with the user's key | (dialogs) | Greetings, captions, messages and slot-shaped artwork from 16 services; keys only for allowed hosts; on-device AI masks | [AI.md](../../../docs/AI.md) |
| Pexels search | (dialog) | Free photos with credits, key never in the app | [PEXELS.md](../../../docs/PEXELS.md) |
| Desktop app | — | Windows and macOS (Electron): file-based storage, RAW developer, native save, menus, `.chitthi` files, auto-updates, performance monitor with per-process CPU and memory | [DESKTOP.md](../../../docs/DESKTOP.md), [PERFORMANCE.md](../../../docs/PERFORMANCE.md) |
| MCP server and Claude Code plugin | — | `Chitthi --mcp` or live from Settings: 56 agent tools, prompts and resources; the plugin adds the server and six skills | [MCP.md](../../../docs/MCP.md), [plugin README](../../../plugins/chitthi/README.md) |
| Web app hosting | — | Static `dist/` on nginx in Docker with the production CSP; installable, offline via the service worker | [OPERATIONS.md](../../../docs/OPERATIONS.md) |

### Numbers

Recorded from the editor plan ([Notes on finished items](../../vision/editor-implementation.md#notes-on-finished-items),
row named in brackets) and measured on the clean clone (tasks T012, T013). Frames are 1080 × 1350.

| What | Value | Source |
| --- | --- | --- |
| GPU vs Canvas 2D parity, colour edits | worst 2 levels, mean 0.067 (112 frames per backend) | plan [P0.6] |
| … with detail effects | worst 3 levels, mean 0.061 (252 frames) | plan [P1.3] |
| … masks | worst 2 (3 with detail), mean 0.033 (P1.6), 0.025 over 27 frames (P1.7) | plan [P1.6], [P1.7] |
| … measured at the baseline | colour worst 2, mean 0.034; photos worst 2 (detail 3), mean 0.059 over 308 frames; masks worst 2 (detail 3), mean 0.025 over 27 frames | T013 |
| Frame time with a look | Canvas 2D 23–25 ms, WebGL2 11 ms, WebGPU 6 ms | plan [P0.9] |
| … measured at the baseline | Canvas 2D 25.1 ms, WebGL2 6.7 ms, WebGPU 6.8 ms | T013 |
| Detail effects (clarity, sharpening, noise reduction) | GPU about 1–2 ms; Canvas 2D about 0.8 s (baseline: 5.8–7.3 ms vs 633–668 ms) | plan [P1.3], T013 |
| Two masks | WebGPU 6.2 ms, WebGL2 9.5 ms, painting 23–24 ms, dragging a gradient 26–29 ms; Canvas 2D about 0.4 s (baseline WebGPU: 5.3 ms, painting 20.8 ms, dragging 20.5 ms) | plan [P1.6], [P1.7], T013 |
| Self-test checks | 6,115, 0 failed (3 runs) | T013 |
| Entry chunk | 326 KB of the 350 KB budget | T012 |
| Agent tools | 56 = 34 print (`src/agent/tools.ts`) + 22 photo studio (`photoTools.ts`); README, CHANGELOG, `lld.md`, `architecture.md` and the in-app docs say 56, and `docs/MCP.md`'s tool table names all 56 | code |

## Known gaps

What the baseline doesn't meet, found by tasks T002–T032, each with where it will be handled. No gate failed and no
test was flaky (3 runs each of the self-test, MCP and e2e suites).

| # | Gap | Found in | Handled in |
| --- | --- | --- | --- |
| G1 | Video clips have no agent tools (Constitution XI / DoD 7) | plan | `212` (P2.12) |
| G2 | macOS gates not run; only Windows 11 here | plan | `001` (first macOS build, Intel LibRaw) |
| G3 | Firefox and Safari have no test project (Playwright runs Chromium only) | plan | roadmap backlog |
| G4 | The Phase 1 gate (masked edits on a mid-range laptop in Chrome) is still unmeasured | plan | `001` |
| G5 | The branch has no CI run (`ci.yml` runs on pushes to `main` and on PRs), so the Docker image job hasn't run on the baseline; nearest green run is `main` @ `cc192e1` | T016 | `001`: CI runs once, for the 2.10.0 tag (D-006: never on feature branches) |
| G6 | `npm audit`: 10 advisories (8 moderate, 2 high), all in build tools: electron-builder's chain (`@electron/get`, `got` → `http-cache-semantics`, high) and Vite → postcss → `source-map-js` (high); nothing in the shipped app | T002 | bug fix (`npm audit fix` or upgrades, logged in `memory/progress.md`) before `001`'s release |
| G7 | `npm run test:mcp` writes its exports (a PDF, a JPEG and a 7 MB TIFF, ~7.6 MB a run) into the real `Documents/Chitthi agent output` and never removes them | T014 | bug fix: a test-only output folder (`electron/mcp.cjs` `outDir()`, `scripts/mcp-smoke.mjs`) |
| G8 | DoD 9: 15 catch blocks show an error without `logError('handled', e)`; most are expected user errors (bad font or preset file, clipboard blocked), but 5 export failures in `src/state/actions.ts` (lines 128–176: PDF, document, envelope, image, print pack) and the gallery save (line 300) should be logged | T091 scan | bug fix |
| G9 | `src/assests/` (misspelt): 14 Pexels photos (31 MB) that nothing references and no credits list names | T022 | the maintainer: wire into samples with credits, or remove |

**Status (2026-10-06):** G6, G7 and G8 fixed as bug fixes before `001` (`df57d6d`, `001` tasks T001–T004): `npm audit`
0 high (one moderate advisory without a fix remains, build-time only); the MCP smoke test deletes its files; all 14
shown errors log (G8's 15th was a false positive in the scan), guarded by `src/lib/errors.test.ts`. G5: CI now runs
only at a release (D-006), first at `001`'s dry run. G1–G4 and G9 open as listed.

Fixed inside `000` (Q1 small fixes, not gaps): every doc mismatch found by T020, T021, T023, T031 and T032 (see
their Result notes), the MCP test time in `specs/testing-strategy.md` (~30 s → ~10 s) and the entry-size comment in
`scripts/check-bundle.mjs` (~333 → ~326 KB). Not ours: 15 broken links inside third-party skills vendored under
`.claude/skills/`.

## Out of Scope

- New features or behaviour changes of any kind.
- The Phase 1 gate measurement on a mid-range laptop in Chrome, the first macOS build with Intel LibRaw, and the
  2.10.0 release — all feature `001`.
- Retroactive spec / plan / tasks folders for Phases 0–1 (D-003: they stay recorded in `specs/vision/`).
- Merging `feat/editor-phase-1-continued` into `main` (see Q2).
- Firefox / Safari test projects (roadmap backlog).

## Open Questions

- **Q1** _(resolved)_ If a gate fails on the clean clone, does `000` fix it, or only record it?
  _Answer:_ small fixes (a broken link, a stale doc, a flaky wait) are done inside `000` as bug fixes logged in
  `memory/progress.md`; anything larger is recorded under Known gaps and handed to `001` or a later feature.
- **Q2** _(resolved)_ Which commit is "the baseline": the tip of `feat/editor-phase-1-continued`, or `main`
  after that branch is merged? _Answer:_ the branch tip at the time `000` is verified; its hash is recorded in the
  spec. The merge to `main` happens with `001`'s release.
- **Q3** _(resolved)_ Which platforms must the gates pass on for `000`? _Answer:_ Windows 11 (the
  development machine) for all gates, plus the existing GitHub CI workflow for what it already runs. macOS is
  checked in `001` with the first macOS build.
- **Q4** _(resolved)_ How detailed should the inventory be? _Answer:_ one line per capability area plus a
  link to the existing doc (`docs/MEDIA-STUDIO.md`, `docs/SPECIFICATIONS.md`, `docs/MCP.md`, …); the existing docs
  stay the detailed record, and this spec does not copy them.
- **Q5** _(resolved)_ What version does the baseline carry? `package.json` says 2.8.0; the editor plan names
  a 2.9.0 (Phase 0) that was never tagged and 2.10.0 for Phase 1. _Answer:_ the baseline is "2.8.0 + Unreleased";
  no 2.9.0 is tagged, and 2.10.0 (in `001`) ships Phases 0 and 1 together. The editor plan's Release column is
  corrected to say so.

## Changelog

- 2026-10-06 — Created.
- 2026-10-06 — Q1–Q5 resolved (all proposals accepted); Approved.
- 2026-10-06 — AC-3: tools are registered in both `tools.ts` and `photoTools.ts`. AC-9: "runtime dependency" means
  every shipped package, incl. bundled devDependencies (only 3 are in `dependencies`). Found while planning.
- 2026-10-06 — Plan approved, tasks written; In Progress.
- 2026-10-06 — Baseline inventory, numbers and Known gaps (G1–G9) written; every AC proven (tasks.md Result
  notes); Implemented.
- 2026-10-06 — G5's owner: CI runs only for a release tag (D-006), so the first CI run of the baseline is 2.10.0's.
