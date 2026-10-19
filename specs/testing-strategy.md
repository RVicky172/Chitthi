# Testing strategy

Five suites check Chitthi, from fast unit tests to the packaged app. They run locally: `npm run check` after every
task, all of them before a feature is done (the Definition of Done in `constitution.md`). CI runs all of them once per
release (D-006): the Desktop release workflow calls `.github/workflows/ci.yml` on a version tag, or on its manual dry
run, before it builds the installers (a Windows runner, because the Electron suites need a desktop session). There is
no CI on feature branches or pull requests.

| Command | Suite | Runs in | Time |
| --- | --- | --- | --- |
| `npm run check` | Fast gate: `typecheck` + `lint` + `specs:check` + the structure check (`scripts/check-structure.mjs`) + `test:unit`. Run after every task | Node | ~15 s |
| `npm run lint` | ESLint (`eslint.config.js`), cached; `lint:full` without the cache | Node | ~4 s cached; ~40 s full |
| `npm run test:unit` | Vitest, `tests/unit/**` and `tests/integration/**` (and the tooling's own tests under `tools/`) | Node | ~3 s |
| `npm test` | Self-test, `tests/selftest/selftest.ts` | Electron against a Vite dev server | ~100 s |
| `npm run test:mcp` | MCP smoke test, `scripts/mcp-smoke.mjs` (run `npm run fetch:libraw` once first) | Electron (headless MCP) + the official MCP client | ~10 s |
| `npm run test:e2e` | Browser tests with axe, `tests/e2e/*.e2e.ts` | Chromium, desktop and phone sizes, against the production build | ~30 s |

`npm run build` also guards the bundle: it fails if the start-up script passes 350 KB or contains AI code, and if
any chunk holds a module from `tests/` (the `chitthi:no-test-code` plugin in `vite.config.ts`).

## Where tests live

Every test is under `tests/`; `src/` holds only the app (feature 407, D1). `scripts/check-structure.mjs`, part of
`npm run check`, fails on a test file or a `*.testkit.ts` helper in `src/`, and on app code importing `tests/` (the
one exception: `src/main.tsx` loads the self-test in development builds only).

```text
tests/
  unit/          One module each, mirroring src/: tests/unit/engine/layers.test.ts tests src/engine/layers.ts.
                 Also unit/electron, unit/scripts (Node code outside src/) and unit/support (the test kits' own tests)
  integration/   Several modules together, mirroring src/ by the main one: a store with its actions and the
                 engine (tests/integration/state/video.test.ts), the decoder pool with its frame sources, preview sound
  support/       Shared test helpers, not tests: fakes (fakeDecoder.ts, fakeAudio.ts), recordingCanvas.ts,
                 *.testkit.ts (frozen reference code to compare against)
  e2e/           Playwright, *.e2e.ts; gate.measure.ts is the Phase 1 gate measurement (npm run measure:gate)
  selftest/      The in-app self-test (selftest.ts) and its check modules (videoChecks, poolChecks,
                 playbackChecks, exportTiming, perfTiming, helpers)
```

Tests import the app through the `@/` alias (`@/engine/layers`), so moving a test never breaks its imports.
`tsconfig.tests.json` type-checks `tests/unit`, `tests/integration` and `tests/support` with the app.

**Unit or integration?** A test is a unit test when it exercises one module (its fakes and pure helpers from
`src/data/` aside). As soon as it needs a second app module to be real (a store plus the engine, a hook plus its
store), it is an integration test. Both run under Vitest in Node, without a DOM or canvas.

## Unit tests (Vitest)

Pure logic that runs without a browser: design loading and validation (`mergeDesign`), layout geometry for every
product × size × layout, where API keys may be sent (`keyAllowed`, `isResultHost`), photo fingerprints, and the
Instagram formats, batch limit, placement and colour maths, and the video formats, bitrates and per-platform limits.
The photo editor: light, curves, mixer, detail, LUT parsing, presets, masks (cached rasters against painting from
nothing, gradients against their formulas, AI parts from a map), GPU node graphs, the TIFF writer, the RAW embedded
preview reader and a synthetic DNG, segmentation map stretching and the pinned models. The video editor's sound (208): sound clip edits, the gain chain
against expected gains at 1,000 times, scans of tone bursts, the duck curve, loudness against EBU Tech 3341's
signals (synthesised in the test), the limiter's ceiling at 4× oversampling, and the export's sound plan.

Add a test as `tests/unit/<same path as the module>.test.ts` (or under `tests/integration/`, see above). Keep it free
of DOM and canvas: anything that needs them belongs in the self-test. Test files are type-checked with the app but
never reach `dist/`.

## Self-test (Electron)

The broad regression net. It renders every product × size × orientation × layout (front, back, envelope and template:
about 1,900 designs), builds a print pack per product, and checks saved designs, festival dates, credits, the AI
service against a fake provider, every agent tool and the performance sampler. For the photo editor, on every GPU
backend the machine has (WebGPU, WebGL2): colour, detail and mask parity with Canvas 2D on real photos, float
read-back, the 16-bit render against the 8-bit picture and its extra precision, timings; an AI mask from a stand-in
map and the real subject model in its worker; and every photo tool end to end on a generated photo. About 6,100
checks.

Add a check in `tests/selftest/selftest.ts` (or the check module for its area) with the `check(condition, 'what')`
helper. Run one in the browser by opening
the dev server with `?selftest` and calling `window.__chitthiSelfTest()` in the console.

## MCP smoke test

Starts the MCP server over stdio and drives it with the official client: lists tools, resources and prompts, builds a
calendar and a postcard, renders a preview, checks a design, exports a PDF, and checks that bad input returns an error.
Then the photo studio: a sample photo by path, colour settings, a radial and an AI subject mask, a preview, a preset
and the export; and a synthetic DNG developed by LibRaw and exported as a 16-bit TIFF.
Point it at a packaged app with `CHITTHI_MCP_APP=<path to Chitthi.exe>`, which also checks the Electron fuses and the
packaged file list.

## Browser tests (Playwright)

Builds `dist/`, serves it with `vite preview`, and in Chromium at desktop (1400×900) and phone (Pixel 7) sizes checks
that the home page and studio load without console errors, that every product switches, that the card in progress
survives a reload, and that home, studio and the sizes guide have no serious or critical WCAG 2.2 A/AA problems (axe).
The photo and video studio files cover the batch, every editing panel (light, curves, detail, presets and LUTs, masks
with brush, gradients, ranges and the real AI subject model, layers with blend modes and masks), export formats incl.
16-bit TIFF, RAW files on the web, Reel and YouTube exports; `tests/e2e/docs.e2e.ts` covers the in-app documentation.
`tests/e2e/instagram.e2e.ts` covers the photo studio: the batch limit, editing and reordering, a ZIP of 1080 px JPEGs,
the posting flow, the caption counter, and accessibility. `tests/e2e/editors.e2e.ts` covers layers, drawing and undo, and
exports a Reel with text and generated music, checking the MP4 (`ftyp`, `moov` before `mdat`, H.264, AAC,
1080 × 1920); edits the timeline by dragging (trim, reorder) and from the keyboard (split); and exports a YouTube video
into a stand-in for the browser's save picker, checking that it streamed with fast start at 1920 × 1080. `vite preview` sends the production Content Security Policy (from `nginx/security-headers.conf`), and
the tests fail on any console error, so anything the policy would block on a real server fails here first.

First run: `npx playwright install chromium`. On failure, `npx playwright show-report` opens the report with a trace
of each failed test.

## Not automated yet

- Firefox and Safari (WebKit): add projects in `playwright.config.ts` when needed.
- Printing on paper: use the print samples (`npm run build:print-samples`, [print-quote](../docs/print-quote/README.md)).
- Signed installers and auto-update: manual, in [release.md](release.md).
- **The listening test** (208 AC-15, run in each phase's test pass): export a 60-second vlog with music on the Music
  track, a voice on a Voice track and two effects, ducking on and −14 LUFS, and listen on headphones and a phone
  speaker: the music dips under every sentence without pumping between words, nothing clicks at cuts, fades or ducking
  edges, the limiter doesn't audibly distort, and the preview sounds like the file. Upload it unlisted to YouTube:
  "Stats for nerds" shows a content loudness within 1 dB of 0 dB.

## Rules

1. **Test-first for pure logic.** Write the failing Vitest test in `tests/unit/` (mirroring the module), then the code.
2. **Anything that renders gets a self-test check**; preview/export parity is checked against Canvas 2D on every GPU
   backend the machine has.
3. **Agent tools are tested too.** A feature reachable from `src/agent/tools.ts` is covered by the self-test, and by
   `test:mcp` when it crosses the IPC/MCP boundary.
4. **Time and randomness are inputs.** Logic takes time/seeds as parameters so tests are deterministic.
5. **No flaky waits.** Wait on real signals (events, DOM attributes, `data-*` readiness), not fixed sleeps. A flaky
   test is a bug: find the race, don't add retries.
6. **E2E fails on any console error**, including CSP violations, because `vite preview` serves the production CSP.
7. **Prove important tests can fail** by briefly breaking the code they cover, then restoring it.

## Commands

```bash
npm run check          # fast gate — typecheck + lint + unit tests; must pass before any task is ticked
npm run test:unit      # unit tests only
npm test               # Electron self-test (~6,100 checks)
npm run test:mcp       # MCP smoke test (npm run fetch:libraw once first)
npm run test:e2e       # Playwright + axe on the production build, desktop and phone
npm run build          # typecheck + vite build + bundle budget (entry chunk ≤ 350 KB, no AI code)
npm run check:licenses # every shipped package has an allowed licence
npm run format         # Prettier
```
