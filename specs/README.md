# Specs

The single source of truth for **what** we build and **how** we work, and the engineering docs. Product and user
docs (how the app behaves, setup, operations) are in [docs/](../docs). Read in this order:

| Doc                                          | Purpose                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| [constitution.md](constitution.md)           | Non-negotiable principles and Definition of Done                 |
| [workflow.md](workflow.md)                   | Spec-driven process: Specify → Plan → Tasks → Implement → Verify |
| [roadmap.md](roadmap.md)                     | Phases, features, and their status                               |
| [tech-stack.md](tech-stack.md)               | Approved technologies and rejected alternatives                  |
| [architecture.md](architecture.md)           | High-level design: context, deployment, flows, storage, security, decisions, conventions |
| [lld.md](lld.md)                             | Low-level design: modules, data model, store, rendering, export, IPC |
| [testing-strategy.md](testing-strategy.md)   | Test layers, rules, commands                                     |
| [licensing.md](licensing.md)                 | Licence policy for libraries, models and assets; the register    |
| [build.md](build.md)                         | Scripts, web and Docker build, desktop packaging                 |
| [release.md](release.md)                     | Release checklist, signing, rollback                             |
| [memory-management.md](memory-management.md) | How agents keep durable project memory                           |
| [software-factory.md](software-factory.md)   | The SDD setup as a whole, the software factory plan, the dashboard |
| [vision/](vision/README.md)                  | Multi-release initiatives (editor roadmap and its work items)    |
| [templates/](templates/)                     | Templates for `spec.md`, `plan.md`, `tasks.md`                   |
| [features/](features/)                       | One folder per feature: `NNN-name/{spec,plan,tasks}.md`          |
