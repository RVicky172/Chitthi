# Learnings & Gotchas

Non-obvious facts discovered while building. Keep entries short; group by topic (`## <Topic>`). Add one when
something cost more than ~10 minutes or the fix was non-obvious. Delete entries that become wrong.

## Docs

- `.gitignore`'s unanchored `release/` (packaging output) ignores every folder named `release`, e.g. test fixtures;
  check new files with `git status --porcelain -uall`. `scripts/factory/fixtures/release/` has an exception (402 T070).

- Line endings in the working tree differ per file (e.g. `specs/lld.md`, `CHANGELOG.md` CRLF; most others LF);
  git stores LF (`core.autocrlf`; since 402 T034 also `* text=auto` in `.gitattributes`, so a script that writes LF
  into a CRLF file changes nothing in a commit, only the working copy). Keep each file's own endings when editing by
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

## Formatting

- Many `src/` files (e.g. `src/state/video.ts`, `Timeline.tsx`) aren't Prettier-formatted (long lines); `npx prettier
  --write` on one rewrites the whole file (+222 / −41 for a 40-line change in 202 T020). Format only new files; edit
  old ones by hand or by script. To undo, re-apply the change to `git show HEAD:<file>` (stored LF: restore CRLF).

## Engine

- Edit limits computed as sums don't land exactly on a source's ends: `(out − in) − out` is not `−in` in floating
  point, so a roll to the limit left `in` at −2.8e-17 and `checkTrack` failed. Clamp the stored edge itself
  (`Math.max(0, in + d)`, `Math.min(srcDur, out + d)`), not just the delta. Only seeded random edits found it
  (202 T017).

## Claude Code (headless)

- `claude -p --json-schema …` with `--agent X` silently returns no `structured_output` when X's `tools:` list
  doesn't include `StructuredOutput`; add it (or give the agent no `tools:` list) (402 T001).
- `--max-turns N` works in 2.1.294 though `--help` doesn't list it: the result is `subtype: error_max_turns`, exit 1.
  `claude -p` waits 3 s for stdin and writes a warning into the output: spawn it with stdin closed (402 T001).
- A first `-p` call with the full default prompt costs ~US$0.09–0.19 (cache writes); `--max-budget-usd 0.10` can
  end it (`error_max_budget_usd`) before it answers (402 T001).
- `--json-schema` refuses a schema with `"$schema": "https://json-schema.org/draft/2020-12/schema"` ("no schema with
  key or ref") and `claude -p` exits with nothing on stdout: leave `$schema` out (402 T042). Capture stderr when a
  headless run's output is empty.
- In `claude -p` nobody answers permission prompts: with `--permission-mode acceptEdits` every shell command not in
  `--allowedTools` is refused and listed in the result's `permission_denials` (402 T041, D-014).
- `claude agents` needs a TTY, and `claude agents --json` lists running agent sessions, not the definitions; to see
  an agent's real tools, start it with `claude -p --agent X` and read `tools` from the stream's init event (T040).
- A fresh worktree has none of the git-ignored resources: `test:mcp` fails without `electron/resources/libraw`
  (402 T041). Link or fetch them before running the gates there.
- A worktree can share the main `node_modules` through a junction (`mklink /J`, no admin rights); Vite, Vitest,
  Playwright and the Electron self-test all work through it. Remove the junction with `rmdir` **before**
  `git worktree remove`, so nothing deletes through the link into the main `node_modules` (402 T002).
- Hooks added to `.claude/settings.json` apply to the running Claude Code session at once, no restart: the
  guardrails refused this session's own `git tag` the moment the file was written (402 T032). Write the hook
  scripts and their tests first, register last; `CHITTHI_FACTORY_HOOKS=off` turns them off for a session.
- Tests that commit in a temp git repo inherit the machine's global git config (signing, `core.hooksPath`,
  autocrlf): set `user.name`/`user.email`, `commit.gpgsign false`, `core.hooksPath` to an empty path and
  `core.autocrlf false` locally in the temp repo, or a commit can hang or fail on another machine (402 T052).
- A script that renders or serves at top level can't be imported by its tests (importing `dashboard.mjs` wrote
  `.factory/dashboard.html`). Guard the entry with `import.meta.url === pathToFileURL(process.argv[1]).href`, as
  `run.mjs` does (402 T053).
- Don't check a desktop notification with a full-screen capture: it takes in everything else on the user's
  screen (402 T053). Exit code 0 from the PowerShell NotifyIcon call doesn't prove a toast was shown (Focus
  Assist can hide it), so a person has to look.
- Paths from git and from Node differ in case on Windows (`C:\WINDOWS\TEMP` vs `C:\Windows\Temp`), even after
  `realpathSync`; compare with `realpathSync.native(p).toLowerCase()` (402 T060).
- In a headless `claude -p --permission-mode acceptEdits` run, Write to `.claude/commands/*.md` is refused
  ("requested permissions … you haven't granted it"), while `scripts/` and `memory/` are fine: `.claude/` is
  protected config. A (loop) task whose files include `.claude/` can't be finished by the implementer; make those
  edits 👤 or in an interactive session (402 T061).
- Any task that adds a slash command under `.claude/commands/` blocks the unattended loop (the write is refused,
  so the run stops `question`). When writing tasks.md, mark such tasks 👤 or keep them out of **(loop)**, or split
  the command file into its own 👤 task. Seen on 402 T061 and T071.
- `.gitattributes` already existed (`*.onnx binary`) and was overwritten as if new (402 T034). Before writing a
  config file at the repo root, check `git ls-files <name>`.
