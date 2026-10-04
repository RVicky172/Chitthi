# Contributing to Chitthi

Thanks for helping. This guide covers setup, the checks a change must pass, and how to send it.

## Set up

You need Node.js 20.19 or newer (22 is what CI uses) and Git.

```bash
git clone https://github.com/RVicky172/Chitthi.git
cd Chitthi
npm ci
npm run dev              # web app on http://localhost:5173
npm run desktop:dev      # the desktop app with hot reload
```

Photo search in development needs a free Pexels key: copy `.env.example` to `.env.local` and fill in
`PEXELS_API_KEY`. `.env.local` is gitignored; never commit a key.

[README → Development](README.md#development) maps the source folders, and [docs/LLD.md](docs/LLD.md) explains the
modules.

## Before you open a pull request

Run what CI runs:

```bash
npm run lint         # ESLint: no errors allowed
npm run check:licenses  # every shipped dependency has an allowed licence
npm run build        # type check, production build, bundle-size guard
npm run test:unit    # Vitest unit tests
npm test             # self-test in Electron: every product, size and layout, print packs, agent tools
npm run test:mcp     # MCP server end to end
npm run test:e2e     # Playwright browser tests with an accessibility check
```

[docs/TESTING.md](docs/TESTING.md) says what each suite covers and how to add checks.

Adding or upgrading a library, model, font or other asset? Follow [docs/LICENSING.md](docs/LICENSING.md) first: only
permissive licences ship without review, and the new component goes in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Code style

- TypeScript in strict mode. Keep the engine (`src/engine/`) free of React and DOM UI code.
- Match the surrounding code: its naming, comment density and formatting (Prettier settings are in `.prettierrc.json`;
  `npm run format` applies them).
- New specifications (sizes, layouts, products, themes) are data in `src/data/`; see
  [docs/SPECIFICATIONS.md](docs/SPECIFICATIONS.md).
- AI code must load on demand with `import()`; the build fails if it reaches the start-up bundle.
- Desktop: anything native goes through `electron/preload.cjs` and an IPC handler registered with `handle` / `on`
  from `electron/ipc.cjs`. Validate every argument in the main process.
- Never put an API key in the bundle, a test or a fixture.

## Pull requests

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
2. Keep a pull request to one change, and say why in the description.
3. Update the docs the change affects, and add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
4. Include a screenshot for visible UI changes, at desktop and phone width. If the change shows in a README screenshot,
   remake it with `npm run screenshots` (add a scene in `scripts/screenshots.mjs` for a new screen), and update the
   in-app documentation in `src/data/docs.ts` when a feature changes.
5. CI must be green before review.

## Reporting bugs and ideas

Use the [issue templates](https://github.com/RVicky172/Chitthi/issues/new/choose). For a security problem, follow
[SECURITY.md](SECURITY.md) instead of opening an issue.

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
