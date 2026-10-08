---
description: Run a feature's agent tasks unattended (the software factory's loop) and notify when it stops
argument-hint: <NNN> [--once] [--budget 10] [--max-turns 40] [--plan] [--worktree]
---

Run the factory loop on feature $ARGUMENTS (`scripts/factory/run.mjs`, 402 plan §5; `specs/software-factory.md`).

The loop implements the feature's agent tasks one after another: implementer → gates → reviewer → commit → next,
and stops on everything a person must decide (a 👤 task, a stopped task, a spec change, a new dependency, a third
failure, the budget, Verify). It never pushes, merges, tags or resets; a stop before a commit stashes the work.

1. **Check first (don't fix anything yourself):** the branch is `feat/<NNN>-*` and `git status --porcelain` is
   empty. If not, tell the user what to do (check out the branch; commit or stash their own changes) and stop: the
   loop refuses a dirty tree, and only the user decides what happens to their work. With `--worktree` (402 §6) the
   check is on the feature's own worktree instead: the loop makes or reuses `../Chitthi-wt/<NNN>` on `feat/<NNN>-*`
   (created from `main` if missing; `node_modules` and the git-ignored resources linked from this checkout), so this
   checkout may stay on any branch. Its gate runs take the gate lock, so two lines never run gates at once. Afterwards
   `npm run factory -- <NNN> --remove-worktree` removes it (links first; the branch stays).
2. **Preview:** run `npm run factory -- <NNN> --plan` and show the user the next task(s), the gates and the commit
   subject in two or three lines. If the arguments include `--plan`, stop here.
3. **Dashboard:** if nothing answers on `http://127.0.0.1:4310`, start `npm run factory:dashboard -- --serve` in
   the background (Bash `run_in_background`) and give the user the link. Its **Loop** panel shows the feature, task,
   phase and attempt within 10 s of each change, and the stop's reason.
4. **Start the loop in the background** (Bash `run_in_background: true`, so this session stays free), with the
   notification chained after it so it fires however the run ends:

   ```bash
   node scripts/factory/run.mjs $ARGUMENTS; code=$?; node scripts/factory/notify.mjs --state; exit $code
   ```

   With `--worktree` the state is the worktree's: chain `node scripts/factory/notify.mjs --state
   ../Chitthi-wt/<NNN>/.factory/state.json` instead (the dashboard's Loop panel shows this checkout's state only).
   `notify.mjs --state` reads `.factory/state.json` and shows the stop as a Windows balloon (a toast on Windows
   10 / 11; macOS: Notification Center), rings the terminal bell and prints one line (`CHITTHI_FACTORY_NOTIFY=off`:
   that line only). Tell the user the loop is running, where to watch it, and that you'll report when it stops.
   Don't poll it.

5. **When the background task ends** (you are re-invoked): read the last lines of its output and
   `.factory/state.json`, then report in a few lines: commits made (`git log --oneline <start>..HEAD`), cost and
   turns, the stop kind and reason, any stash (`git stash list -1`) and refused commands, and what the user has to
   decide. Your reply is what Claude Code's own notification carries, so lead with the stop. Don't restart the loop
   or apply a stash without being asked.

Never pass `--no-verify`, push, or edit the loop's commits. To stop a running loop, the user stops the background
task; the work in progress stays in the tree (stash it or keep it: their call).
