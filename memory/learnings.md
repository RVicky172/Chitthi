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
  backspace). Write the edit script to a file with the Write tool, or use the Edit tool.
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

- An animated number on screen is read by screen readers at whatever value it shows: a count-up that hasn't run yet
  (a stop not scrolled into view) announced "0 of 20". Make the moving number `aria-hidden` and put the real value in
  screen-reader text (405 T034). Likewise, `aria-label` on a link replaces its whole content for screen readers: don't
  put one on a card whose text carries the facts.
- The dashboard read `?q=` / `?status=` only when the page mounted, so a link pasted into an open tab (only the hash
  changes) did nothing. Sync from the URL during render by comparing with the last seen query, not in an effect
  (405 T040). axe's WCAG 2.2 `target-size` flags 12 px dots used as links: give the link a 24 px box and draw the dot
  inside with `::before` (405 T043).

## Formatting

- Many `src/` files (e.g. `src/state/video.ts`, `Timeline.tsx`) aren't Prettier-formatted (long lines); `npx prettier
  --write` on one rewrites the whole file (+222 / −41 for a 40-line change in 202 T020). Format only new files; edit
  old ones by hand or by script. To undo, re-apply the change to `git show HEAD:<file>` (stored LF: restore CRLF).

## Engine

- Edit limits computed as sums don't land exactly on a source's ends: `(out − in) − out` is not `−in` in floating
  point, so a roll to the limit left `in` at −2.8e-17 and `checkTrack` failed. Clamp the stored edge itself
  (`Math.max(0, in + d)`, `Math.min(srcDur, out + d)`), not just the delta. Only seeded random edits found it
  (202 T017).
