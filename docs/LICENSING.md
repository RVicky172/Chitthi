# Licensing policy for libraries, models and assets

Chitthi is released under the [MIT License](../LICENSE) and is shipped two ways: a web app whose bundle is sent to every
visitor's browser, and desktop installers. Both count as distributing every library inside them, so each one's licence
terms apply to us. This page is the rule for anything third-party that Chitthi uses: code, native binaries, AI models,
fonts, photos, LUTs and sounds. Follow it every time a dependency is added, upgraded or swapped.

What users may do with their own designs is a separate matter, covered in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md#your-designs-and-photos). This page is engineering policy, not
legal advice; when a case isn't clearly covered below, stop and get it reviewed before merging.

## The rules in short

1. **Permissive licences only, by default** (MIT, BSD, ISC, Apache 2.0 and the others in the allowed list). They keep
   Chitthi free to use, change and sell under MIT.
2. **Weak copyleft (MPL, LGPL, EPL, CDDL) only with an approved exception**, used in the way its licence allows:
   unmodified, or as a separate, replaceable file or program. Each exception is recorded below and in
   `scripts/check-licenses.mjs`.
3. **Never strong copyleft or restricted licences** (GPL, AGPL, SSPL, BUSL, non-commercial, research-only, or no
   licence at all) in anything that ships. Not even in a "desktop only" or "optional" part.
4. **Every shipped component is listed in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)** with its licence, in
   the same change that adds it.
5. **AI models, fonts, photos, LUTs and sounds have licences too.** A model's weights can be under a different licence
   from the code that runs it; check both.
6. **No paid or per-user licences.** Chitthi is free for everyone, with no subscription or paid tier, so it can't
   depend on anything that needs a purchased licence, a licence key, per-seat or per-install fees, online activation,
   or a commercial SDK agreement. If the only option costs money, the feature waits or we write it ourselves.
7. **`npm run check:licenses` must pass.** It runs in CI and before every release build.

## Licence categories

| Category | Licences (SPDX) | May ship? | Conditions |
| --- | --- | --- | --- |
| Permissive | `MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `0BSD`, `Zlib`, `BlueOak-1.0.0`, `Unlicense`, `CC0-1.0`, `Python-2.0` | Yes | Keep the copyright and licence notices (see obligations) |
| Weak copyleft | `MPL-2.0`, `LGPL-2.1`, `LGPL-3.0`, `EPL-2.0`, `CDDL-1.0` | Only as an approved exception | Use unmodified, or keep it a separate, replaceable file or process; publish any changes we make to its files; link its source |
| Strong copyleft | `GPL-2.0`, `GPL-3.0`, `AGPL-3.0` | No | Would require releasing Chitthi under the GPL |
| Restricted or source-available | `SSPL-1.0`, `BUSL-1.1`, "Commons Clause", `CC-BY-NC-*`, `CC-BY-ND-*`, research-only or non-commercial model licences, custom "free for personal use" | No | Conflict with MIT and with users selling their prints |
| Unknown | No `license` field, `UNLICENSED`, "see file" without a standard licence | No | Treat as all rights reserved until the author grants a licence |

A dual licence (`A OR B`) is fine when either side is allowed; we take the allowed side. A combined licence (`A AND
B`) needs both sides allowed.

## What each licence asks of us

| Licence | What we must do when shipping it |
| --- | --- |
| MIT, ISC, BSD, Zlib, BlueOak | Keep its copyright line and licence text. For npm packages the text stays in `node_modules` in the desktop app; list the component in THIRD_PARTY_NOTICES.md |
| Apache 2.0 | As above, plus ship its `NOTICE` file if it has one, and mark any files we changed. It also grants a patent licence, which ends if we sue over patents in it |
| MPL 2.0 | File-level copyleft: if we change any of its files, those files (not Chitthi) must be published under MPL 2.0. Ship it unmodified where we can, and link its source in THIRD_PARTY_NOTICES.md (as for Mediabunny) |
| LGPL 2.1 / 3.0 | Users must be able to replace the library with their own build. So: ship it as a separate shared library (`.dll`, `.dylib`, `.so`) or a separate program, never compiled into our code or the web bundle; ship its licence; offer its exact source (a link to the matching release, or the source in the release assets); state any changes. Not in the web bundle, because a browser user can't swap a bundled or WASM copy |
| CDDL 1.0, EPL 2.0 | Like MPL: file-level copyleft. Same handling as MPL |
| SIL Open Font License 1.1 | Fonts can be bundled and used in any printed work. Keep the licence with the font files; don't sell the fonts on their own; a changed font must not use its Reserved Font Name |
| Pexels License | Photos can be used and changed, including commercially; no attribution required, but Chitthi credits photographers. Don't sell unaltered copies, don't imply endorsement. Chitthi also never uses photos of people (project rule) |

## Native binaries and codecs (desktop)

The roadmap ([planning/EDITOR-ROADMAP.md](planning/EDITOR-ROADMAP.md)) adds native code to the desktop app. Native
code brings licence and patent questions that npm packages usually don't.

- **Prefer a separate helper program** started by the main process (`child_process.spawn`) over a Node native addon.
  It keeps LGPL code clearly separate and replaceable, keeps crashes out of the app, and needs no rebuild per Electron
  version. Its files go in `extraResources` in `electron-builder.yml`, with their licence texts next to them.
- **FFmpeg**: build or download an LGPL configuration only (`--disable-gpl --disable-nonfree`; never `--enable-gpl`
  or `--enable-nonfree`). That rules out GPL components such as libx264, libx265 and some filters, and non-free
  ones such as libfdk-aac. Encode H.264 / HEVC with the operating system's hardware encoders (Media Foundation,
  VideoToolbox) or WebCodecs. Record the exact `configure` line and source archive for each shipped build.
- **Codec patents** are separate from copyright licences. H.264, HEVC and AAC are patent-licensed formats: keep using
  the encoders that come with the browser or the operating system (which are licensed there) rather than shipping our
  own encoders. ProRes is Apple's format; FFmpeg's ProRes encoder is not Apple-licensed, so get a review before
  shipping ProRes export.
- **LibRaw**: dual-licensed LGPL 2.1 or CDDL 1.0. Ship it unmodified as a shared library or inside the helper
  program built against the shared library, with its licence and a source link.

## AI models

The code that runs a model and the model's weights are licensed separately. Check the model card, not just the
library's `LICENSE`.

- Allowed: weights under Apache 2.0, MIT, BSD or a similarly permissive licence that permits commercial use and
  redistribution.
- Not allowed: non-commercial (`CC-BY-NC`), research-only, "open RAIL" or custom licences with use restrictions we
  can't pass on, and models whose terms forbid redistribution if we bundle them.
- Downloaded on demand (not bundled): still check the licence, because the user runs it through our app.
- Record each model in the register below: name, version or file hash, licence, source URL, where it is loaded from.
- Training-data questions (for example, a model trained on images of people) are noted in the register so a reviewer
  can decide; they don't change the licence check.

## Other assets

- **Fonts**: OFL 1.1 or Apache 2.0 only (as the bundled Google Fonts are). Fonts users upload stay theirs.
- **Photos**: Pexels License, credited, no people. Nothing scraped from search engines.
- **LUTs, presets, stickers, sounds, music**: made by us (MIT, as part of Chitthi) or under CC0 / a licence that allows
  redistribution and commercial use. Keep a source note next to each bundled file.
- **Icons**: Lucide (ISC). Other icon sets must be permissive.

## Checklist for adding or upgrading a dependency

Do this in the same pull request that adds the dependency.

1. **Find the licence**: the `license` field in its `package.json`, its `LICENSE` file, and for models the model card.
   Check that the field matches the file. For native binaries, check the build configuration too.
2. **Look up the category** in the table above. Permissive: continue. Weak copyleft: write the exception (step 5)
   before merging. Anything else: don't add it; look for an alternative or write the code ourselves (Chitthi already
   hand-writes its ZIP writer and colour maths for this reason).
3. **Check what it pulls in**: `npm run check:licenses` walks the whole dependency tree, not just the top package.
4. **Update the lists**:
   - Bundled into the web app (a devDependency that the app imports): add it to `BUNDLED` in
     `scripts/check-licenses.mjs`. Run-time dependency of the desktop app: it belongs in `dependencies`.
   - Add a row to [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
   - Add it to [TECHNOLOGIES.md](TECHNOLOGIES.md) if it is part of the stack.
   - Models, binaries and assets: add a row to the register below.
5. **For an exception**: add it to `EXCEPTIONS` in `scripts/check-licenses.mjs` and to the exceptions table below,
   saying how each condition of its licence is met.
6. **Upgrades**: the check fails when an approved package changes its licence. Read the new licence before updating
   the exception.
7. **Release**: the release checklist ([RELEASE.md](RELEASE.md)) relies on CI having run this check; any native
   binaries or models added since the last release need their licence files in the installer.

## Approved exceptions

| Package | Licence | How its terms are met | Approved |
| --- | --- | --- | --- |
| [Mediabunny](https://mediabunny.dev) | MPL-2.0 | Used unmodified from npm, loaded with `import()` on export; source linked in THIRD_PARTY_NOTICES.md. If we ever patch it, the patched files are published under MPL 2.0 | Already in use (2.7.0) |

## Register

What ships today (checked by `npm run check:licenses`, October 2026, version 2.8.0): about 150 packages, all
permissive, plus the Mediabunny exception. Dual-licensed packages (DOMPurify: MPL-2.0 or Apache-2.0) are used under
their permissive option.

Candidates named in the editor roadmap, to be checked again when each is actually added:

| Component | Phase | Licence (as published) | Status | Notes |
| --- | --- | --- | --- | --- |
| LibRaw | 1 (desktop) | LGPL 2.1 or CDDL 1.0 | Needs an exception | Separate shared library / helper program, unmodified, source linked |
| MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) | 1 | Apache 2.0 (code) | Allowed (code) | Each segmentation model's card checked separately before use |
| AVIF encoder (libavif / libaom, WASM) | 1 | BSD-2-Clause | Allowed | Only if canvas can't export AVIF |
| Speech-to-text model for captions | 3 | Depends on model | To check | Weights and runtime licensed separately |
| FFmpeg (native, LGPL build) | 3 (desktop) | LGPL 2.1+ | Needs an exception | No `--enable-gpl`, no `--enable-nonfree`; ProRes needs review |
| AI inpainting model for object removal | 3 (desktop) | Depends on model | To check | Must allow commercial use and redistribution |
