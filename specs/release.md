# Release checklist

A release is a version tag: it builds the desktop installers (which installed apps update to) and is what web
deployments run. [build.md → Releasing](build.md#releasing-a-new-version) explains the pipeline; this page is the
checklist to follow each time, and what to do when a release goes wrong.

## Before tagging

- [ ] Every Definition-of-Done gate passes locally on `main` (CI does not run on branches or pull requests, D-006).
- [ ] [CHANGELOG.md](../CHANGELOG.md): move **Unreleased** under the new version and date; call out security fixes.
- [ ] `npm version X.Y.Z --no-git-tag-version` (package.json and the lock file).
- [ ] Bump `APP_CACHE` in `public/sw.js`, the image tag in `docker-compose.yml`, and the version in
      `plugins/chitthi/.claude-plugin/plugin.json`.
- [ ] `npm run docs:specs` if sizes, layouts or products changed.
- [ ] Docs updated for anything users or operators will notice.
- [ ] Desktop smoke check of the packaged app:
      `npm run desktop:pack`, open `release/win-unpacked/Chitthi Studio.exe` (or the macOS app), make a card, export a
      print pack, then `CHITTHI_MCP_APP=<path to the exe> npm run test:mcp`.
- [ ] Commit and push `main`, then the **dry run**: run the **Desktop release** workflow by hand on `main` (Actions →
      Desktop release → Run workflow). CI must be green (lint, licences, build, unit, self-test, MCP, browser and
      Docker checks) and the installers build; nothing is published.

## Tag and publish

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

The **Desktop release** workflow runs CI first (`ci.yml`, the release's only CI run, D-006); if it passes, it builds
Windows and macOS and publishes one GitHub Release with the installers and the `latest*.yml` update manifests. A red
CI stops it before anything is built or published: fix, push, and tag again (delete the failed tag first with
`git push origin :refs/tags/vX.Y.Z`).

## After publishing

- [ ] Download each installer from the release page and install it on a clean machine (or VM).
- [ ] Signed builds: check the signature (Windows: file Properties → Digital Signatures; macOS:
      `spctl -a -vv /Applications/Chitthi.app` says "Notarized Developer ID").
- [ ] An installed older version finds the update (Help → Check for updates…).
- [ ] Redeploy the web app ([OPERATIONS.md → Upgrade](../docs/OPERATIONS.md#upgrade)).

## Signing

Releases should be signed (Windows code-signing certificate or Azure Trusted Signing; Apple Developer ID with
notarization). Until the signing secrets are added, builds are unsigned and SmartScreen and Gatekeeper warn users.
[DESKTOP.md → Code signing](../docs/DESKTOP.md#code-signing) lists the secrets.

## When a release goes wrong

**Web:** redeploy the previous tag ([OPERATIONS.md → Roll back](../docs/OPERATIONS.md#roll-back)).

**Desktop:** the auto-updater installs whatever the newest published release is, so act quickly:

1. On GitHub, edit the bad release and set it back to **draft** (or delete it). Installed apps stop being offered it.
   The previous release becomes "latest" again.
2. Apps that already updated keep the bad version: ship a fixed **higher** version (X.Y.Z+1). electron-updater does
   not downgrade.
3. Note the problem and the fix in CHANGELOG.md and the new release notes.

**Security fix:** release as soon as it is ready, and publish the GitHub security advisory together with the release
([SECURITY.md](../SECURITY.md)).
