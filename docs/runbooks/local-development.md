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
