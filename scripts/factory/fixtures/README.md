# Factory test fixtures

Frozen copies of the repository's own files, taken on 2026-10-08 (402 T010), for the tests in `scripts/factory/`:
`roadmap.md` (`specs/roadmap.md`), `features/NNN-*/` (each feature's `spec.md` and `tasks.md`; `plan.md` is a stub,
since the readers only check that it exists) and `memory/`. Don't update them when the real files change: the tests'
expected values are worked out from these copies. If a template's format changes, add a new fixture for the new
format next to the old one, so both keep parsing.
