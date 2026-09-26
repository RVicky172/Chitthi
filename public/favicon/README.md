# Chitthi icons

Every icon of the product is the navbar logo: the ring with **CHITTHI ✦ PRINT STUDIO ✦** around it and **चिट्ठी** in
the middle, in cream and saffron on an umber tile.

| File | What it is |
| --- | --- |
| `logo.svg` | The full logo on a rounded tile: source of the app, home-screen and desktop icons |
| `favicon.svg` | Browser-tab version: the ring and **चि** only, because the ring text can't be read at 16–48 px |
| `maskable.svg` | Full-bleed version with the logo inside the safe zone, for icons the OS masks into its own shape |
| `favicon.ico` | 16, 32 and 48 px, for browsers and Windows |
| `favicon-16/32/48.png` | Browser tab sizes |
| `apple-touch-icon.png` | 180 px, iOS home screen |
| `icon-192.png`, `icon-512.png` | Web app manifest icons |
| `maskable-192.png`, `maskable-512.png` | Web app manifest icons with `purpose: maskable` (Android) |

The desktop app icon, `build/icon.png` (1024 px, used by electron-builder for Windows and macOS), comes from
`logo.svg`.

The SVGs carry tiny subsets of the two logo fonts (Hind for the ring text, Rozha One for चिट्ठी) embedded as data, so
they look the same on every device: SVG icons can't load web fonts. Regenerate everything with:

```bash
npm run build:favicons
```

`scripts/build-favicons.mjs` fetches the font subsets from Google Fonts and writes the SVGs; `build-favicons.cjs` then
renders every PNG and the `.ico` in Electron. To change the logo, edit the `logo` template in `build-favicons.mjs` and
keep it in step with `Logo` in `src/components/icons.tsx`.
