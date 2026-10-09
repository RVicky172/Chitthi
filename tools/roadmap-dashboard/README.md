# roadmap-dashboard

The roadmap and every feature's tasks on your machine, in the Chitthi look (feature
[404](../../specs/features/404-roadmap-dashboard/spec.md)). React 19 + TypeScript + Vite, built from the repo's own
packages; development tooling only (not in the app, the desktop app or the Docker image).

```bash
npm run roadmap                     # builds the app (≈0.2 s), serves http://localhost:5180, opens the browser
npm run roadmap -- --port 5181      # another port (0 picks a free one)
npm run roadmap -- --no-open        # don't open the browser
npm run roadmap -- --dev            # Vite with hot reload, for working on the dashboard itself
```

Ctrl + C stops it. Changes to `specs/` or `memory/` show up in the page within about 2 s.

## What it shows

- **Roadmap** (`#/`): the current phase on the dark stage (`currentPhase` in `roadmap.json`, else the first phase with
  an item in progress): its goal, progress and items as tiles (status, task progress, next task, what each waits on).
  Then totals, search and status chips (kept in the URL), every phase folded with its progress, the check's problems,
  the "Now" panel from `memory/`, and the backlog.
- **Feature** (`#/feature/202/<tab>`): status, dates, branch, needs / needed by, task progress, and four tabs:
  - **Board**: To do, In progress, Blocked, Done. Drag a card to another column, or use its **Move** button (keyboard
    and touch); blocking asks for a reason. Filters: section, the criterion a task proves, text.
  - **Spec**: summary, stories, criteria with the tasks that prove them (link to the board, filtered), questions, the
    other sections, changelog.
  - **Plan**, **Documents**: the generated `plan.md`, `spec.md`, `tasks.md`.

## How it works

```text
server.mjs          CLI: options, builds app/ into .build/ (or --dev: Vite middleware), 127.0.0.1 only
lib/args.mjs        --port, --no-open, --dev, --help (and --root, --static for tests)
lib/server.mjs      routes, CSP, the one write route, and the JSON watcher that regenerates the Markdown
lib/project.mjs     data through tools/specs-index; files cached by mtime + size; version() = hash of file stats
lib/memory.mjs      the Now panel's sections
app/                the React app
  src/api.ts        typed fetch, polling of /api/version every 2 s, moveTaskOnServer
  src/route.ts      hash routes (#/, #/feature/NNN/board|spec|plan|docs) with their query
  src/types.ts      the data and API shapes
  src/lib/          pure logic, unit-tested: roadmap.ts, board.ts, filter.ts, markdown.ts (safe renderer)
  src/components/   TopBar, RoadmapPage, FeaturePage, Board, Documents, bits (badges, bars, ring, Markdown)
  src/styles/       theme.css (the app's tokens and fonts), app.css (components)
test/               server, project and memory tests (Vitest), on the specs-index mini fixture
```

| Route | Answer |
| --- | --- |
| `GET /api/version` | `{ schema, version }` |
| `GET /api/project` | `{ schema, version, roadmap, features: { id: summary }, now, problems }` |
| `GET /api/features/NNN` | `{ schema, id, folder, feature, coverage, docs: { spec, plan, tasks } }` |
| `POST /api/features/NNN/tasks/Txxx` | body `{ status, reason? }` → the feature as saved; only from the dashboard's own origin, JSON only, ≤ 4 KB |

Security: bound to `127.0.0.1`; requests must name localhost as Host (no DNS rebinding); the write needs the server's
own `Origin` (no cross-site writes); CSP `'self'` plus Google Fonts; Markdown is escaped before formatting.

## Upgrading

- The dashboard reads and writes the data only through `tools/specs-index`; a change of data shape is made there first,
  then in `app/src/types.ts`.
- `API_SCHEMA` (`lib/project.mjs` and `app/src/types.ts`) is bumped when an API answer changes shape; an old page then
  asks for a restart instead of rendering wrong data.
- **A new board column:** a task status in the schema and `TASK_STATUSES` (specs-index), then `COLUMNS` in
  `app/src/lib/board.ts` and a colour rule in `app.css`.
- **A new tab:** add it to `TABS` in `app/src/route.ts` and render it in `FeaturePage.tsx`.
- Colours are tokens in `theme.css` (from the app's `src/styles/01-base.css`, rules in `design.md`); never a raw colour
  in `app.css`. Marigold (`--stage-accent`) only on the dark stage.
- After a change: `npm run check`, then check the page with axe at 1280 and 360 px in light and dark.
