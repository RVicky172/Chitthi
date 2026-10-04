# Planning

Future work for Chitthi: what we intend to build and how. Docs about how the app works today stay in the parent
[docs/](..) folder; when a plan ships, its outcome is written up there and the plan here is marked done.

| Document | What it covers | Status |
| --- | --- | --- |
| [EDITOR-ROADMAP.md](EDITOR-ROADMAP.md) | Advanced photo and video editing: GPU pipeline, masks, multi-track timeline, colour grading, RAW, web vs desktop | In progress |
| [EDITOR-IMPLEMENTATION.md](EDITOR-IMPLEMENTATION.md) | The roadmap as work items per phase: files, tests, gates, dependencies; the **Status** of every item | In progress: Phase 0 done, Phase 1 12 of 12 (gate to confirm) |

## Writing a plan

- Plan for everyone: Chitthi is free and open source (MIT), with no subscription, paid tier or locked features. A
  plan may make something desktop-only for a technical reason, never to charge for it.
- Start with a status line: state, date written, and the app version it was written against.
- Separate the what and why (a roadmap) from the how (an implementation plan) when the work spans releases.
- Any new library, model, binary or asset must pass [LICENSING.md](../LICENSING.md) before work on it starts; name it
  in the plan with its licence.
