# ADR-006: Background jobs & transactional outbox

## Status

Accepted (Reconciled)

## Decision

Adopt a **Transactional Outbox Architecture**:

- **PostgreSQL** is the single **durable source of truth** for domain state, job state (`job_outbox` table), and audit history.
- **Redis + BullMQ** serves strictly as an **ephemeral execution transport** and high-throughput worker scheduler in `services/worker`.

### Conceptual Architecture & Execution Flow

```
DB TRANSACTION
  → domain change
  → durable job/outbox record (`job_outbox` in PostgreSQL)
  → dispatcher (polls outbox / publishes event)
  → BullMQ (Redis execution transport)
  → worker (leases job with fencing token)
  → PostgreSQL result (status: completed/failed, audit log)
```

Redis is **never** treated as the authoritative record of application work. If Redis crashes, loses data, or flushes, no domain asynchronous work is lost; the PostgreSQL outbox dispatcher detects undispatched or stale pending records and re-enqueues them.

### Job Reliability Guarantees

1. **State Ownership**:
   - `job_outbox` in PostgreSQL owns job lifecycle states: `pending → dispatched → running → completed` (or `failed`).
   - Domain operations and initial job creation commit atomically inside the same PostgreSQL transaction. Work can never disappear if an HTTP request or server crashes mid-flight.

2. **Idempotency & Duplicate Execution Handling**:
   - Every job has a required `(queue_name, idempotency_key)` unique constraint in PostgreSQL.
   - Workers verify state in PostgreSQL upon execution; duplicate deliveries (e.g. at-least-once transport retries or network blips) are safely deduplicated without executing side effects twice.

3. **Lease Fencing & Crash Recovery**:
   - When a worker picks up a job from BullMQ, it claims a lease in PostgreSQL with `locked_at` and `locked_by`.
   - If a worker crashes or drops connection, the background sweep `recoverStaleRunningJobs()` reclaims jobs where the lease has expired, resetting status to `pending` for re-dispatch.

4. **Retry Behavior & Backoff**:
   - Transient failures are recorded in `job_outbox` with exponential backoff (`scheduled_at = now + 2^attempts seconds`).
   - Once `attempts >= max_attempts`, the job transitions to `failed` (dead-letter state) and triggers an audit alert. Poison pills never loop infinitely.

5. **Outbox Dispatcher**:
   - A lightweight in-process or background dispatcher polls pending outbox entries (`scheduled_at <= now`) and pushes them into BullMQ queues for execution.

## Alternatives considered

- **Pure Postgres Queue (pg-boss/Graphile Worker)**: Avoids Redis entirely, but adds polling overhead and lacks BullMQ's native delayed scheduling primitives, rate-limiting, and rich metrics.
- **Pure Redis/BullMQ (without Postgres outbox)**: Suffers from dual-write anomalies where a domain transaction commits but Redis write fails (or vice versa), leading to lost work or phantom executions.
- **Temporal / Cadence**: Over-engineered for the current phase.

## Reason

Pairing the PostgreSQL Transactional Outbox with BullMQ execution transport provides the best of both worlds: ACID durability and atomicity with domain data in PostgreSQL, combined with Redis's ultra-low latency queue transport and delayed job management.

## Consequences

- Domain tables and `job_outbox` reside in PostgreSQL and require zero extra storage systems for durability.
- Redis is strictly classified as transient infrastructure (can be safely restarted/evicted without data loss).
- Workers must check and update PostgreSQL status as their authoritative execution boundary.
