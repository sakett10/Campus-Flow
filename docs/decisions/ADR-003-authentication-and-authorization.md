# ADR-003: Authentication and authorization

## Status

Accepted

## Decision

**Clerk** authenticates humans (identity, sessions, sign-in UI).

**PostgreSQL + application code** authorize every data access. The `users` table maps `clerk_user_id` to an internal `users.id`. Ownership columns (`user_id`) on academic tables are authoritative.

Clerk public/private metadata is **not** the source of permissions, roles, or resource ACLs.

Every client-supplied UUID is untrusted: load the row, then check `row.user_id === sessionUser.id`.

## Alternatives considered

- Clerk Organizations/metadata as ACL: convenient, not auditable in our schema, easy to drift.
- Auth.js / Cognito: extra glue vs frozen Clerk decision.
- RLS-only without app checks: easy to miss; we still want explicit authz helpers. RLS may be added later, not instead of app checks.

## Reason

Matches the security model: never trust the client; never frontend-only authz; identity vendor ≠ application policy.

## Consequences

- API verifies Clerk JWTs, upserts `users` on first seen identity, then authorizes against Postgres.
- `AUTH_TEST_BYPASS` exists only for automated tests and is rejected when `NODE_ENV=production`.
- Object-level ACL tables are not required until sharing exists; owner column is the MVP ACL.

## Reversal conditions

Change IdP only with export/delete parity. Do not reverse “Postgres owns authorization” without a new ADR.
