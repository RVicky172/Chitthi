# roadmap-dashboard

The roadmap and every feature's tasks on your machine, in the Chitthi look (features
[404](../../specs/features/404-roadmap-dashboard/spec.md) and [405](../../specs/features/405-roadmap-revamp/spec.md):
the roadmap as a road). React 19 + TypeScript + Vite, built from the repo's own packages; development tooling only (not
in the app, the desktop app or the Docker image).

```bash
npm run roadmap                     # builds the app (≈0.2 s), serves http://localhost:5180, opens the browser
npm run roadmap -- --port 5181      # another port (0 picks a free one)
npm run roadmap -- --no-open        # don't open the browser
npm run roadmap -- --dev            # Vite with hot reload, for working on the dashboard itself
npm run test:roadmap                # the browser checks (Playwright, on a temporary copy of specs/ and memory/)
```

Ctrl + C stops it. Changes to `specs/` or `memory/` show up in the page within about 2 s.

## What it shows

- **Roadmap** (`#/`): the roadmap as a **road** (405). Every item is a stop, phase by phase, alternating left and right
  of a winding road drawn behind them: solid up to "you are here", dashed ahead, and drawn further as you scroll. The
  page opens at the current stop (`#/?at=203` opens at another). That stop is the **hero** on the dark stage: the
  feature's ring, its task sections, what's running, the next task, what's blocked (each linking to its card on the
  board) and how long it has been moving, then every roadblock elsewhere. Each stop shows its status, task progress
  (counting up the first time it comes into view), what it waits on, its age and a **Quiet** mark after 7 days without
  a finished task; phases end with their release (`release` in `roadmap.json`). A **rail** beside the road (a bottom
  bar below 1100 px) marks every phase and stop and the stretch in view, with **Back to now**. Above the road: totals,
  the check's problems, **Pace** (tasks finished per day over 14 days, and today) and search and status chips (kept in
  the URL; they dim the stops that don't match). Below it: the "Now" panel from `memory/` and the backlog. A task that
  changes while the page is open (CLI, board, editor) lights up its stop for 2 s and is announced once to screen
  readers.
- **Feature** (`#/feature/202/<tab>`): status, dates, branch, needs / needed by, task progress and its sections, and
  four tabs:
  - **Board**: To do, In progress, Blocked, Done. Drag a card to another column, or use its **Move** button (keyboard
    and touch); blocking asks for a reason; a card that changes column glides there. Filters: section, the criterion
    a task proves, text (`?q=T030` shows one task).
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
  src/lib/          pure logic, unit-tested: roadmap.ts, board.ts, filter.ts, markdown.ts (safe renderer);
                    road.ts (stops, states, regions, hero, roadblocks), pace.ts (per day, age, quiet),
                    changes.ts (what changed between two loads), geometry.ts (the road's path);
                    motion.ts (reduced motion, reveal, count-up, scroll drawing, live changes)
  src/components/   TopBar, RoadmapPage, Road, Hero, RouteRail, Activity, FeaturePage, Board, Documents,
                    bits (badges, bars, ring, segments, Markdown)
  src/styles/       theme.css (the app's tokens and fonts), app.css (components)
test/               server, project and memory tests (Vitest), on the specs-index mini fixture
e2e/road.e2e.ts     the browser checks (npm run test:roadmap, playwright.roadmap.config.ts)
```

### The road

The stops are an ordinary list in reading order (phases are `h2` regions, stops are list items with their facts as
text); the road is an `aria-hidden` SVG drawn through each stop's anchor (`.stop-anchor`, near the inner edge of its
column), measured by one `ResizeObserver` once a frame. `geometry.ts` gives the path (cubic Béziers with Catmull-Rom
handles) and splits it at the current stop, so the travelled and ahead parts meet exactly. One passive scroll listener
draws the travelled part up to the reading line (60 % down the view).

### Motion

Motion shows progress and change only: the road drawing on scroll, counts on first view, the marker's slow pulse, a
2 s airmail-stripe sweep on a change, a board card gliding to its column. Only `transform`, `opacity` and
`stroke-dashoffset` move. Every hook has a still twin: with `prefers-reduced-motion: reduce` the road is complete,
counts are final, nothing pulses or glides and a change gets a static outline (the browser checks assert
`document.getAnimations()` is empty). A visible count that animates is `aria-hidden`; the real number is screen-reader
text.

| Route | Answer |
| --- | --- |
| `GET /api/version` | `{ schema, version }` |
| `GET /api/project` | `{ schema: 3, version, roadmap, features: { id: summary }, now, problems }`; a summary's `progress` has counts, `next`, `upNext`, `sections`, `running`, `blocked`, `finished`, `statuses` |
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
- **Motion:** add it through `lib/motion.ts` (or a CSS transition on `--dur`) with its reduced-motion result; animate
  compositor properties only.
- After a change: `npm run check`, then `npm run test:roadmap` (axe at 1280 and 360 px in light and dark, keyboard,
  reduced motion, live changes, scroll smoothness).
