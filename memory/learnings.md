# Learnings & Gotchas

Non-obvious facts discovered while building. Keep entries short; group by topic (`## <Topic>`). Add one when
something cost more than ~10 minutes or the fix was non-obvious. Delete entries that become wrong.

## Docs

- Line endings in the working tree differ per file (e.g. `specs/lld.md`, `CHANGELOG.md` CRLF; most others LF);
  git stores LF (`core.autocrlf`, no `.gitattributes` rule for `.md`). Keep each file's own endings when editing by
  script. Git Bash's `grep -c $'\r$'` does not see the CRs, so it can't tell them apart: count bytes instead, e.g.
  `python -c "b=open('f','rb').read(); print(b.count(b'\r\n'), b.count(b'\n'))"`.
- The Edit tool can also turn a CRLF working copy into LF (`specs/constitution.md`, 402 T080). Count the endings
  before and after editing a CRLF file, and put them back if they changed.
- Scripted edits through a Bash heredoc on this machine can mangle `…`, `’` and backslash escapes (`\b` became a
  backspace). Write the edit script to a file with the Write tool, or use the Edit tool. Long quoted heredocs
  (`<<'EOF'`, ~120–200 lines of TypeScript) can also fail outright with "unexpected EOF while looking for matching
  `''" and write nothing (205 T012): append code with the Edit tool.
- Git Bash's `sed -i` rewrites a whole CRLF file as LF, even for a one-line change (201 T013, `layers.ts`). Use the
  Edit tool or a Python script with `newline=''` on CRLF files, or restore the endings afterwards.
- A Python patch script with multi-line patterns finds nothing in a CRLF file read with `newline=''` (most of `src/`
  is CRLF). Read, `.replace(chr(13) + chr(10), chr(10))`, patch, write back with `chr(10)` → `chr(13) + chr(10)`;
  spell the endings with `chr()` since `\r\n` typed through a Bash heredoc or `python -c` becomes real line breaks
  (201 T022).

## Tests

- When running a suite to count results, keep its failure lines: `npm run test:e2e 2>&1 | tail -2` showed only
  "66 passed" and lost the name of a test that failed once (001 T004). Grep for `✘` / `failed` / `flaky` instead.
- A source scan for `setError\(` also matches `PresetError(`: use word boundaries (`\bsetError\(`).
- A frame-rate check from `requestAnimationFrame` intervals can't see slow updates when input is slower than the
  display (at 120 Hz most frames carry no move): measure the time between handled input events instead (001 T020).
- On Windows, Node's `setTimeout(16)` often waits ~31 ms (timer tick 15.6 ms): pace with `performance.now()` and
  `setImmediate` when timing matters. And `chrome.exe --version` doesn't print a version there: it opens a window.
- Don't return whole canvases from `page.evaluate` in e2e tests: `Array.from(getImageData(...).data)` took 8+ s on
  the CI runner (no GPU, software WebGL) and blew a 5 s `expect.poll`. Compare inside the page and return a number.
  CI logs and artifacts need `gh` (signed in): `gh run view <id> --log-failed`, `gh run download <id> -n playwright-report`.

## UI

- Playwright's `keyboard.press` reaches the page's `keydown` but never the browser's own shortcuts (Alt + ← doesn't
  go Back even in headed installed Chrome), so e2e can't test "does `preventDefault` stop the browser shortcut".
  Injecting real OS keys (`keybd_event`) into a Playwright window is unreliable: Playwright fakes page focus
  (`document.hasFocus()` true while the window isn't in front), so the keys land elsewhere. Check browser
  shortcuts by hand (202 T001).

- A menu that focuses its first / checked item in `requestAnimationFrame` (as `MoreMenu` does) loses keys pressed
  right after opening: Playwright's next `press` (or a fast user) lands on the button, and Enter closes the menu.
  Focus in a `useLayoutEffect` on the open state instead (201 T031, the track height menu).
- A `position: fixed` menu inside the timeline's sticky header column was painted under the clip blocks (z-index 2
  in the scroll area), which took its clicks; the keyboard test passed, only a mouse click showed it. Render such
  menus in a portal on `document.body`, and `stopPropagation` their keys: React events bubble out of a portal to
  the React parents (here the timeline's Space / S / Delete / arrow keys) (201 T032).

- A visually hidden input (`.vh`, `position: absolute`) inside a scrolling toolbar (`overflow-x: auto`, not
  positioned) is placed against the page, not the toolbar: off to the right it widened the page at 360 px though the
  toolbar itself scrolled. Give its label `position: relative` (202 T031, the tool picker's radios).

- Don't blank a React-rendered element from an e2e test (`el.textContent = ''` on `#toast`): React keeps its own
  node, so the same message set again isn't drawn, and a keyed child removed under it makes React lose the element.
  Blank the inner text node only, and give a repeatable message a changing `key` (202 T033, the toast).

- Mediabunny's `VideoSampleSink.getSample(t)` opens and closes a `VideoDecoder` on every call (~18 ms median with
  2 s key frames); `samples()` keeps one decoder per reader until its `return()`. Use readers for playback and
  `getSample` only for single seeks. Drawing full-size `VideoFrame`s in the export was 3–6.5 % slower than
  `CanvasSink`'s canvases (204 T001).

- Mediabunny's `VideoSample.toCanvasImageSource()` may hand back a `VideoFrame` that is closed in the next microtask:
  never keep it. To hold a decoded frame, take `toVideoFrame()` (its own frame, closed separately) and close the
  sample at once; a bare `VideoFrame` ignores the file's rotation / flip, so draw those samples to a canvas. Frames
  left open don't just leak: once a few dozen are held the `VideoDecoder` stops producing (204 T013 break-test: the
  pool's next `frame()` never answered). Self-test waits on decoders need a timeout (`within` in poolChecks.ts).
- An animated number on screen is read by screen readers at whatever value it shows: a count-up that hasn't run yet
  (a stop not scrolled into view) announced "0 of 20". Make the moving number `aria-hidden` and put the real value in
  screen-reader text (405 T034). Likewise, `aria-label` on a link replaces its whole content for screen readers: don't
  put one on a card whose text carries the facts.
- The dashboard read `?q=` / `?status=` only when the page mounted, so a link pasted into an open tab (only the hash
  changes) did nothing. Sync from the URL during render by comparing with the last seen query, not in an effect
  (405 T040). axe's WCAG 2.2 `target-size` flags 12 px dots used as links: give the link a 24 px box and draw the dot
  inside with `::before` (405 T043).

- Don't keep a resource that an effect disposes in `useMemo`: React StrictMode (on in `src/main.tsx`) runs every
  effect, its cleanup, then the effect again in development, so the memoised object stays disposed. The video stage's
  frame source did that and the stage drew nothing in `npm run dev` / `desktop:dev`, while production (e2e, export)
  was fine. Create it lazily in a ref and set the ref back to null in the cleanup. Tests that call the module directly
  or run the production build miss this; `poolChecks` now mounts the real `VideoWorkspace` in StrictMode on the dev
  server (204 T031 fix, found by the maintainer with DJI HEVC clips).

## Formatting

- Many `src/` files (e.g. `src/state/video.ts`, `Timeline.tsx`) aren't Prettier-formatted (long lines); `npx prettier
  --write` on one rewrites the whole file (+222 / −41 for a 40-line change in 202 T020). Format only new files; edit
  old ones by hand or by script. To undo, re-apply the change to `git show HEAD:<file>` (stored LF: restore CRLF).

## Engine

- Edit limits computed as sums don't land exactly on a source's ends: `(out − in) − out` is not `−in` in floating
  point, so a roll to the limit left `in` at −2.8e-17 and `checkTrack` failed. Clamp the stored edge itself
  (`Math.max(0, in + d)`, `Math.min(srcDur, out + d)`), not just the delta. Only seeded random edits found it
  (202 T017).

## 2026-10-11 — Self-test playback checks and throttled animation frames (204 T033)

Chromium runs `requestAnimationFrame` about once a second in `npm test`'s hidden window, and also in a shown window
that is covered or whose display sleeps (Windows stops vsync). The video stage draws only what the pool has ready at
each tick, so at ~1 Hz the picture never advances and sync checks see "0 flashes". Real-time checks go in
`CHITTHI_TEST_ONLY=pooltiming` (shown window, kept on top, occlusion tracking off, display awake: `scripts/test.cjs`);
hidden-window checks feed the pool between ticks instead of sleeping. If a pooltiming check fails oddly, look at its
frames-per-second first. Cost ~30 min.

## 2026-10-11 — Installing dependencies (Dependabot batch)

`npm ci` deletes `node_modules` first: with `npm run dev` (Vite) or `npm run roadmap` running from the checkout it
fails half-way with a permissions error (locked files) and leaves `node_modules` gutted. Stop them first. npm 11 runs
only install scripts allowed by `allowScripts`, and Electron 44 has no install script any more: after `npm ci` run
`node node_modules/electron/install.js` (unset `ELECTRON_RUN_AS_NODE`) or `npm test` has no Electron binary.
`electron-winstaller`'s install script (picks 7-Zip's architecture) is also skipped: check `npm run desktop:dist`
before a release.

## 2026-10-12 — Removing agent worktrees

Agent worktrees under `.claude/worktrees/` link `node_modules` to the main checkout's. `git worktree remove` fails on
them ("Invalid argument") and only unregisters; deleting the folder afterwards with `rm -rf` (Git Bash) gutted the main
`node_modules` (`.bin`, `@anthropic-ai` gone) even after the top-level link was removed with `rmdir`. Remove the
folders with `cmd /c rmdir /s /q` (doesn't follow junctions), or leave them; then `npm ci` (dashboard and dev server
stopped) and `node node_modules/electron/install.js` repair it.

## 2026-10-12 — A failed draw must not leave the canvas transformed

A held `VideoFrame` can be closed by the pool before the stage draws it; `drawImage` then throws. In `photoDrawer`
(instagram.ts) that happened between `save()`/`translate(centre)` and `restore()`, so the stage canvas stayed moved by
half the frame and every later draw landed in its bottom-right quarter (looked like a dim or missing clip). Any
`save()` around a draw that can throw needs `try { … } finally { restore() }` (now in photoDrawer and renderStack's
boxed path; guarded by the pool check "drawing a closed video frame leaves the canvas unchanged").

## 2026-10-13 — A layer's `w` alone isn't its size; evaluate before editing

A layer's Size slider is `scaleLayer` (a title's font size, a shape's height and stroke scale with `w`), so an
animated `w` must scale the whole layer when drawn (`layerAt`), and `updateLayerAt` scales an edited layer back to the
stored `w` before keeping it, or the font drifts with every edit. Anything that edits layers on the video (the stage's
pointer, the fields) works on `layersAt(layers, t)` and writes through `updateLayerAt`; a drawn stroke
(`onSetLayers`) must store every other layer as saved, not as shown, or their animated values get baked in.

## 2026-10-13 — Don't run prettier on single source files

Many files (e.g. `studio/Timeline.tsx`, `timelineRows.test.ts`) aren't prettier-formatted (lines past the 120 in
`.prettierrc.json`), so `npx prettier --write <file>` rewrites hundreds of unrelated lines. Match the file's layout by
hand; restore with `git checkout <file>` if it happened on a file with no other changes.

## 2026-10-13 — Long inline heredocs fail in the agent's Bash tool

Twice a long Python script passed inline (`python - <<'EOF' … EOF`) failed with `unexpected EOF while looking for
matching '` before touching any file; the content was heavy with quotes, apostrophes, backticks and `${…}`. Short
heredocs worked; the exact trigger wasn't found. For doc and code edits:
1. Prose in Markdown or `src/data/docs.ts`: the Edit tool, one exact replacement per section (no shell involved).
2. Many edits at once or scripted changes: write the script to the session scratchpad with the Write tool, then run it
   with a one-line command.
3. Heredocs only for short plain text (a CSS block, a memory note).
4. After doc changes: check relative links and run `npm run check`.

## 2026-10-13 — Single-quote `--result` notes

`npm run specs -- done … --result "…"` in double quotes lets the shell run any backticks in the note (`to` became
"to: command not found" and vanished from 206 T012's result). Pass the note in single quotes (write `’` for an
apostrophe), or fix a damaged note in `feature.json` with a small script.

## 2026-10-13 — A store selector must return the same value for the same state

`useVideo((s) => clipPlace(c.id, s))` returned a new object on every read, so `useSyncExternalStore` re-rendered
forever (React #185, "The result of getSnapshot should be cached") and the video editor showed the error screen as
soon as a clip was selected. It sat on `main` from 203 T054 (2026-10-12) until 407's baseline e2e run, because e2e
had been deferred to the phase's test pass (D-033). Selectors return primitives or objects already in the state
(`find` is fine; `filter`, `map`, `{…}` and helper results that build objects are not); derive objects in render.
The same run found 206's cut buttons over the clips' trim edges and 24 px touch-target failures (axe `target-size`).

## 2026-10-14 — eslint-plugin-sonarjs: drop its AWS rules; flat config "and" globs

`sonarjs.configs.recommended` includes ~20 `sonarjs/aws-*` rules for AWS CDK code. `aws-restricted-ip-admin-access`
alone took 19 % of `npm run lint` here (TIMING=15 npx eslint .). We have no AWS code, so `eslint.config.js` filters
them out. To scope a rule to "this folder AND .tsx", use a nested array in flat config: `files: [['src/engine/**',
'**/*.tsx']]` (rewriting glob strings breaks on folder globs like `src/engine/**`).

## 2026-10-14 — typescript-eslint strict presets repeat `recommended`; type-aware rules need a tsconfig

`tseslint.configs.strictTypeChecked` contains every `recommended` rule at `error`, so re-mapping a preset to `warn` would
quietly weaken the existing gate: `eslint.config.js` skips the `recommended` rule names (`TS_RECOMMENDED`). Type-aware
rules (`projectService`) fail with "not found by the project service" on a file no tsconfig includes (`tests/e2e`, root
configs), so they are scoped to `TYPED_FILES`. Some `sonarjs/` rules switch on when type information exists (Sonar
findings rose 297 → 417 in `src/`).

## 2026-10-14 — Clean-up patterns that satisfy lint and `noUncheckedIndexedAccess` together (407 T030)

- **Indexed reads that may miss:** `list.at(index)` returns `T | undefined` under both checks. With `list[index]`,
  a guard is "unnecessary" to `no-unnecessary-condition` (flag off) but needed once the flag is on.
- **TypeScript narrows `lane.closed` across `await`:** after `if (lane.closed) return;`, a later check of
  `lane.closed` (other async work changed it) is flagged "always falsy". Read it through a method (`isClosed(lane)`)
  with a comment saying why; don't delete the check.
- **Splitting a module can create a load-time cycle:** `keyframeGate.ts`'s top level read `KEY_LIMITS` from
  `keyframes.ts`, which imports `layers.ts`, which imports the gate: `KEY_LIMITS` was still undefined ("Cannot read
  properties of undefined (reading 'perValue')", 6 test files failed to load). A module's top level must not read
  values from a module in a cycle with it; move the constant to the module that reads it at load.
- **Never `git checkout -- <file>` to undo a planted line** in a file with uncommitted work: it restores the last
  commit and throws the work away (lost `stack.ts`'s rewrite once). Plant in a new file, or copy the file first.

## 2026-10-14 — Refactoring a renderer with no unit tests: compare call logs old vs new (407 T033)

`engine/render.ts` had no unit tests (only the self-test, run at the phase's end). Before splitting it, a temporary
copy of the old file (`src/engine/renderGolden.ts`) and a scratch Vitest file drew 11,100 cases (every product × size
× orientation × layout × 4–5 design variants × front / hint / back) on a recording 2D context (a Proxy logging every
call and property set; `measureText` returns widths from the font size; gradients are named objects) through both, and
compared the logs line by line: 9 million lines in 6 s. Planted one-number changes in four modules each failed it.
Neither file is committed. When a loop's text fitting is folded into a helper, keep the exact call order: a
`for (k < 40 && …)` loop wraps once more at the last size before stopping, and draws those lines.

## 2026-10-14 — Splitting a module can move code into the entry chunk (Rolldown)

When lazy screens reached a function through a big module, Rolldown kept that module in a shared chunk. After the
split they import a small module instead, so the big one is needed only by the entry and is folded into it: entry
327 → 347 KB with the same start-up bytes. Compare `npm run build`'s entry figure after every split; a named
`codeSplitting` group (`includeDependenciesRecursively: false`) restores the old chunk (D-041).

## 2026-10-14 — Comparing gates old vs new: random junk rarely reaches the deep branches (407 T034)

Feeding `mergeMasks` / `mergeLayers` thousands of random junk values matched old and new, yet a planted change to a
stroke's clamp went unnoticed: junk almost never builds a stroke with an even number of finite points, so that branch
never ran. Add near-valid inputs (a valid shape with random values, some out of range) next to the junk, and plant a
change in each deep branch to prove the comparison reaches it. In shell loops, `read -r`: plain `read` strips the
backslashes of a planted `sed` pattern.

## 2026-10-14 — Per-pixel loops: one call per pixel, no array destructuring (407 T035)

Splitting `chainPixels` into small per-pixel functions (chainPixel → lightStep → toneFor → the later steps, colour
through an array) made the light-only Canvas path 9–20 % slower, though every function was tiny: V8 stops inlining past
a depth, and `const [a, b, c] = tuple` per pixel costs. Typed scratch buffers didn't help. What did: the light maths
inline in one function per pixel (colour in plain numbers or a reused object), and the later steps called only when one
of them is on (0–6 %, noise). `lookPixels` keeps its looks inline for the same reason (its comment says 2–3×). Time
old against new, interleaved, medians over 9+ rounds: single runs on this machine swing ±15 %.

## 2026-10-14 — Readable code costs bytes in the entry chunk

Minifiers rename locals but keep property names, function boundaries and `?? 0` checks: cleaning `export.ts` and
`analyze.ts` (both in the entry through `state/`) added ~1.8 KB (entry 327 → 329 KB). `String()` around numbers in
template strings is unneeded here (D-040 `allowNumber`) and costs bytes; leave numbers bare.

## 2026-10-14 — The entry figure alone misleads: sum the start-up chunks (407 T036)

After T036 the entry chunk fell 317 → 311 KB, but start-up JavaScript rose 463,181 → 465,073 bytes: Rolldown moved the
envelope geometry into a small chunk of its own that the entry still imports statically. To see what really loads at
start, sum the files `dist/index.html` names (`src=` and `modulepreload` `href=`), and compare with a build of the
previous commit (a `git worktree` with a junction to `node_modules` builds in a minute).

## 2026-10-14 — Scratch harnesses: shell quoting and thenable fakes (407 T036)

- In this Git Bash, `node -e "…"`, heredocs and `sed` replacements lose backslashes (`\\w` → `w`, `\\n` → a real
  newline, `'﻿'` → the character itself): a regex rename once mangled every identifier in `patterns.ts`. Write
  scripts and harness files with the Write tool and run them with `node <file>`.
- A recording `Proxy` that answers every property also answers `then`, so returning it from an `async` function makes
  it a thenable that never settles: the test hangs until its timeout. Return `undefined` for `then` (real jsPDF and GPU
  objects have none).

## 2026-10-14 — Lockstep store harnesses: draw random values once per step, steer towards rare paths (407 T041)

Comparing an old and a new store by running each random step on both: any `random()` called *inside* the per-module
action runs twice and gives each module a different input (three false failures). Draw every value before the step,
then apply the same values to both. Plain random steps also left gaps that planted changes slipped through: the undo
grouping window (800 ms), the 80-step undo limit and a selection restored by undo. What reached them: repeating the
previous action 40 % of the time, time gaps clustered around the window, acting mostly on the selected item, redo
right after undo, and short deterministic sequences for limits; log how often each action really changes the state.
Cap anything that compounds (copying layers to every photo filled memory and killed the Vitest worker, exit 134).

## 2026-10-15 — Record lookups and worker `self` under both checks (407 T043)

- A record lookup (`outputs[name]`) is "always defined" to `no-unnecessary-condition` (flag off) but `| undefined`
  under `noUncheckedIndexedAccess`; an annotation (`const x: T | undefined = record[k]`) doesn't help, the lint
  narrows to the assigned type. `Object.entries(record).find(([key]) => key === name)?.[1]` or a `Partial<Record>`
  type satisfies both. Arrays: `.at()` (above).
- In a worker file with `/// <reference lib="webworker" />`, `self` is still typed as the window; write
  `declare const self: DedicatedWorkerGlobalScope;` once instead of casting at each `postMessage`.
- Frozen-copy harnesses on code that crashed on junk: classify a `TypeError` from the old copy as a crash and require
  only that the new code doesn't crash there; compare every other outcome exactly, so real changes still fail.

## 2026-10-15 — Splitting a component can surface React compiler findings (407 T050)

The `react-hooks` compiler rules skip functions they can't analyse, so the 328-line `Timeline` showed none; once its
effects moved into small hooks, two appeared (`set-state-in-effect` for a width set in a layout effect,
`immutability` for writing `scrollLeft` on a ref passed in as a hook argument). Lint each new component file right
after a split. Fixes that keep behaviour: let a ResizeObserver's first callback set the size (it fires on observing),
and create the ref inside the hook that writes through it, returning it.

## 2026-10-15 — A hook that returns an object used as an effect dependency must memoise it (407 T051)

Folding several stable `useCallback`s into one returned object (`useStageSources` → `{ stage, videoFor, sound }`)
makes a new object on every render; an effect that lists it (the stage's playback loop, which renders every frame)
would restart each frame. `useMemo` the object over the callbacks. Likewise list a format's id, not the object a
lookup like `vFormat(id)` returns, in effect dependencies.
