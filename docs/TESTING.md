# Testing

Five suites check Chitthi, from fast unit tests to the packaged app. CI runs all of them on every pull request
(`.github/workflows/ci.yml`, on a Windows runner because the Electron suites need a desktop session).

| Command | Suite | Runs in | Time |
| --- | --- | --- | --- |
| `npm run lint` | ESLint (`eslint.config.js`) | Node | ~10 s |
| `npm run test:unit` | Vitest unit tests, `src/**/*.test.ts` | Node | ~1 s |
| `npm test` | Self-test, `src/dev/selftest.ts` | Electron against a Vite dev server | ~20 s |
| `npm run test:mcp` | MCP smoke test, `scripts/mcp-smoke.mjs` | Electron (headless MCP) + the official MCP client | ~20 s |
| `npm run test:e2e` | Browser tests with axe, `e2e/*.e2e.ts` | Chromium, desktop and phone sizes, against the production build | ~30 s |

`npm run build` also guards the bundle: it fails if the start-up script passes 350 KB or contains AI code.

## Unit tests (Vitest)

Pure logic that runs without a browser: design loading and validation (`mergeDesign`), layout geometry for every
product × size × layout, where API keys may be sent (`keyAllowed`, `isResultHost`), photo fingerprints, and the
Instagram formats, batch limit, placement and colour maths, and the video formats, bitrates and per-platform limits.

Add a test next to the module as `name.test.ts`. Keep it free of DOM and canvas: anything that needs them belongs in
the self-test. Test files are type-checked with the app but left out of the library build.

## Self-test (Electron)

The broad regression net. It renders every product × size × orientation × layout (front, back, envelope and template:
about 1,900 designs), builds a print pack per product, and checks saved designs, festival dates, credits, the AI
service against a fake provider, every agent tool and the performance sampler: about 6,000 checks.

Add a check in `src/dev/selftest.ts` with its `check(condition, 'what')` helper. Run one in the browser by opening
the dev server with `?selftest` and calling `window.__chitthiSelfTest()` in the console.

## MCP smoke test

Starts the MCP server over stdio and drives it with the official client: lists tools, resources and prompts, builds a
calendar and a postcard, renders a preview, checks a design, exports a PDF, and checks that bad input returns an error.
Point it at a packaged app with `CHITTHI_MCP_APP=<path to Chitthi.exe>`, which also checks the Electron fuses and the
packaged file list.

## Browser tests (Playwright)

Builds `dist/`, serves it with `vite preview`, and in Chromium at desktop (1400×900) and phone (Pixel 7) sizes checks
that the home page and studio load without console errors, that every product switches, that the card in progress
survives a reload, and that home, studio and the sizes guide have no serious or critical WCAG 2.2 A/AA problems (axe).
`e2e/instagram.e2e.ts` covers the photo studio: the batch limit, editing and reordering, a ZIP of 1080 px JPEGs,
the posting flow, the caption counter, and accessibility. `e2e/editors.e2e.ts` covers layers, drawing and undo, and
exports a Reel with text and generated music, checking the MP4 (`ftyp`, `moov` before `mdat`, H.264, AAC,
1080 × 1920); edits the timeline by dragging (trim, reorder) and from the keyboard (split); and exports a YouTube video
into a stand-in for the browser's save picker, checking that it streamed with fast start at 1920 × 1080. `vite preview` sends the production Content Security Policy (from `nginx/security-headers.conf`), and
the tests fail on any console error, so anything the policy would block on a real server fails here first.

First run: `npx playwright install chromium`. On failure, `npx playwright show-report` opens the report with a trace
of each failed test.

## Not automated yet

- Firefox and Safari (WebKit): add projects in `playwright.config.ts` when needed.
- Printing on paper: use the print samples (`npm run build:print-samples`, [print-quote](print-quote/README.md)).
- Signed installers and auto-update: manual, in [RELEASE.md](RELEASE.md).
