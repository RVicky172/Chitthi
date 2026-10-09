# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Chitthi Studio: a React 19 + TypeScript (strict) + Vite app with **no backend**, shipped two ways from one `dist/`:
a static web app (nginx in Docker) and an Electron desktop app (Windows, macOS). It makes print products (postcards,
calendars, frame prints, fridge magnets → print-ready PDFs/PNGs/ZIPs with bleed) and media (Instagram photos, Reels /
Shorts, YouTube videos → JPEG/PNG/MP4). Everything runs on the user's device; the only network calls are fonts,
optional Pexels search, optional AI with the user's own key, and desktop update checks.

## Start Every Session

1. Read `memory/MEMORY.md` (current state + active feature).
2. Read the newest entry in `memory/progress.md`.
3. Open the active feature in `specs/features/NNN-*/` and find the next unchecked task.
4. If the task touches principles, re-read `specs/constitution.md`.

## Spec-Driven Workflow (mandatory)

**Specify → Plan → Tasks → Implement → Verify.** Full rules: `specs/workflow.md`.

- Never write feature code without an **Approved** `spec.md`. If none exists, draft one and stop for review.
- Never plan from a spec that still has `[NEEDS CLARIFICATION]` markers — ask the user.
- Work one task at a time: `npm run specs -- start NNN Txxx`, then `done` (with a dated `--result` note) once its
  tests pass, or `block` it with a reason when it needs the user.
- A feature is one `specs/features/NNN-*/feature.json` (spec, plan, tasks); `specs/roadmap.json` is the roadmap.
  `spec.md`, `plan.md`, `tasks.md` and `roadmap.md` are generated from them: never edit those (a hook refuses it and
  regenerates them after JSON edits). See `specs/workflow.md` "One JSON per feature".
- If code must diverge from the spec, update the spec (and its Changelog) first.
- Bug fixes and behaviour-neutral refactors may skip the spec; log them in `memory/progress.md`.
- Numbering: `000–099` baseline, `2xx` / `3xx` = editor work items P2.x / P3.x (P2.1 → `201`), `401+` other.
- Slash commands: `/spec-new`, `/spec-plan`, `/spec-tasks`, `/spec-implement`, `/spec-verify`.

## Key Docs

`specs/` holds how we build (engineering); `docs/` holds the product and user docs.

| Doc                                                 | Read when                                                      |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `specs/constitution.md`                             | Before any design decision; contains the Definition of Done    |
| `specs/architecture.md`, `specs/lld.md`             | Before touching shared code or adding a module                 |
| `specs/tech-stack.md`, `specs/licensing.md`         | Before adding or upgrading any library, model, binary or asset |
| `specs/testing-strategy.md`                         | Before writing tests                                           |
| `specs/roadmap.json`, `specs/vision/`               | Choosing what's next (or `npm run roadmap`); editor work items |
| `specs/build.md`, `specs/release.md`                | Scripts, packaging, releasing                                  |
| `docs/MEDIA-STUDIO.md`, `docs/MCP.md`, `docs/AI.md` | Behaviour of the media studio, agent tools, AI                 |
| `docs/SPECIFICATIONS.md`, `docs/DESKTOP.md`         | Print specifications as data; the desktop app and signing      |

## Commands

```bash
npm run dev            # Vite dev server, http://localhost:5173
npm run desktop:dev    # Vite + Electron with hot reload
npm run check          # fast gate: typecheck + lint + specs:check + unit tests — run before ticking any task
npm run lint           # ESLint (0 errors required; the 5 react-hooks warnings are known)
npm run check:licenses # every shipped package has an allowed licence (specs/licensing.md)
npm run typecheck      # TypeScript 7 (typescript-native) tsc -b; 6.0 stays as `typescript` only for typescript-eslint
npm run build          # typecheck + vite build + scripts/check-bundle.mjs (fails if the entry chunk > 350 KB or contains AI code)
npm run test:unit      # Vitest: src/**/*.test.ts (pure logic, no DOM/canvas)
npm test               # Electron self-test (src/dev/selftest.ts, ~6,100 checks: every product × size × layout, print packs, agent tools)
npm run test:mcp       # MCP server end to end (scripts/mcp-smoke.mjs); CHITTHI_MCP_APP=<exe> tests a packaged app
npm run fetch:libraw   # once: LibRaw's RAW developer into electron/resources/libraw (test:mcp develops a DNG with it)
npm run test:e2e       # Playwright on the production build (e2e/*.e2e.ts), desktop + phone projects, axe checks
npm run roadmap        # roadmap dashboard on http://localhost:5180 (tools/roadmap-dashboard; --port, --no-open)
npm run specs -- help  # feature / roadmap JSON: new, status, start, block, done, undone, check, sync (tools/specs-index)
```

Single tests:

```bash
npx vitest run src/engine/layers.test.ts -t "video timeline"
npx playwright test e2e/editors.e2e.ts -g "YouTube" --project=desktop
```

First Playwright run needs `npx playwright install chromium`. `npm test` and `test:mcp` open Electron (hidden windows);
if `ELECTRON_RUN_AS_NODE` is set in the shell (VS Code sets it), unset it before launching Electron by hand.

Packaging: `npm run desktop:pack` (unpacked app in `release/`), `desktop:dist` (installers). Releases are tag-driven
(`git tag vX.Y.Z` → `.github/workflows/desktop-release.yml`); the checklist is `specs/release.md` (bump `package.json`,
`APP_CACHE` in `public/sw.js`, the image tag in `docker-compose.yml`, the plugin version, and CHANGELOG).

## Architecture

### Layers of the code

- `src/data/` — specifications as data: products, sizes, layouts, themes, fonts, Instagram formats, layer shapes.
  New sizes/layouts/products/themes are added here (see `docs/SPECIFICATIONS.md`), not in rendering code.
- `src/engine/` — framework-free (no React): print geometry in millimetres (`design.ts`, `layout.ts`), drawing
  (`render.ts`), export (`export.ts`), photo processing, and the media engines (`instagram.ts`, `layers.ts`,
  `video.ts`, `videoExport.ts`). Preview and export share one code path, so the files match the preview.
- `src/state/` — small `useSyncExternalStore` stores, each with its own undo/redo: `store.ts` + `actions.ts` (print
  studio; design autosaves to localStorage), `instagram.ts` (photo batch), `video.ts` (video project). Undo snapshots
  are immutable arrays; changes with the same key within ~800 ms coalesce into one step (drags, sliders).
- `src/components/` — UI. `App.tsx` routes by URL hash to screens (`home`, `studio`, `sizes`, `paper`, `instagram`, `docs`);
  screens and dialogs are `lazy()`-loaded.

### Print studio

One `Design` object in `state/store.ts`; every control writes to it and the stage re-renders through the engine.
`mergeDesign()` (engine/design.ts) validates anything loaded (saves, backups, `.chitthi` files): keep it the single
gate for external design data.

### Photo & video studio (`#/instagram`, `#/instagram/video`, `#/instagram/youtube`)

- `components/InstagramStudio.tsx` routes the three modes to `components/studio/PhotoWorkspace.tsx` and
  `VideoWorkspace.tsx`, which share `studio/Shell.tsx` (top bar, tool rail, panel, stage, inspector, dock) and
  `studio/Timeline.tsx`. Styles: `styles/36-media-studio.css` (root class `.mst`) and `styles/35-instagram.css`
  (panel controls). Don't use the class `.ig` for new UI: it belongs to the Instagram-handle field on the card back.
- Layers (text, shapes, stickers, drawings) live in `engine/layers.ts`: positions are shares of the frame, sizes are
  shares of the frame **width**, so they render identically at any preview size, in exported photos and in every video
  frame. Editing on a canvas is `components/ig/useLayerPointer.ts`; panels are `components/ig/LayerPanel.tsx`.
- Video: `engine/video.ts` holds formats, per-platform limits (`limitsFor(kind, isDesktop)`), timeline maths and
  `renderFrame()` (used by both the live preview and export). `engine/videoExport.ts` (Mediabunny, MPL-2.0, loaded only
  via dynamic `import()` on export) encodes H.264 + AAC with the index at the front: in memory for Reels (so they can be
  shared), streamed to a file for YouTube (`lib/fileSink.ts`: desktop IPC or the File System Access API, with
  Mediabunny's `reserve` fast start). Sound is decoded and mixed in 10-second windows, interleaved with the frames.

### Web vs desktop

`src/platform/desktop.ts` exposes `window.chitthiDesktop` (from `electron/preload.cjs`) when running in Electron;
code branches on `desktop`/`isDesktop` (storage in `lib/db.ts`, saving in `lib/download.ts`, AI transport, limits).

Electron main (`electron/`): serves `dist/` from the `app://chitthi` origin with its own CSP; the renderer is
sandboxed with context isolation. **Every IPC handler must be registered with `handle`/`on` from `electron/ipc.cjs`**
(rejects messages not from the app's own page) and must validate its arguments. New files under `electron/` must be
added to `files:` in `electron-builder.yml`. Fuses are set in `electron-builder.yml`; `RunAsNode` must stay on because
the MCP stdio relay (`electron/mcp-stdio.cjs`) runs with `ELECTRON_RUN_AS_NODE`. The desktop data folder is pinned to
`%APPDATA%\Chitthi` (main.cjs `app.setPath('userData', …)`) even though the product name is "Chitthi Studio".

### AI and keys

Provider adapters (`src/ai/providers/`) load on demand; the build fails if AI code reaches the entry bundle. Keys are
attached only for hosts listed in `electron/ai-hosts.json` (`src/ai/transport.ts` on web, `electron/ai.cjs` on
desktop, where keys are `safeStorage`-encrypted and never readable by the page). Keyed requests never follow redirects.

### MCP

The desktop app is an MCP server (`electron/mcp.cjs`); the tools themselves run in the page (`src/agent/tools.ts`) and
are reached over IPC, so agents use the same code as the UI. `plugins/chitthi/` is the Claude Code plugin.

## Things that bite

- **CSP is enforced in tests.** `vite preview` serves the production CSP parsed from `nginx/security-headers.conf`,
  and e2e tests fail on any console error. New external hosts, `blob:` workers/media, etc. must be added there and in
  the Electron CSP in `electron/main.cjs`.
- Styles are numbered files imported in cascade order from `src/styles.css`; add new ones at the end.
- `src/lib/errors.ts` collects errors for user-copied reports; caught-and-toasted failures should call
  `logError('handled', e)`.
- **Free and open source.** No subscription, paid tier, licence key or locked feature, ever; "advanced" features are
  free in web and desktop. Desktop-only is for technical reasons only. Don't write "pro" for a feature set.
- **Licences.** Before adding or upgrading any library, model, native binary, font or asset, follow
  `specs/licensing.md`: permissive licences only unless an exception is approved there; never GPL/AGPL/non-commercial.
  Bundled devDependencies go in `BUNDLED` in `scripts/check-licenses.mjs`; list new components in
  `THIRD_PARTY_NOTICES.md`; `npm run check:licenses` must pass.
- Unsigned desktop builds: release signing secrets are described in `docs/DESKTOP.md`.

## Memory Management (project memory in `memory/`)

Full rules: `specs/memory-management.md`.

- **Decision made** (library, pattern, spec change) → append to `memory/decisions.md` right away.
- **Gotcha found** (lost >10 min, non-obvious fix) → add to `memory/learnings.md`.
- **End of session** → add an entry to `memory/progress.md` and update "Current State" in `memory/MEMORY.md`.
- Shared project knowledge goes in `memory/` (committed). Personal agent memory is only for one user's
  preferences — never the only place a project fact lives.
- Use absolute dates. Fix or delete memory that becomes wrong.

## Git

- Commit only when asked. Messages reference the feature (and work item): `feat(201): track model (P2.1)`.
- Run `npm run check` before committing.
