# 000 — Baseline · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
This feature writes no app code, so there are no failing-test-first pairs: the "tests" are the gate runs and the
check scripts, and each task's Result note is the evidence for its ACs.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred.

Decisions taken at plan approval (2026-10-06): clone at `D:\CodeBase\chitthi-000`, deleted after verify; 3 runs per
non-deterministic suite; link checker is a throwaway scratchpad script; `src/assests/` is deleted if nothing
references it.

## Setup

- [x] **T001** — Commit the approved spec and plan (`docs(000): baseline spec and plan`) so the clone contains them;
      record the full commit hash (§1). · files: `specs/features/000-baseline/*` · test: `git log -1` shows the commit
  - **Result (2026-10-06):** committed spec, plan, tasks, roadmap and MEMORY.md as
    `fd2baaf9fb9132a979dac54c2b3ae1b67aef5c0f` (`docs(000): baseline spec, plan and tasks`) on
    `feat/editor-phase-1-continued`. `npm run check` before it: typecheck clean, ESLint 0 errors / 5 warnings,
    Vitest 18 files, 741 tests passed (1.0 s). Git warned LF → CRLF on the new files (no `.gitattributes` rule for
    `.md`); harmless, noted for T091 if it shows up in diffs.
- [x] **T002** — Clean clone (§2): `git clone --branch feat/editor-phase-1-continued D:\CodeBase\Chitthi
      D:\CodeBase\chitthi-000`; `npm ci`; `npx playwright install chromium`; `npm run fetch:libraw`; unset
      `ELECTRON_RUN_AS_NODE`. Note any setup step that isn't in `specs/build.md`. · files: none (outside the repo) ·
      test: each command exits 0
  - **Result (2026-10-06):** clone at `fd2baaf`; Node 24.11.1, npm 11.18.0 (engines `>=20.19`). All four steps exit
    0; `ELECTRON_RUN_AS_NODE` was unset; LibRaw `win32-x64` fetched. `npm ci`: 571 packages; `npm audit` reports 10
    vulnerabilities (8 moderate, 2 high) → Known gaps (T091). npm 11's `allowScripts` skips 3 install scripts
    (`core-js`, `electron-winstaller`, `protobufjs`); none is needed for the gates. Electron 44 has no install
    script: it downloads its binary on first launch (`node_modules/electron/index.js`), so `npm test` does that.
    `specs/build.md` lists every setup step, but says "CI uses 22" while `ci.yml` uses Node 26 → fixed in T021.

## Gates (on the clean clone, in CI order, sequential)

- [x] **T010** — `npm run check`: record typecheck result, ESLint errors and warnings (≤ 5 known react-hooks),
      Vitest file and test counts. · test: exit 0 (AC-4)
  - **Result (2026-10-06):** exit 0 in 15.8 s. Typecheck clean; ESLint 0 errors, 5 warnings, all the known
    `react-hooks/exhaustive-deps` ones; Vitest 18 files, 741 tests passed.
- [x] **T011** — `npm run check:licenses`. · test: exit 0 (AC-9, first half)
  - **Result (2026-10-06):** exit 0 in 1 s: "168 shipped packages, all on the allowed list (1 approved exception)"
    (LibRaw).
- [x] **T012** — `npm run build`: record the entry chunk size and the `check-bundle.mjs` verdict (no AI or shader
      code). · test: exit 0, entry ≤ 350 KB (AC-5)
  - **Result (2026-10-06):** exit 0 in 2.8 s. `check-bundle: entry 326 KB (budget 350 KB); 9 AI provider chunks
    load on demand`; it also refuses GPU code in the entry, and passed. Largest lazy chunks: `videoExport` 526 kB,
    `jspdf` 400 kB. (The script's comment still says "current entry ~333 KB"; harmless.)
- [x] **T013** — `npm test` × 3: record pass/fail and check count per run, list any check that failed in any run.
      · test: 0 failures in all 3 runs (AC-7)
  - **Result (2026-10-06):** exit 0 in all 3 runs (90 s, 87 s, 88 s): **6,115 checks passed, 0 failed** each time;
    no flaky check. Run 1 downloaded Electron 44's binary first (as T002 expected). Both GPU backends checked:
    colour parity worst 2, mean 0.034; photos worst 2 (detail effects 3), mean 0.059 over 308 frames; masks worst 2
    (with detail 3), mean 0.025 over 27 frames. Timings per 1080 × 1350 frame (run 1): Canvas 2D 25.1 ms, WebGPU
    6.8 ms, WebGL2 6.7 ms; with clarity, sharpening and noise reduction Canvas 2D 633–668 ms vs 5.8–7.3 ms on the
    GPU; two masks WebGPU 5.3 ms (20.8 ms while painting, 20.5 ms dragging a gradient). No warnings in the log.
- [x] **T014** — `npm run test:mcp` × 3, incl. the DNG developed by LibRaw. · test: pass in all 3 runs (AC-8)
  - **Result (2026-10-06):** "MCP smoke test passed" in all 3 runs (10 s, 6 s, 7 s; the doc's ~30 s is stale).
    56 tools listed, read-only tools annotated, DNG developed by LibRaw (96 × 64), 16-bit TIFF exported. **Gap
    found:** the test writes its exports (a PDF, a JPEG and a 7 MB TIFF, about 7.6 MB a run) into the real
    `Documents/Chitthi agent output` folder (`electron/mcp.cjs` `outDir()`) and never removes them. On this machine
    that folder is in OneDrive and held 64 files (~86 MB) from earlier runs. Not fixed here (it touches `electron/`
    and the smoke test, beyond a docs feature) → Known gaps (T091), proposed fix: a test-only output folder.
- [x] **T015** — `npm run test:e2e` × 3, desktop and phone projects: record test counts, axe and console-error
      failures. A network failure is retried once and recorded, not counted as flaky. · test: pass in all 3 runs (AC-6)
  - **Result (2026-10-06):** exit 0 in all 3 runs (38 s, 39 s, 32 s): 74 tests in 4 files, **67 passed, 7 skipped,
    0 failed** each time, no retries (`retries` is 0 locally, 1 only under `CI`), so no flaky test. The 7 skips are
    on purpose, all on the phone project: video encoding and one other editors test run at desktop size only
    (`editors.e2e.ts:104`, `:240`), and the real AI subject model runs on desktop only (`instagram.e2e.ts:500`).
    Every test fails on any console error (CSP included) and the axe checks are in those 67, so 0 axe violations
    and 0 console errors.
- [x] **T016** — Link to the latest CI run on the branch (`gh run list --branch feat/editor-phase-1-continued`) and
      its result, as the second platform data point (Q3). · test: none (information only)
  - **Result (2026-10-06):** `gh` isn't installed here, so read the public Actions API instead. **The branch has no CI
    run:** `ci.yml` runs on pushes to `main` and on pull requests only, and the branch has no PR. Nearest data point:
    [CI on `main` @ `cc192e1`](https://github.com/RVicky172/Chitthi/actions/runs/37188379660), 2026-10-04, success
    (`check` on windows-latest, 6 min 51 s: lint, licences, build, unit, self-test, MCP, e2e; `docker` on
    ubuntu-latest, 34 s). `cc192e1` is an ancestor of the baseline; the 4 branch commits after it are docs/specs plus
    `a586377` (site nav + home page: 10 files under `src/`, +425/−262), which only the local gates above cover.
    → Known gaps (T091): the Docker job is not part of the local gates, so the baseline's image is unchecked until
    a PR or merge runs CI.

## Docs against code (in the working repo; [P] with the gate tasks, which run in the clone)

- [x] **T020** [P] — Shipped packages (§8): list `dependencies` and `BUNDLED` (`scripts/check-licenses.mjs`); grep
      each in `THIRD_PARTY_NOTICES.md` and `specs/tech-stack.md`; add any missing entry. · files:
      `THIRD_PARTY_NOTICES.md`, `specs/tech-stack.md` · test: every package found in both (AC-9, second half)
  - **Result (2026-10-06):** 10 shipped packages (3 `dependencies` + 7 `BUNDLED`). Before: all in the notices (React
    only as "React"); in tech-stack **Mediabunny had no row** (named only in the "not used: ffmpeg.wasm" reason),
    `react-dom` and `onnxruntime-web` only under display names. Fixed: Mediabunny row added (1.61, MPL-2.0 exception,
    `import()` on export); React rows name `react`, `react-dom` in both docs; ONNX row names `onnxruntime-web`.
    Also fixed in passing: lucide-react 1.48 → 1.51 (lockfile); "TypeScript 5.9 stays installed" → 6.0 in
    tech-stack and CLAUDE.md (Dependabot `0502bed` bumped it to 6.0.3; typescript-eslint 8.71 allows < 6.1, so the
    reason still holds); the intro claimed jsPDF is the only runtime library besides React; MCP SDK, zod and
    `safeStorage` rows had a 4th cell in a 3-column table. After: every package name found in both files;
    `check:licenses` and `npm run check` (741 tests) exit 0.
- [x] **T021** [P] — Module map (§6): scratch script lists every directory and top-level file under `src/` and
      `electron/` against `specs/lld.md` §1 and `specs/architecture.md` §4, and every path those docs name against
      the disk. Fix the docs (incl. `App.tsx`: screens are home, studio, sizes, paper, instagram, docs). · files:
      `specs/lld.md`, `specs/architecture.md` · test: script reports nothing undocumented or missing (AC-10)
  - **Result (2026-10-06):** scratch script (`modmap.mjs`, scratchpad) parses the module-map tree plus every
    backticked path in both docs. **Before:** 17 of 29 directories undocumented (`engine/gpu/`, `dev/` as a folder,
    `components/ai/`, `components/panes/`, `assets/`, `assests/`, `electron/resources/`, …), top-level
    `src/vite-env.d.ts` and `electron/raw.cjs` missing from the map, and 29 modules with no line: engine `adjust`,
    `light`, `curve`, `hsl`, `chain`, `detail`, `deep`, `raw`, `segments`, `tiff`, the 10 `gpu/` files; data
    `docs`, `instagram`, `layers`, `presets`, `printSamples`; lib `fileSink`, `gpuSetting`; dev `selftest`,
    `printSamples`. Every path the docs named exists. **Fixed in `lld.md`:** all of the above added to §1
    (`App.tsx` screens now home / studio / sizes / paper / instagram / docs; styles range `01-base … 40-site-nav`;
    `scripts/` line names the real scripts); §7 routing adds `#/instagram[/video|/youtube]` and
    `#/docs[/page[/section]]`; §8 tree gains `InstagramStudio`. **`architecture.md` §4:** UI row names the photo &
    video studio, `panes/`, `studio/`, `ig/`, `ai/` and the in-app docs; desktop row names `raw.cjs` and
    `resources/`. **After:** nothing undocumented or missing, except `electron/resources/libraw/win32-x64`, which
    the map covers as `libraw/<platform>-<arch>/` (git-ignored, fetched). `npm run check` exit 0 (741 tests).
    Also fixed (from T002):
    `specs/build.md` "CI uses 22" → "CI, releases and the Docker build use 26" (`ci.yml`, `desktop-release.yml`,
    `Dockerfile`).
- [x] **T022** [P] — `src/assests/`: grep `src/`, `scripts/`, `public/`, `electron/`, `vite.config.*`, `index.html`
      and `e2e/` for `assests`; if nothing, `git rm -r src/assests` and add a decision (D-006) in
      `memory/decisions.md`; if something, list it under Known gaps instead. Re-run `npm run check` and
      `npm run build` here. · files: `src/assests/`, `memory/decisions.md` · test: grep empty; check and build exit 0
  - **Result (2026-10-06):** grep of every listed place (plus `package.json`, `electron-builder.yml`, `tsconfig*`,
    `.github/`) finds no reference. The folder holds 14 tracked Pexels photos (31 MB) in `Images/postcards/`, added
    in `62e7a97` ("Updated some more image for samples"); none is credited in `public/samples/samples.json` or
    `showcase-src/photos.json`. **User's call (2026-10-06): keep it**, so no removal, no D-006, nothing to re-run.
    → Known gaps (T091): unused, misspelt `src/assests/`, owner: the user (to wire into samples, with credits, or
    remove).
- [x] **T023** [P] — CHANGELOG coverage (§7): map each Done item P0.1–P0.9 (P0.8 skipped, "Not needed") and
      P1.1–P1.12 to its Unreleased line; add missing lines. Put the mapping table in the Result note. · files:
      `CHANGELOG.md` · test: every item mapped (AC-11)
  - **Result (2026-10-06):** every Done item maps to an Unreleased line (v2.8.0 → HEAD, 54 commits); no line added.

    | Item | Unreleased line |
    | --- | --- |
    | P0.1 | Changed: "Photo and clip edits keep their colour settings in their own object…" |
    | P0.2–P0.7, P0.9 | Changed: "Photo & video studio: looks and colour sliders run on the graphics card… same pixels… On by default; Settings → Photo & video effects" (one line, as §7 allows) |
    | P0.8 | skipped (Not needed) |
    | P1.1 | Added: **Light** and **Colour**, eyedropper |
    | P1.2 | Added: **Tone curve** and **Colour mixer** |
    | P1.3 | Added: **Detail** and **Effects** |
    | P1.4 | Added: **Presets and LUTs** |
    | P1.5 | Added: **saved presets** |
    | P1.6 | Added: **masks** (brush) |
    | P1.7 | Added: **gradient and range masks** |
    | P1.8 | Added: **AI masks** |
    | P1.9 | Added: **camera RAW files**; export as **TIFF (16-bit)** |
    | P1.10 | Added: **image layers**, **blend mode**, **layer masks** |
    | P1.11 | Added: export as **WebP** and **AVIF** |
    | P1.12 | Added: "MCP: 22 tools for the photo studio…"; README / in-app docs lines |

    Fixed in passing: the Dependencies line said TypeScript "5.9 stays only for typescript-eslint" → 6.0 (as T020).
    For T031: the CHANGELOG says 22 photo-studio tools, `editor-implementation.md`'s P1.12 row says 21.
- [x] **T024** [P] — Version (§9, Q5): Phase 0's Release in `specs/vision/editor-implementation.md` → "2.10.0 (with
      Phase 1; 2.9.0 was never tagged)". · files: `specs/vision/editor-implementation.md` · test: manual read
  - **Result (2026-10-06):** Progress table, Phase 0 Release → "2.10.0 (with Phase 1; 2.9.0 was never tagged)". Also
    fixed the "How the work is organised" line that still said "Phase 0 → 2.9.0": now "Phases 0 and 1 → 2.10.0
    together". No other `2.9.0` outside CHANGELOG and this feature's own files.

## Inventory

- [x] **T030** — Write `## Baseline inventory` in `spec.md` (§4): baseline hash and version, a table of capability
      areas (area · what it does · detailed doc), built from the `App.tsx` routes and the README feature list.
      · files: `spec.md` · test: every route and README feature area appears (AC-1)
  - **Result (2026-10-06):** `## Baseline inventory` added above Out of Scope: baseline hash `fd2baaf` (T090 updates
    it), version "2.8.0 + Unreleased", and 16 rows (area · route · what it does · doc). All six routes appear
    (`home`, `studio`, `sizes`, `paper`, `instagram` incl. `/video` and `/youtube`, `docs`), and every area AC-1
    names plus the README's highlights (smart photos, 3D and paper, performance monitor, hosting). Links checked
    with a scratch checker (`links.mjs`: relative paths, exact case, GitHub heading slugs): 22 links, 0 broken;
    break-tested with a bad anchor, a missing file and a wrong-case file name, all three reported.
- [x] **T031** — Numbers (§4): parity tolerances and frame times from `editor-implementation.md` (linked to their
      rows), self-test check count (T013), entry chunk size (T012), agent-tool count (grep `src/agent/tools.ts` and
      `photoTools.ts`) compared with README and `docs/MCP.md`. Set the self-test count in
      `specs/testing-strategy.md` and `CLAUDE.md` to the measured one. · files: `spec.md`,
      `specs/testing-strategy.md`, `CLAUDE.md` · test: counts agree everywhere (AC-3)
  - **Result (2026-10-06):** `### Numbers` added under the inventory: parity and frame times from the plan's P0.6,
    P0.9, P1.3, P1.6, P1.7 rows (linked to "Notes on finished items"), each beside the baseline measurement from
    T013, plus 6,115 self-test checks and the 326 KB entry chunk. **Agent tools:** 34 `name:` entries in
    `tools.ts` + 22 in `photoTools.ts` (spread into `TOOLS`) = 56; README, CHANGELOG, `lld.md`, `architecture.md`
    and `src/data/docs.ts` say 56 (34 + 22); `docs/MCP.md` states no total but its tool table names all 56 (scripted
    check). **Fixed:** the plan's P1.12 row said 21 photo tools (written before P1.8 added `find_with_ai`) → "(22
    since P1.8 added `find_with_ai`)"; self-test count "~6,000" → "~6,100" in `CLAUDE.md` and the in-app docs
    (`src/data/docs.ts`, a text string); `testing-strategy.md` already said about 6,100. Links 23, 0 broken;
    `npm run check` exit 0 (741 tests).
- [x] **T032** — Link check (§5): throwaway scratch script checks relative links and `#anchors` (GitHub slugs) in
      `spec.md`, `specs/**/*.md` and `docs/**/*.md`; fix broken ones. · files: any Markdown with a broken link ·
      test: 0 broken links in the inventory (AC-2) and in `specs/` and `docs/`
  - **Result (2026-10-06):** scratch `links.mjs` (from T030): Markdown links and `src`/`href` attributes outside code,
    relative paths with exact case (Windows hides case errors that break on GitHub), `#anchors` as GitHub slugs
    incl. duplicate suffixes. `spec.md`: 23 links, 0 broken. `specs/` + `docs/`: 32 files, 147 links, **0 broken**,
    so nothing to fix. Also run on README, CLAUDE.md, CHANGELOG, THIRD_PARTY_NOTICES, `memory/`, `plugins/`,
    `.claude/commands/`: 20 files, 105 links, 0 broken. The only broken links in the repo are 15 inside the vendored
    third-party skills under `.claude/skills/` (`hallmark`, `scroll-world`, the `sdd-setup` template), pointing into
    their upstream repos; left as they are (not our docs).

## Verify

- [x] **T090** — If T022 or any fix changed the tree after T001, commit, update the hash in the inventory, and re-run
      on the clone (`git pull`) the gates the change could affect (at least `npm run check` and `npm run build`).
      · test: those gates exit 0
  - **Result (2026-10-06):** committed the T020–T032 doc fixes as `e549542` (`docs(000): baseline inventory, module
    map and doc fixes`; 14 files, docs plus one text string in `src/data/docs.ts`), with the user's OK. Inventory hash
    → `e549542`. On the clone after `git pull`: `npm run check` exit 0 (0 errors, 5 known warnings, 741 tests, 7 s);
    `npm run build` exit 0, entry 326 KB; and, because the in-app docs text changed, `npm run test:e2e` once: 67
    passed, 7 skipped, as in T015. Self-test and MCP not re-run: nothing they cover changed. Git warned about LF on
    commit: the working tree mixes CRLF files (`lld.md`, CHANGELOG, THIRD_PARTY_NOTICES) and LF files, none mixed
    within a file, and git stores LF either way (`core.autocrlf`).
- [x] **T091** — Write `## Known gaps` in `spec.md` (§10): every gate failure, flaky test, unfixed mismatch and unmet
      Definition-of-Done item from T002–T032, each with its owner. Starts with: video clips have no agent tools →
      `212`; macOS gates not run → `001`; Firefox/Safari not tested → backlog. · files: `spec.md` · test: every
      entry names an owner (AC-12)
  - **Result (2026-10-06):** 9 gaps (G1–G9), each with an owner: `212` (1), `001` (3: macOS, Phase 1 gate, CI on
    the PR), backlog (1), bug fixes (3: npm audit, MCP test output folder, `logError`), the maintainer (1:
    `src/assests/`). No gate failure or flaky test to list. New while writing it: a scan of every `catch` that
    shows an error (scratch `logerr.py`) for DoD 9: 28 show one, 15 without `logError`, 6 of which should log (G8).
    `npm audit` traced: all 10 advisories are build-time (electron-builder, Vite → postcss), nothing shipped (G6).
    Fixed as Q1 small fixes rather than listed: `testing-strategy.md` MCP time ~30 s → ~10 s, `check-bundle.mjs`
    comment ~333 → ~326 KB. Links in `spec.md`: 25, 0 broken.
- [x] **T092** — Tick the proven ACs in `spec.md` (Status `Implemented`), roadmap 000 → ✔️, `memory/progress.md`
      entry, `memory/MEMORY.md` Current State → next is `001`; learnings for anything that cost > 10 minutes.
      Delete `D:\CodeBase\chitthi-000`. · files: `spec.md`, `specs/roadmap.md`, `memory/*`
  - **Result (2026-10-06):** check and build re-run after the `check-bundle.mjs` comment fix: exit 0, 741 tests,
    entry 326 KB. AC-1 … AC-12 ticked (evidence: T030, T032, T031, T010/T090, T012/T090, T015, T013, T014,
    T011/T020, T021, T023, T091), Status `Implemented`, roadmap 000 ✔️, `memory/progress.md` entry, `MEMORY.md`
    → next is `001`. Learning recorded: line endings differ per file, and Git Bash's `grep` can't see CRs. Clone was
    clean at `e549542`; deleted.

No `specs/architecture.md` task beyond T021: this feature establishes no new structure.

## AC coverage

| AC    | Tasks            |
| ----- | ---------------- |
| AC-1  | T030             |
| AC-2  | T032             |
| AC-3  | T031             |
| AC-4  | T002, T010, T090 |
| AC-5  | T012, T090       |
| AC-6  | T015             |
| AC-7  | T013             |
| AC-8  | T014             |
| AC-9  | T011, T020       |
| AC-10 | T021             |
| AC-11 | T023             |
| AC-12 | T091             |
