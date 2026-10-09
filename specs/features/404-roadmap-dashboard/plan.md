<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 404 — Roadmap data (JSON) and a roadmap dashboard on localhost · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-09, reworked spec: the maintainer asked to proceed after
answering Q12–Q14)

## Approach

**§1 One JSON per feature (schema 2).** `feature.json` gains `spec`, `plan` and `tasks` objects (shapes in Data
Structures). Free prose stays Markdown inside string fields; everything a tool needs to read is data. Each document
keeps its layout as an ordered `sections` list: a section is either free Markdown or one of the structured kinds
(`stories`, `criteria`, `questions`, `changelog`; `files`, `risks`, `constitution`), so any heading an author adds
survives and the structured parts render from data. Task `done: boolean` becomes `status` with four values.

**§2 Generators** (`tools/specs-index/lib/render/`): `spec.mjs`, `plan.mjs`, `tasks.mjs` (with the AC coverage table
from `covers`) and the existing `roadmap.mjs`. Pure functions JSON → Markdown, deterministic, a generated note on line
one. `sync.mjs` writes every generated file whose content differs; `check.mjs` compares instead of writing.
`lib/markdown.mjs` (tick editing) and `lib/parse-md.mjs` / `import` go: nothing reads Markdown any more.

**§3 Operations and CLI.** `ops.mjs`: `setTaskStatus(feature, task, status, { reason, commits, result, date, today })`
(start sets `startedOn`, done sets `doneOn`, blocked needs a reason, leaving blocked clears it), `setCriterion`,
`setStatus` (feature + roadmap item + dates), `newFeature` (from `specs/templates/feature-template.json`, now with a
spec skeleton). CLI commands: `new`, `status`, `start`, `block`, `done`, `undone`, `sync`, `check`; each writes the
JSON and regenerates that feature's Markdown.

**§4 No sync step.** (a) The CLI regenerates after each change. (b) `tools/specs-index/hook.mjs`, registered in
`.claude/settings.json`: `PreToolUse` on Write / Edit / MultiEdit refuses a generated `.md` (exit 2, message names the
`feature.json` to edit); `PostToolUse` on a `feature.json` or `roadmap.json` runs the sync and reports what it wrote.
(c) The dashboard server checks the JSON files' stats every second and syncs when one changed (hand edits in an
editor). The check in `npm run check` catches anything else.

**§5 Migration (one-off, scratch).** Reads today's `spec.md` / `plan.md` / `tasks.md` and v1 `feature.json` (dates,
results, commits), writes schema 2. Then a word check: every word of each old document must occur in the new JSON
(the reverse is not required: generated notes and tables add words). 202 T001 → `blocked`, reason from its Status
note.

**§6 Dashboard.** `tools/roadmap-dashboard/`:

- `server.mjs` + `lib/` (Node): `npm run roadmap` runs `vite build` of `app/` into `.build/` (git-ignored), then
  serves `index.html` and `assets/*` from it with a strict CSP (`'self'` plus Google Fonts) and the API. `--dev` runs
  Vite in middleware mode instead (hot reload, CSP relaxed for its inline preamble). The JSON watcher of §4c.
- API: `GET /api/version`, `GET /api/project`, `GET /api/features/:id` (feature.json + coverage + the generated
  documents), `POST /api/features/:id/tasks/:task` `{ status, reason? }`. The POST requires Host localhost, `Origin`
  equal to the server's own origin, `Content-Type: application/json`, a body under 4 KB; it runs `setTaskStatus` and the
  sync, then answers with the new feature.
- `app/` (React 19 + TypeScript, Vite, no router library: hash routes). `src/lib/` holds the pure logic, unit-tested:
  `roadmap.ts` (current phase, progress, waiting on), `board.ts` (columns, moves), `filter.ts`, `markdown.ts` (the
  safe renderer, ported). `src/components/` holds the views: `RoadmapPage` (hero for the current phase, folded phases,
  stats, filter, backlog, Now, problems), `FeaturePage` (header, tabs), `Board` (columns, cards, native drag and drop,
  "Move to" menu, reason dialog), `SpecTab`, `PlanTab`, `DocsTab`. `src/api.ts`: typed fetch, polling hook.
- Theme (`app/src/styles/`): the app's tokens copied (graphite oklch colours, `--r-*`, `--ease`, fonts), marigold
  (`--stage-accent`) for the current phase and focus, the airmail stripe under the top bar; Schibsted Grotesk from
  `src/assets/fonts/`, Geist / Instrument Serif / Geist Mono from Google Fonts as in the app.

**§7 Typecheck and lint.** `tools/roadmap-dashboard/tsconfig.json` added to the root `tsconfig.json` references
(strict, `react-jsx`, bundler resolution, no emit); ESLint's TypeScript + react-hooks block also covers
`tools/**/*.{ts,tsx}`.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `specs/schema/feature.schema.json`, `specs/templates/feature-template.json` | modify | schema 2 (§1) |
| `specs/features/*/feature.json`, `*.md` | migrate, regenerate | §5 |
| `tools/specs-index/lib/render/{spec,plan,tasks,roadmap}.mjs` | new | §2 |
| `tools/specs-index/lib/{sync,check,ops,store}.mjs`, `cli.mjs` | modify | §2, §3 |
| `tools/specs-index/lib/{markdown,parse-md}.mjs`, `roadmap-md.mjs` | delete / move | Markdown is output only |
| `tools/specs-index/hook.mjs`, `.claude/settings.json` | new | §4b |
| `tools/specs-index/test/**` | modify | v2 fixture, generators, ops, CLI, hook |
| `tools/roadmap-dashboard/{server.mjs,lib/*.mjs}` | modify | §6 server |
| `tools/roadmap-dashboard/app/**` | new | §6 React app |
| `tools/roadmap-dashboard/public/**` | delete | replaced by `app/` |
| `tsconfig.json`, `eslint.config.js`, `.gitignore`, `package.json` | modify | §7, `.build/`, scripts |
| `specs/workflow.md`, `.claude/commands/spec-*.md`, `CLAUDE.md`, READMEs, `specs/build.md` | modify | AC-7, AC-16 |

## Data Structures & Interfaces

```jsonc
{
  "schema": 2, "id": "202", "title": "…", "workItem": "P2.2", "status": "in-progress", "owner": "…",
  "dates": { "created": "…", "approved": "…", "started": "…", "done": null }, "git": { "branch": "…" },
  "spec": {
    "phase": "2 — Multi-track timeline", "summary": "Markdown",
    "stories":   { "order": ["US-1"], "byId": { "US-1": { "text": "…" } } },
    "criteria":  { "order": ["AC-1"], "byId": { "AC-1": { "text": "…", "proof": "unit", "group": "Edit tools", "done": false } } },
    "questions": { "order": ["Q1"],   "byId": { "Q1": { "text": "…", "open": false } } },
    "changelog": [{ "date": "2026-10-07", "text": "Created." }],
    "sections": [{ "kind": "summary", "title": "Summary" }, { "kind": "markdown", "title": "Out of Scope", "markdown": "…" }]
  },
  "plan": {
    "header": "**Spec:** `./spec.md` · **Status:** Approved (…)",
    "files": [{ "path": "src/…", "change": "modify", "purpose": "…" }],
    "risks": [{ "text": "…" }],
    "constitution": [{ "principle": "I. Spec before code", "status": "✅", "notes": "…" }],
    "sections": [{ "kind": "markdown", "title": "Approach", "markdown": "…" }, { "kind": "files", "title": "Files" }]
  },
  "tasks": {
    "intro": "Markdown",
    "sections": [{ "title": "Setup", "intro": null }],
    "items": { "order": ["T001"], "byId": { "T001": {
      "text": "…", "section": "Setup", "status": "blocked", "blockedReason": "…", "parallel": false, "manual": true,
      "covers": ["AC-1"], "files": ["…"], "test": "…", "startedOn": null, "doneOn": null, "commits": [], "notes": ["Markdown"] } } }
  }
}
```

```ts
// app/src/lib/board.ts
type Column = 'todo' | 'in-progress' | 'blocked' | 'done';
columns(feature): Record<Column, TaskCard[]>;  canMove(task, to): boolean;
// app/src/lib/roadmap.ts
currentPhase(roadmap, features): PhaseId | null;  phaseProgress(...): { done, total };  waitingOn(item): string[];
```

## Techniques

- Generated Markdown is deterministic (no dates or times added); the check compares with LF line endings.
- Hook input is Claude Code's JSON on stdin; exit 2 blocks a PreToolUse call and shows stderr to the agent.
- Native HTML5 drag and drop (no library); the same move is offered by a menu button on each card for keyboard and
  touch.
- Optimistic move on the board, then the server's answer replaces the feature; a failed move rolls back and says why.

## Test Approach

| AC | Test file | Type |
| --- | --- | --- |
| AC-1 | `specs-index/test/schema.test.mjs` (v2 schema on the mini fixture; broken cases) | unit |
| AC-2 | `specs-index/test/render.test.mjs` (each generator on the fixture, byte for byte; idempotent sync) | unit |
| AC-3 | migration word check (scratch), recorded in tasks.md; `specs:check` on the repo | scripted |
| AC-4 | `specs-index/test/hook.test.mjs` (Pre refuses a generated .md, Post syncs); `roadmap-dashboard/test/server.test.mjs` (hand edit → md regenerated) | unit + integration |
| AC-5 | `specs-index/test/ops.test.mjs`, `cli.test.mjs` | unit + integration |
| AC-6 | `specs-index/test/check.test.mjs` (one case per rule) | unit |
| AC-7 | read the docs and commands | manual |
| AC-8 | `npm run typecheck`, `npm run lint`; `server.test.mjs` (build, serve, busy port) | integration |
| AC-9 | screenshots; CSP header test | manual + integration |
| AC-10 | `app/src/lib/roadmap.test.ts`; browser script | unit + scripted |
| AC-11 | `app/src/lib/board.test.ts`; `server.test.mjs` (POST moves a task, JSON and md agree); browser script (drag, menu) | unit + integration + scripted |
| AC-12 | `server.test.mjs` (version changes after a CLI change) | integration |
| AC-13 | `server.test.mjs` (wrong Origin, wrong type, other paths and methods) | integration |
| AC-14 | browser script with axe at 1280 / 360, light / dark; keyboard moves | scripted |
| AC-15 | `npm run build`; `package.json` diff | build |
| AC-16 | READMEs; fixtures are hand-written | manual |

## Risks & Mitigations

- **Migration loses text:** the word check fails the migration until every word of the old documents is in the new JSON; the regenerated documents are read by hand for 202.
- **Generated Markdown is less pleasant to read raw** (long lines): it is for GitHub and the dashboard; the JSON and the dashboard are where people work.
- **Hook and server write the same files at once:** both write the same bytes, atomically (temp + rename).
- **A drag in the browser fails silently:** the menu does the same move and is tested with the keyboard.
- **Vite build time on start:** measured; under 5 s or the server serves the previous build while building.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | spec reworked 2026-10-09 with Q12–Q14 answered |
| II. Test-gated delivery | ✅ | library and app logic tested first; `npm run check` per task |
| III. Simplicity and small dependencies | ✅ | no new package; React, Vite, TypeScript are already the app's |
| IV. Memory maintained | ✅ | D-026 (JSON first, generated Markdown), progress, MEMORY |
| V. Free and open source | ✅ | dev tooling |
| VI. On the device, no backend | ✅ | local tooling only, not part of the app |
| VII. Permissive licences | ✅ | nothing new; fonts are the app's (OFL) |
| VIII. WYSIWYG, one code path | ✅ | one library for CLI, hook, check, sync and the dashboard's writes |
| IX. Secure desktop shell | ✅ | n/a; local server with Host / Origin checks and CSP |
| X. Budgets and accessibility | ✅ | app bundle untouched; AC-14 |
| XI. Agents use the same code | ✅ | `/spec-*` commands and the hook use the same CLI and library |
