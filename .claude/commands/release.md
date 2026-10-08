---
description: Prepare release X.Y.Z (versions, cache name, CHANGELOG) and stop before the tag
argument-hint: <X.Y.Z>
---

Prepare release $ARGUMENTS with the release station (`scripts/factory/release.mjs`, 402 plan §7, AC-17;
checklist `specs/release.md`). The tag and the publish stay the maintainer's: this command never tags or pushes.

1. **Check first (don't fix anything yourself):** the branch is `main`, `git status --porcelain` is empty, and the
   version is X.Y.Z and greater than the one in `package.json`. If not, say what is wrong and stop: only the user
   decides what happens to their changes or which branch to release from.
2. **Prepare:** run `npm run release:prepare -- $ARGUMENTS`. It refuses (changing nothing) off `main`, on a dirty
   tree, on a version that isn't greater, on an empty Unreleased or when the files disagree on the current version.
   Otherwise it runs `npm version X.Y.Z --no-git-tag-version` (package.json and package-lock.json), bumps
   `APP_CACHE` in `public/sw.js`, the image tag in `docker-compose.yml` and the version in
   `plugins/chitthi/.claude-plugin/plugin.json`, and turns CHANGELOG's Unreleased into `## [X.Y.Z] - <today>` with
   a new empty Unreleased above it. It prints the rest of the checklist. From here it can't ask about the dry run
   (no terminal), so it doesn't start it.
3. **Report:** show `git diff --stat` and the CHANGELOG's new section heading, and list the remaining checklist
   items it printed (gates on `main`, `docs:specs` if specifications changed, docs, the desktop smoke check of the
   packaged app, commit and push `main`, the dry run).
4. **The dry run:** ask the user whether to start it once the release commit is pushed to `main`:
   `gh workflow run desktop-release.yml --ref main` (one dry run per release, D-006). Run it only after a clear yes,
   and only if `git status` is clean and `main` matches `origin/main`; otherwise tell them what is missing.

Never run `git tag`, `git push` or `git commit` here, and never pass `--test-branch` (it exists only to test the
script on a scratch branch). After a green dry run the user tags: `git tag vX.Y.Z` then `git push origin vX.Y.Z`.
To undo a prepared release before committing: `git checkout -- package.json package-lock.json public/sw.js
docker-compose.yml plugins/chitthi/.claude-plugin/plugin.json CHANGELOG.md`.
