---
description: Run the Definition of Done for a feature (or a phase's test pass) and update docs and memory
argument-hint: <NNN>
---

Verify feature $ARGUMENTS against the Definition of Done in `specs/constitution.md` (D-033: heavy checks run once per
phase, in its test-pass feature `x90`).

**A feature (not `x90`):**

1. Run `npm run check` and `npm run build`; report results honestly.
2. Check every acceptance criterion against its unit test; tick only the ones proven, with
   `npm run specs -- done NNN AC-n`. An AC proven by an e2e test, self-test check, timing run or manual check stays
   open: make sure it is listed in the phase's test-pass feature ("Deferred checks collected from the phase").
3. Docs updated (`docs/`, `specs/lld.md`, `CHANGELOG.md`), then `npm run specs -- status NNN implemented`.
4. Add a `memory/progress.md` entry and update "Current State" in `memory/MEMORY.md` (next feature from the roadmap).
5. Report anything that failed or was skipped.

**A phase's test pass (`x90`), once every feature of the phase is Implemented:**

1. Write the deferred e2e tests, self-test checks and timing runs it lists.
2. Run every gate, one at a time: `npm run check`, `npm run test:e2e`, `npm run build`, `npm test`,
   `npm run test:mcp`, `npm run check:licenses`, plus the docs, agent-tool and accessibility gates; then the manual
   checks (they need the maintainer). Report flaky or skipped tests honestly.
3. Tick the remaining ACs in each feature of the phase, then release (`specs/release.md`).
4. Update `memory/progress.md` and `memory/MEMORY.md`.
