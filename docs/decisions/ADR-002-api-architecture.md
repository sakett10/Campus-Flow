# ADR-002: API architecture

## Status

Accepted

## Decision

CampusFlow uses a **separate TypeScript API service** (`services/api`) as a **modular monolith**. Modules (identity, users, courses, assessments, resources, ingestion, search, preparation, sessions, agents, notifications, audit) are folders in one deployable, not separate services.

A **worker** (`services/worker`) is the only extra Node process, for BullMQ jobs. **ML** (`services/ml`) is a Python interface service. No other deployables in this phase. No Kafka, Kubernetes requirement, or microservice mesh.

## Alternatives considered

- Next.js Route Handlers as the only API: mixes UI deploy with job/authz runtime; harder worker isolation.
- Microservices per module: contradicts spec; operational cost with zero users.
- NestJS modules: heavier than needed; Hono + explicit folders is enough.

## Reason

The specification requires clear module boundaries that can be extracted later, and forbids microservices-for-their-own-sake.

## Consequences

- All HTTP business traffic goes through `services/api`.
- Web may call the API with Clerk session tokens; it must not embed ownership checks only in React.
- Worker and API share `packages/*` domain code.

## Reversal conditions

Split a module into its own service only after a measured bottleneck (queue depth, blast radius, scaling) is documented.
