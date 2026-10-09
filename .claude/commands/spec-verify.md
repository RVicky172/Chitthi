---
description: Run the Definition of Done for a feature and update docs and memory
argument-hint: <NNN>
---

Verify feature $ARGUMENTS against the Definition of Done in `specs/constitution.md`.

1. Run every gate command in the Definition of Done (`npm run check`, `npm run test:e2e`, `npm run build`,
   `npm test`, `npm run test:mcp`, `npm run check:licenses`, plus the docs, agent-tool and accessibility gates); report
   results honestly, including flaky or skipped tests.
2. Check every acceptance criterion against its test or recorded measurement; tick only the ones proven, with
   `npm run specs -- done NNN AC-n`. If an AC has no real proof, add the missing test or say so — don't tick it.
3. If all pass: `npm run specs -- status NNN implemented` (spec Status, roadmap ✔️ and the done date follow; note a
   completed phase).
4. Add a `memory/progress.md` entry and update "Current State" in `memory/MEMORY.md` (next feature from the roadmap).
5. Report anything that failed or was skipped.
