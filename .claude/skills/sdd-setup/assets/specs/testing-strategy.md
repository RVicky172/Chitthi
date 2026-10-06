# Testing Strategy

## Test Layers

<!-- FILL: one row per layer (unit, integration, E2E, visual, perf…) with the real tool, path glob and command. -->

| Layer | Tool | Location | What it covers | Command |
| ----- | ---- | -------- | -------------- | ------- |

## Rules

1. **Test-first for pure logic.** Write the failing test, then the code.
2. **Time and randomness are inputs.** Logic takes time/seeds as parameters so tests are deterministic.
3. **No flaky waits.** Wait on real signals (events, DOM attributes, readiness endpoints), not fixed sleeps. A
   flaky test is a bug: find the race, don't add retries.
4. **Prove important tests can fail** by briefly breaking the code they cover.

<!-- FILL: project-specific rules (e.g. "E2E fails on any console error", coverage targets, fixtures), or delete. -->

## Commands

```bash
{{COMMANDS_BLOCK}}
```
