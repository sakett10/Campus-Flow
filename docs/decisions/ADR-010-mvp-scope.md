# ADR-010: MVP scope

## Status

Accepted

## Decision

The MVP focuses exclusively on the foundational academic loop:
`Input Syllabus / Notes → Grounded Knowledge Extraction → Assessment Preparation → Study Plan Draft → Revision Execution`.

To preserve engineering velocity, security, and architectural integrity, the following boundaries are frozen:

### In Scope for MVP

- **Next.js Web Command Center**: Authentication UI, resource management, course/assessment UI, academic map, grounded search, exam preparation, study sessions, user settings.
- **Modular TypeScript API**: Single deployable with isolated modules for identity, users, courses, assessments, resources, ingestion, search, preparation, sessions, agents, notifications, and audit.
- **Database & Search**: PostgreSQL with Drizzle ORM. Search is strictly **FTS FIRST** (PostgreSQL tsvector/tsquery on chunks). `pgvector` is provisioned but vector embeddings and vector indices are **explicitly deferred to a later hybrid-search phase**. Strict server-side authorization and ownership enforcement on all entities.
- **Worker & Job Architecture**: Transactional Outbox pattern where PostgreSQL is the durable source of truth for job states, and Redis + BullMQ acts strictly as ephemeral execution transport for async processing and reminder scheduling.
- **ML Boundary**: Python interface defining types and contracts for classification, clustering, and mastery estimation without fake metrics.
- **Agent Package**: **Exam Agent ONLY**. Planner and Recovery behaviors are tools executed on Exam Agent, not separate microservices or unbounded background agents.

### Explicitly Out of Scope for MVP

- **No Dashboard / Chat**: No generic AI chat interface, conversational fluff, or premature overview widgets.
- **No Voice / Video / Calling**: LiveKit remains a future integration boundary, not an MVP dependency.
- **No Mobile App**: Native mobile app development begins only after the web MVP validates the core academic loop.
- **No Realtime WebSockets**: Realtime infrastructure is omitted in MVP. Standard HTTP request/response and polling/revalidation suffice.
- **No Social / Campus-Wide Flows**: No friends lists, social feeds, group chats, study rooms, or campus comparisons.
- **No Spline in Core App**: Spline is strictly reserved for marketing landing/brand moments; the core application functions cleanly without 3D libraries.
- **No Multi-Campus Tenancy**: `campus_id` is deferred until institutional tenancy requirements emerge.

## Alternatives considered

- **Full-featured launch with social and calling**: High risk of bloat, unfocused UX, and distributed system fragility before proving academic utility.
- **Multi-agent microservices**: Excessive network overhead and distributed transaction complexity for an early-stage product.

## Reason

A student-native academic operating system must first deliver undeniable value on syllabus grounding, exam planning, and study execution before layering social or communication features.

## Consequences

- Teams avoid premature optimization for mobile, realtime, or video streaming.
- Codebase remains lean, testable, and strictly focused on core academic data integrity.

## Reversal conditions

Expand scope only after the Exam Agent and Core Academic Loop demonstrate reliable, grounded performance in student testing.
