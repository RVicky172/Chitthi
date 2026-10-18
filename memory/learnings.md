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

## 2026-10-15 — Casts on union patches are rarely needed (407 T054)

`Partial<Layer>` (a union) is distributive, so a handler typed `(patch: Partial<Layer>) => void` can be passed where
`(patch: Partial<TextLayer>) => void` is expected: type each kind's panel by its kind and the `as Partial<TextLayer>`
casts go. Spreading a union value keeps the union (`{ ...part, combine }` stays a `MaskPart`), so replace a generic
`patch(id, Partial<MaskPart>)` + `as MaskPart` with whole typed parts built where the kind is already narrowed. A
factory returning the union (`newPart('linear')`) narrows with `part.kind === 'linear' ? { ...part, … } : part`.

## 2026-10-15 — Mass renames through the language service, with a scope check (407 T055)

590 one-letter names in 44 files were renamed with a scratch script on `ts.createLanguageService` +
`findRenameLocations` (with `providePrefixAndSuffixTextForRename`, so `{ x }` becomes `{ x: newX }`), from a plan of
`"line:col:old": "new"` per file, applied bottom-up and skipped when the text at the position isn't the old name
(earlier renames on the line move columns: re-dump and rerun). The rename itself never checks for capture: before
each one, `checker.getSymbolsInScope` at every location must not already hold the new name (it caught `theme`,
`slot`, `page`, `size`, `product`, `count`, `row`…). Lib globals clash too (`event` is `window.event`):
allow them unless the file uses the name bare. Renaming a destructured prop renames the property and keeps the local
(`{ sample: r }`): rename the local next. tsc stays green throughout; review a diff per batch.

## 2026-10-15 — Regex groups, `[first, second]` and `??` under both checks (407 T055)

`match[4] ?? ''` is "unnecessary" to the lint (groups are `string`) but needed under `noUncheckedIndexedAccess`;
`match.at(4) ?? ''` satisfies both. The same goes for destructuring a spread array (`const [a, b] = [...map.values()]`):
use `.at(0)` / `.at(1)`. A closure flag (`let live = true` cleared in an effect's cleanup) reads as "always falsy"
after an earlier check; `const closed = new AbortController()` alone doesn't help either (the property narrows): read it
through a function, `isClosed = () => closed.signal.aborted`.

## 2026-10-15 — React compiler lint: async, `use`, and resets on a prop change (407 T056)

- `set-state-in-effect` treats state set after an `await` as set synchronously when the effect calls the async
  function (even through `useEffectEvent`). Write the fetch as a promise chain (`.then(onResult, onError).finally()`):
  setters inside callbacks pass.
- A local function named `use` is read as React's `use()` hook, so its body counts as render code (`Date.now()` in
  it was a `purity` error). Rename it. A `Date.now()` in an async handler can still be flagged: move the handler's work
  to a module function.
- State reset when a prop or store value changes (dialog opens, a new photo, a new year from outside) moves from an
  effect to render: `const [seen, setSeen] = useState(initial); if (value !== seen) { setSeen(value); …resets }`.
  Start `seen` at `null` / `false` when the component can mount already open (lazy dialogs), or the first reset is
  skipped. DOM work (`showModal`, ref writes) stays in the effect.
- A callback that reads a ref, passed to a function called during render (`commands(() => ref.current.click())` in a
  `useMemo`), is a `refs` error: hand it over when the command runs instead (`command.run({ pickFiles })`).
- `preserve-manual-memoization` ("dependency may be modified later") on a value from a plain function call: memoise
  the value it comes from too, so the compiler treats it as frozen.

## 2026-10-16 — Node's FormData.append throws on a string with a third argument (407 T061)

`form.append(name, 'text', undefined)` throws in Node / Electron's main process ("Expected value to be an instance
of Blob"): with three arguments the value must be a Blob, even when the file name is `undefined`. `electron/ai.cjs`
did this for every text field, so Stability and Ideogram pictures failed on desktop from 2.5.0 to 2.10.0 (browsers'
FormData is the same; only the desktop path built forms this way). Pass the file name only for Blobs.
`tests/unit/electron/*.test.ts` load the `.cjs` modules by a plain `import` (as the scripts tests load `.mjs`); the
unit tsconfig has no Node types, so the tests use `Uint8Array`, and TypeScript reads the modules' JSDoc types:
keep those accurate (`{Uint8Array}` for a parser that only indexes bytes).

## 2026-10-16 — `useSyncExternalStore` with a version counter breaks under the React Compiler (407 T071)

`useAiStatus` and `useFallbackNote` called `useSyncExternalStore(subscribe, () => version)`, threw the result away
and then read a module-level Map during render. Without the compiler that works (the version change re-renders); with
it, `statuses.get(key)` is memoised on its arguments and the new value never shows (e2e: AI mask status and the sky
download prompt missing). The `react-hooks` lint does not flag it. Fix: return the value itself as the snapshot
(`useSyncExternalStore(subscribe, () => map.get(key))`); keep snapshots stable (same object until it changes).
Also measured: oxc-transform-react 0.152 grows compiled components ~40 % (media studio chunk 201 → 281 kB; whole-app
entry 313 → 337 KB).

## 2026-10-16 — A tsconfig change doesn't invalidate the ESLint cache (407 T070)

Turning on `noUncheckedIndexedAccess` made `list[0]` reads `string | undefined`, so `prefer-nullish-coalescing`
flagged five `a[0] || fallback` lines in `FINISHED` folders, but `npm run check` (cached lint) stayed green; they
showed only after `node_modules` was reinstalled. After any tsconfig or type change, run `npm run lint:full`. Where
`||` deliberately treats '' as missing, write `(list[0] ?? '') || fallback` (as `engine/layers.ts` `firstLine`).

## 2026-10-16 — Hot-loop speed: measure in the Electron renderer, interleaved, against a copy of `main` (407 T072)

Node 24 runs V8 13.6, Electron 44 runs 15.2, and they disagree: `?? 0` on typed-array reads cost 17–34 % in the
renderer and ~0 in Node; on arrays of objects `keys[i]?.t ?? Infinity` cost ~50 % in both, while
`const key = keys[i]; if (key === undefined) break;` cost nothing. `keys.at(i)` and `Object.hasOwn` per sample cost
too. Even Electron's node mode (`ELECTRON_RUN_AS_NODE=1 electron bundle.mjs`, bundled with `rolldown`) differs from the
renderer, but it takes V8 flags: `--trace-turbo-inlining` shows the inlining budget (920 bytecodes per optimised
function) and what got left out. Results depend on warm-up order (what ran first in the page), so time each order.
What worked for A/B: copy `main`'s `src/` into the repo (a gitignored-style temp folder), import both versions into one
self-test page and alternate rounds (11, medians); back-to-back runs swing ±15 %. Delete the copy before
`npm run check` (it fails typecheck). Remove a worktree's `node_modules` junction (`cmd /c rmdir`) before
`git worktree remove --force`, so the removal can't follow it.

## 2026-10-16 — Codemods: `ts.forEachChild` stops at a truthy return (407 T062)

A recursive name collector written as `ts.forEachChild(node, (child) => collect(child, out))` returned the Set, which
is truthy, so `forEachChild` stopped after the first child: the "is this name free in the scope?" check saw almost
nothing, and a rename made a parameter shadow an inner `const` (18 unit tests caught it). Give the callback a block
body that returns nothing. Rename through `LanguageService.findRenameLocations` with
`providePrefixAndSuffixTextForRename` (keeps shorthand `{ x }` working) and check new names against every identifier in
the scope (properties too: conservative but safe), and against `no-shadow` counts before and after. Other traps: with
`core.autocrlf=true` a `git checkout -- path` writes CRLF working copies, so exact-text edit scripts must normalise
`\r\n`; typescript-eslint (TS 6) can call an `as` cast unnecessary that `tsc` (TS 7) needs: use `satisfies`.

## 2026-10-18 — Plain Simpson misses a ramp's 1 µs on steep curves (207 T013)

A ramp's play time integrates 1 / v; where the speed curve dips to 0.1× next to a 10× point (the monotone spline
flattens at the trough), 1 / v is a spike about 0.003 of the source part wide, under two steps of a 512-step table.
One Simpson panel per step was off by hundreds of µs on a 4 s part. `speed.ts` integrates each step with adaptive
Simpson, split at the ramp's points (the spline is only C¹ there); the test's reference (51,200 plain steps) is fine
because its steps are 150× narrower than the spike.

## 2026-10-18 — A reader's cost starts at the key frame before it (207 T020)

Mediabunny's `VideoSampleSink.samples(start)` decodes from the key frame before `start` and drops the frames before
it, and pre-decodes a few frames past what was read unless an `end` is given. So a reader's cost is not the frames it
hands out: a fake decoder that starts exactly at `start` (the 204 fake) can't measure reverse or speed-up costs. The
fake's `gop` option models it (`counts.decoded`). Reverse chunks must start on a key frame (`keyBefore`), else each
key-frame group is decoded about twice.

## 2026-10-18 — A reversed clip's `sourceAt(clip, 0)` is the frame after it (207 T022)

`sourceAt` reversed is `out − local × speed`, so at local 0 it is exactly `out`: the frame *starting* at `out`, one
past the clip's last frame (frames cover `time ≤ t < time + duration`). The pool primes a reversed lane at
`out − 1 ms` (`BEFORE_OUT`), and the pool tests ask for the middle of frame `out − 1`. T030 (drawers through
`sourceAt`) must not ask a reversed clip for `out` itself, or the first frame shown belongs outside the clip (and at
the file's end, `covers`' tail rule hides it).

## 2026-10-18 — Cutting a spline ramp changes it between its points (207 T043)

Re-fitting a monotone (Fritsch–Carlson) spline through a subset of its points plus new end points does not give the
same curve between them: the slopes at each point come from its neighbours, and the ends use one-sided formulas. For
ramps that dip hard (Bullet 4× → 0.2×) a split changed the parts' play time by up to 32 %; adding sampled points still
left 130 ms. Keep the curve and move the window instead (`rampSpan`, D-050). To measure such things quickly, a
throwaway test under `tests/unit/` that fails with the numbers in its message works (vitest hides `console.log` of
passing tests in this setup).

## 2026-10-18 — `copyToChannel` wants `Float32Array<ArrayBuffer>` (207 T053)

With TypeScript's generic typed arrays, a `Float32Array` returned from a function that may hand back its input is
`Float32Array<ArrayBufferLike>`, which `AudioBuffer.copyToChannel` refuses (it could be a SharedArrayBuffer view).
`buffer.getChannelData(index).set(samples)` takes any typed array and does the same copy.

## 2026-10-18 — A freeze frame is a video clip, so `kind === 'video'` branches catch it (207 T071)

D1 made a freeze frame a video clip with `freeze` and `dur`, so every `clip.kind === 'video'` branch takes it unless it
asks for `freeze === undefined`. Split did: it cut in / out at the frozen time and could leave `in === out` (found by
T070's seeded property test, not by the freeze tests). Freezes go with photos wherever length comes from `dur`: trims
(`isStill` in edits.ts), split (videoClips.ts), sound (`soundMuted`). Check new `kind === 'video'` code for it.

## 2026-10-18 — A test-first test keeps its "unresolved import" lint errors after the code exists (207 T082)

`npm run lint` caches with `--cache-strategy content`, keyed on each file's own content. A test written before its
module (T080) is linted with the import unresolved (`no-unsafe-call` on every use); once the module exists the test
file is unchanged, so the cached errors stay and `npm run check` stays red. Run `npx eslint <test>` (no cache) or
delete `node_modules/.cache/eslint/`; `npm run lint:full` is never stale.
