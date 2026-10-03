# Runbook: Local Development Setup

## Prerequisites

- Node.js >= 20.11.0 (tested with Node v24)
- pnpm >= 10.15.1
- Python >= 3.11 (for `services/ml`)
- Docker & Docker Compose (for PostgreSQL + pgvector and Redis)

## 1. Environment Configuration

Copy the example environment template:

```bash
cp .env.example .env
```

Ensure required environment variables are set. Real production secrets must **never** be committed to Git.

## 2. Infrastructure Services

Launch PostgreSQL (with `pgvector`) and Redis:

```bash
docker compose up -d
```

Verify Postgres is accessible on port 5432 and Redis on port 6379.

> **Infrastructure Architecture Note**:
>
> - **PostgreSQL** is the authoritative, durable system of record for all application data, the transactional outbox (`job_outbox`), and audit trails.
> - **Redis** is strictly transient execution transport and scheduler for BullMQ workers. If Redis is restarted or flushed, no domain work is lost—the outbox dispatcher re-enqueues pending and unacknowledged jobs from PostgreSQL.

## 3. Database Migrations

Generate migration files from Drizzle schema:

```bash
pnpm db:generate
```

Apply migrations to local database:

```bash
pnpm db:migrate
```

Check migration status:

```bash
pnpm db:migrate:check
```

## 4. Running Services

Run API service (port 3001):

```bash
pnpm --filter @campusflow/api dev
```

Run Worker service (background jobs):

```bash
pnpm --filter @campusflow/worker dev
```

Run Web app (Next.js, port 3000):

```bash
pnpm --filter @campusflow/web dev
```

Run Python ML service (FastAPI, port 8000):

```bash
cd services/ml
python -m venv .venv
# On Windows: .venv\Scripts\activate
# On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## 5. Verification Commands

Run code formatting check:

```bash
pnpm run format:check
```

Run ESLint:

```bash
pnpm run lint
```

Run TypeScript compilation check across all packages:

```bash
pnpm run typecheck
```

Run automated test suite:

```bash
pnpm run test
```

Build production bundles:

```bash
pnpm run build
```

## 6. Troubleshooting: Hydration Mismatches & Browser Extensions

If you observe React hydration mismatch errors in local development such as:

```text
A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.
- input: fdprocessedid="..."
- button: fdprocessedid="..."
```

### Cause

Attributes like `fdprocessedid` are injected directly into form elements (`<input>`, `<button>`, etc.) by browser extensions—notably **McAfee WebAdvisor**, password managers, or autofill utilities—before React completes hydration. Because the server-rendered HTML emitted by Next.js does not contain these third-party attributes, React reports a DOM mismatch against its virtual DOM.

### Verification & Remedy

1. Open the page in an **Incognito / Private Window** with all extensions disabled.
2. If using Chrome/Edge, verify that extension access in Incognito is toggled off (`chrome://extensions`).
3. Refresh the page: the mismatch warning will not appear, confirming that CampusFlow's markup is deterministic and correct.
4. Per CampusFlow engineering standards, we do **not** add `suppressHydrationWarning` or distort clean markup to mask external extension DOM mutations.
