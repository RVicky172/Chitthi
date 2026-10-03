# Release checklist

A release is a version tag: it builds the desktop installers (which installed apps update to) and is what web
deployments run. [BUILD.md → Releasing](BUILD.md#releasing-a-new-version) explains the pipeline; this page is the
checklist to follow each time, and what to do when a release goes wrong.

## Before tagging

- [ ] `main` is green in CI (lint, build, unit, self-test, MCP, browser and Docker checks).
- [ ] [CHANGELOG.md](../CHANGELOG.md): move **Unreleased** under the new version and date; call out security fixes.
- [ ] `npm version X.Y.Z --no-git-tag-version` (package.json and the lock file).
- [ ] Bump `APP_CACHE` in `public/sw.js`, and the image tag in `docker-compose.yml`.
- [ ] `npm run docs:specs` if sizes, layouts or products changed.
- [ ] Docs updated for anything users or operators will notice.
- [ ] Desktop smoke check of the packaged app:
      `npm run desktop:pack`, open `release/win-unpacked/Chitthi.exe` (or the macOS app), make a card, export a print
      pack, then `CHITTHI_MCP_APP=<path to the exe> npm run test:mcp`.

## Tag and publish

```bash
git commit -am "Release X.Y.Z: <one line>"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

The **Desktop release** workflow builds Windows and macOS and publishes one GitHub Release with the installers and the
`latest*.yml` update manifests.

## After publishing

- [ ] Download each installer from the release page and install it on a clean machine (or VM).
- [ ] Signed builds: check the signature (Windows: file Properties → Digital Signatures; macOS:
      `spctl -a -vv /Applications/Chitthi.app` says "Notarized Developer ID").
- [ ] An installed older version finds the update (Help → Check for updates…).
- [ ] Redeploy the web app ([OPERATIONS.md → Upgrade](OPERATIONS.md#upgrade)).

## Signing

Releases should be signed (Windows code-signing certificate or Azure Trusted Signing; Apple Developer ID with
notarization). Until the signing secrets are added, builds are unsigned and SmartScreen and Gatekeeper warn users.
[DESKTOP.md → Code signing](DESKTOP.md#code-signing) lists the secrets.

## When a release goes wrong

**Web:** redeploy the previous tag ([OPERATIONS.md → Roll back](OPERATIONS.md#roll-back)).

**Desktop:** the auto-updater installs whatever the newest published release is, so act quickly:

1. On GitHub, edit the bad release and set it back to **draft** (or delete it). Installed apps stop being offered it.
   The previous release becomes "latest" again.
2. Apps that already updated keep the bad version: ship a fixed **higher** version (X.Y.Z+1). electron-updater does
   not downgrade.
3. Note the problem and the fix in CHANGELOG.md and the new release notes.

**Security fix:** release as soon as it is ready, and publish the GitHub security advisory together with the release
([SECURITY.md](../SECURITY.md)).
