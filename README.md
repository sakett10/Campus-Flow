# CampusFlow

CampusFlow is a new **academic operating system / second brain** for college students. This repository is a **clean rebuild**, not CampusFlow-Lite.

**Phase 0 status:** specification only. Not production-ready. No application scaffold, no Expo/Vite app, no full dependency tree.

Legacy CampusFlow-Lite is frozen (`legacy/campusflow-v1`, tag `v1.0-legacy-freeze`). **Do not modify it. Do not depend on it.**

## Product in one paragraph

CampusFlow continuously turns academic inputs into academic state, predicts **only with evidence**, optimizes study time, lets permissioned agents act, notifies without lying about delivery, protects Focus, and later connects students around academic objects — then learns from outcomes.

**Flagship:** “Prepare me for Physics FAT.”

**Not:** attendance, VTOP/VITIAN, generic tasks, generic chatbot, WhatsApp, generic social.

## Final MVP

Web-only loop: **upload → organize/map → grounded search → Prepare-me → plan → cited mock → web Focus session → outcome → replan**, with abstention instead of fake confidence. One **Exam Agent**. See [ROADMAP.md](./ROADMAP.md).

## Documents

| File                                 | Contents                                                   |
| ------------------------------------ | ---------------------------------------------------------- |
| [PRODUCT.md](./PRODUCT.md)           | Definition, loop, systems, killer UX, metrics, risks       |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Monolith, pipelines, IA, design system, security, diagrams |
| [DATA_MODEL.md](./DATA_MODEL.md)     | Relational graph, tables, isolation                        |
| [AGENTS.md](./AGENTS.md)             | Engineering laws + runtime + all nine agents               |
| [PRIVACY.md](./PRIVACY.md)           | Categories, consent, retention, Campus Brain               |
| [ROADMAP.md](./ROADMAP.md)           | MUST / SHOULD / LATER / DO NOT BUILD                       |

## Engineering laws

Obey [AGENTS.md](./AGENTS.md): TypeScript-first, authz before access, no unofficial APIs, no fake ML, no secrets in git, no CampusFlow-Lite edits.

## Before coding

Freeze the list in [ARCHITECTURE.md](./ARCHITECTURE.md#decisions-that-must-be-frozen-before-coding). Then start the implementation sequence in ROADMAP — still not in Phase 0.
