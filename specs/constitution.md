# Chitthi Studio — Constitution

> The non-negotiable principles of this project. Every spec, plan, task, and line of code must comply.
> If a change needs to break a principle, amend this document first (see "Governance & Amendments").

**Version:** 1.0.0 · **Ratified:** 2026-10-06

---

## Mission

Chitthi Studio lets anyone make print-ready photo products (postcards, calendars, frame prints, fridge magnets) and
social media (Instagram photos, Reels, Shorts, YouTube videos) with professional-grade editing tools, entirely on their
own device, free and open source, in the browser and as a desktop app. Success: files that match the preview exactly,
print correctly at the shop, and never require an account, a payment or a server.

## Core Principles

### I. Spec Before Code

No feature code is written without an approved spec in `specs/features/NNN-name/`.
The flow is always **Specify → Plan → Tasks → Implement → Verify** (see `workflow.md`).
Bug fixes and refactors that do not change behavior may skip the spec but must still be logged in `memory/progress.md`.
Editor work items from [vision/editor-implementation.md](vision/editor-implementation.md) (P2.x, P3.x) become
feature specs (`2xx`, `3xx`) when they start; the vision docs are input, not approval.

### II. Test-Gated Delivery

- No task is "done" until its tests pass: `npm run check` (and that area's e2e tests,
  `npx playwright test e2e/<file>.e2e.ts`, if the change affects UI or integration; never the full suite, D-007;
  `npm test` if it renders, exports or adds an agent tool).
- Pure logic is unit-tested, test-first: write the failing test, then the code.
- Tests wait on real signals, never fixed sleeps; anything time-dependent takes time as an input so tests are
  deterministic.

### III. Simplicity and Small Dependencies

- Prefer the platform and small in-house helpers over new libraries (Chitthi hand-writes its ZIP writer, colour
  maths, AI adapters).
- Adding a runtime dependency requires a justification in `specs/tech-stack.md` (size, license, why not
  hand-rolled) and a `memory/decisions.md` entry.
- YAGNI: build what the current roadmap phase needs, nothing more.

### IV. Memory Is Maintained

- Agents and humans keep `memory/` current: decisions, progress, and learnings (see `memory-management.md`).
- A session that changes direction or discovers a pitfall records it before ending.

### V. Free and Open Source, Always

- Chitthi is MIT-licensed. No subscription, paid tier, licence key, account, usage limit or locked feature, ever.
- "Advanced" features ship free on web and desktop. Desktop-only is allowed for technical reasons only (memory,
  codecs, native libraries), and the editor says so as it does for today's limits.
- Never write "pro" for a feature set.

### VI. On the User's Device, No Backend

- All design, rendering, editing and export run on the device. There is no Chitthi server, account system or
  analytics.
- The only network calls are: Google Fonts (web), optional Pexels search, optional AI with the user's own key,
  model downloads the user agrees to, and desktop update checks. A new network destination needs a spec, a decision
  entry and CSP entries in both `nginx/security-headers.conf` and `electron/main.cjs`.
- AI keys are attached only for hosts in `electron/ai-hosts.json`; on desktop they are `safeStorage`-encrypted and never
  readable by the page; keyed requests never follow redirects.

### VII. Permissive Licences Only

- Every library, model, native binary, font and asset passes [licensing.md](licensing.md) **before** work on it
  starts. Never GPL/AGPL/non-commercial; exceptions (e.g. LibRaw) are approved there.
- New components are listed in `THIRD_PARTY_NOTICES.md`; bundled devDependencies in `BUNDLED` in
  `scripts/check-licenses.mjs`. `npm run check:licenses` must pass.

### VIII. What You See Is What You Get

- Preview and export share one code path (print: `engine/render.ts`; photo: the GPU graph with its Canvas 2D
  fallback; video: `renderFrame()`). An export-only renderer is never added.
- GPU output must match Canvas 2D within the tolerance the self-test checks, on every backend.
- `src/engine/` stays free of React; specifications (products, sizes, layouts, themes) are data in `src/data/`.
- Edits are non-destructive parameters; all loaded data goes through a validator (`mergeDesign()` and friends).

### IX. Secure Desktop Shell

- The renderer stays sandboxed with context isolation. Every IPC handler is registered with `handle`/`on` from
  `electron/ipc.cjs` and validates its arguments.
- Fuses stay as set in `electron-builder.yml` (`RunAsNode` on, for the MCP stdio relay).

### X. Budgets and Accessibility

- The entry chunk stays ≤ 350 KB and contains no AI code (`scripts/check-bundle.mjs`); heavy code loads with
  `import()`.
- WCAG 2.2 AA in light and dark themes: axe passes, everything works from the keyboard and with a screen reader,
  from 1920 px down to 360 px wide with no sideways scrolling, and `prefers-reduced-motion` is respected.
- Memory budgets in [docs/PERFORMANCE.md](../docs/PERFORMANCE.md) hold (e.g. 16 MP per photo).

### XI. Agents Use the Same Code

- Every user-facing feature is reachable through a tool in `src/agent/tools.ts` (the MCP server calls the page),
  covered by the self-test and documented in [docs/MCP.md](../docs/MCP.md).

## Quality Gates (Definition of Done)

A feature is **Done** when all are true:

1. Spec status is `Implemented` and every acceptance criterion is checked — each one proven by a test or a
   recorded measurement.
2. `npm run check` passes (the fast gate: typecheck, lint, unit tests).
3. `npm run test:e2e` passes (Playwright + axe, desktop and phone; fails on any console error, incl. CSP).
4. `npm run build` succeeds (includes the 350 KB / no-AI-code entry budget).
5. `npm test` (Electron self-test) and `npm run test:mcp` pass.
6. `npm run check:licenses` passes.
7. Anything that renders has a self-test check; the feature has an agent tool covered by the self-test.
8. Docs updated: `docs/` for behaviour users see (e.g. `docs/MEDIA-STUDIO.md`, `docs/MCP.md`), `specs/lld.md` /
   `specs/architecture.md` for structure, `specs/licensing.md` and `THIRD_PARTY_NOTICES.md` for any new dependency,
   and `CHANGELOG.md`.
9. Caught-and-shown errors call `logError('handled', e)`.
10. `memory/progress.md`, `memory/MEMORY.md` and `specs/roadmap.md` are updated.

## Governance & Amendments

- This constitution supersedes all other docs. Conflicts are resolved in its favor.
- Amend by editing this file in a dedicated change: bump the version (MAJOR = principle removed/redefined,
  MINOR = principle added, PATCH = wording), and record the reason in `memory/decisions.md`.
