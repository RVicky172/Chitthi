# Chitthi desktop app

The desktop app (Windows and macOS) is the same React app as the website, wrapped in Electron. It works fully
offline: fonts and sample photos ship inside the app.

## How it differs from the web app

| | Web | Desktop |
|---|---|---|
| Gallery, photo store, last card | IndexedDB in the browser | JSON files in the app's data folder (below) |
| Downloads | Browser download | Native **Save as…** dialog |
| Fonts | Google Fonts | Bundled offline (`npm run fetch:fonts`) |
| Offline | Service worker | Always offline |
| Extras | — | Native menus, `.chitthi` design files, auto-updates |
| Pexels photo search | Your key in Settings, or the dev/preview server's key | Your key in **File → Settings** (`Ctrl+,`), kept in the app only |

The two keep **separate** libraries. To move designs between them, use **Back up gallery** in one and
**Restore a backup** in the other, or share a single design as a `.chitthi` file (**File → Save design as file…**).

Desktop data folder (**File → Open library folder**):

- Windows: `%APPDATA%\Chitthi\library`
- macOS: `~/Library/Application Support/Chitthi/library`

It contains `designs/<id>.json`, `photos/<id>.json` (the photo store) and `work.json` (the card in progress).

## Develop

```sh
npm install
npm run fetch:fonts     # once: downloads the offline fonts into electron/resources/fonts (gitignored)
npm run desktop:dev     # Vite dev server + Electron with hot reload
npm run desktop:start   # production build in Electron, as users get it
```

Code layout:

- `electron/main.cjs`: window, `app://chitthi` origin with a strict CSP, file storage, save/open dialogs, menus,
  `.chitthi` file association and updates.
- `electron/preload.cjs`: the `window.chitthiDesktop` bridge; the only way the page reaches the system.
- `src/platform/`: the typed bridge (`desktop.ts`) and menu commands (`menu.ts`). `isDesktop` is false in a
  browser, so one build serves both.

The page runs sandboxed, with context isolation and without Node. Storage IDs are validated in the main process,
and links open in the system browser (https and mailto only).

## Build installers

```sh
npm run desktop:pack    # unpacked app in release/ for a quick check (unsigned)
npm run desktop:dist    # installers in release/: NSIS .exe (Windows) or .dmg + .zip (macOS)
```

macOS builds must run on a Mac and Windows builds on Windows (or use the CI workflow).

## Code signing

Unsigned builds work, but Windows SmartScreen and macOS Gatekeeper warn users, and auto-updates need signed
builds. electron-builder signs automatically when these environment variables are set:

**Windows** (an OV or EV code-signing certificate as a `.pfx`):

- `CSC_LINK`: the path to the `.pfx`, or its base64 contents
- `CSC_KEY_PASSWORD`: its password

EV certificates on hardware tokens and cloud HSMs can't be exported as `.pfx` files. For those, use
[Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/) by adding `azureSignOptions` under
`win:` in `electron-builder.yml` and setting `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`.

**macOS** (Apple Developer Program membership):

- `CSC_LINK` / `CSC_KEY_PASSWORD`: a **Developer ID Application** certificate exported from Keychain as `.p12`
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (from appleid.apple.com) and `APPLE_TEAM_ID`: turn on notarization

The hardened runtime and its entitlements are set up in `electron-builder.yml` and `build/entitlements.mac.plist`.

## Release

`.github/workflows/desktop-release.yml` builds both platforms when a `v*` tag is pushed and publishes the
installers to a GitHub Release. The installed apps check that release for updates.

1. Add the repository secrets: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`,
   `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. The `*_CSC_LINK` values are base64:
   `base64 -i cert.p12 | pbcopy`.
2. Bump `version` in `package.json`, commit, then `git tag v2.1.0 && git push --tags`.

The app icon is `build/icon.png` (1024×1024), rendered with the favicons from `public/favicon/favicon.svg` by `npm run build:favicons`.
