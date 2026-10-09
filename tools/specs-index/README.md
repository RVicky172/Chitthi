# specs-index: the feature and roadmap data

Development tooling (feature [404](../../specs/features/404-roadmap-dashboard/spec.md)). It validates, generates and
updates the data of the spec-driven workflow. Node built-ins only, no dependencies; not part of the app or its build.

## The data (JSON first)

| File | Holds | Shape |
| --- | --- | --- |
| `specs/features/NNN-name/feature.json` | everything about a feature: header (status, dates, branch), `spec`, `plan`, `tasks` | `specs/schema/feature.schema.json` (schema 2) |
| `specs/roadmap.json` | phases, items (status, note, work item, folder, `needs`), statuses, backlog, `currentPhase` | `specs/schema/roadmap.schema.json` |
| `spec.md`, `plan.md`, `tasks.md`, `specs/roadmap.md` | **generated** from the JSON (a note on line one says so); never edited | — |

Collections looked up by id are `{ "order": [ids], "byId": { id: entry } }`: lookup is O(1), an insert splices
`order`, and display order stays apart from content. Roadmap items are `items.byId`, ordered by their phase's `items`.
Links are stored once (a task's `covers`, an item's `needs`); `coverage()` and `dependents()` give the reverse.

Each document keeps its layout as a `sections` list: free Markdown sections, or structured kinds rendered from data
(`summary`, `stories`, `criteria`, `questions`, `changelog` in the spec; `files`, `risks`, `constitution` in the plan).
So any heading an author adds survives, and everything a tool reads is data.

Tasks have a lifecycle: `todo` → `in-progress` → `done`, or `blocked` (with a `blockedReason`) while they wait for
someone. Roadmap statuses are data (`statuses.byId`, each with the feature statuses it fits).

## Nobody runs a sync step

- The CLI regenerates the Markdown after every change it makes.
- `hook.mjs` (registered in `.claude/settings.json`) runs around Claude Code's Write / Edit / MultiEdit: it refuses an
  edit to a generated `.md` (naming the JSON to edit), and after an edit to a `feature.json` or `roadmap.json` it
  regenerates the Markdown, or reports the JSON's problems back to the agent.
- `npm run roadmap` regenerates within a second of a hand edit to the JSON, and its board writes through the same code.
- `npm run specs:check` (in `npm run check`) fails when a generated file is out of date or the JSON is invalid.

## Commands

```bash
npm run specs -- help
npm run specs -- new 405 print-borders "Print borders" --phase other   # folder, feature.json (spec skeleton), roadmap 📝, spec.md
npm run specs -- status 405 approved        # also the roadmap item's status and the dates
npm run specs -- start 405 T010
npm run specs -- block 405 T011 --reason "Waits for the maintainer's check"
npm run specs -- done 405 T010 --result "**Result (2026-10-12):** …" --commit 1a2b3c4
npm run specs -- done 405 AC-1             # a criterion proven
npm run specs -- undone 405 T010           # back to do (or a criterion unticked)
npm run specs:sync                         # regenerate every generated file
npm run specs:check
```

Prose (summary, criteria text, plan sections, task text) is written directly in `feature.json`; the editor completes
it from the schema.

## Layout

```text
cli.mjs              the commands (exit 1 + one line on a bad command or id)
hook.mjs             the Claude Code hook (PreToolUse / PostToolUse)
lib/paths.mjs        where things are; every function takes the repo root
lib/json.mjs         read, and atomic write (temp file + rename), two-space JSON with a final newline
lib/schema.mjs       a JSON Schema subset validator (the keywords the schemas use, including oneOf)
lib/store.mjs        loadIndex(root): roadmap + every feature, problems instead of exceptions; entries, coverage,
                     dependents, progress (tasks per status, next task)
lib/render/feature.mjs   renderSpec, renderPlan, renderTasks: JSON → Markdown, deterministic
lib/render/roadmap.mjs   renderRoadmap
lib/sync.mjs         expectedFiles (what every generated file should be) and syncRepo (writes them)
lib/check.mjs        checkRepo(root): every rule; problems are "path: message"
lib/ops.mjs          pure updates: setTaskStatus, setCriterion, setStatus, newFeature
test/                Vitest (picked up by npm run test:unit); fixtures/mini is a small hand-written repo
```

## Upgrading

- **A new field:** add it to the schema in `specs/schema/`, then to the generator that renders it (if it shows in the
  Markdown), to `ops.mjs` if a command sets it, and to the dashboard's `app/src/types.ts` if it shows there. Optional
  fields need no migration.
- **A new section kind:** add it to the schema's `kind` enum and a `case` in `render/feature.mjs`, with a test in
  `test/render.test.mjs`.
- **A breaking shape change:** bump `schema` (the `const` in the schema and the data), migrate the files with a
  one-off script, and bump `API_SCHEMA` in the dashboard if its API changes.
- **A new check:** a rule in `check.mjs` and a case in `test/check.test.mjs`.
- **A schema keyword the validator doesn't know:** add it to `lib/schema.mjs` first (unknown keywords are ignored).
