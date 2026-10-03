# ADR-005: Object storage

## Status

Accepted

## Decision

Files go to an **S3-compatible** store through an **application storage port** (`ObjectStorage`). Domain modules depend on the interface, not AWS/MinIO/R2 types.

Objects are never stored in Git. Access via **signed URLs** minted by the API after authz.

## Alternatives considered

- Disk in the API container: fails multi-instance and backups.
- Vendor SDK in course/resource modules: couples domain to AWS.
- Database BLOBs: blows up Postgres.

## Reason

MVP storage vendors differ (MinIO locally, S3/R2 in prod). The port keeps that out of academic logic.

## Consequences

- Env: `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`.
- Resource rows store `object_key`, not bytes.
- Worker ingest reads through the same port.

## Reversal conditions

Replace S3 API only if a non-S3 backend is mandated; keep the port. Do not reverse “no files in Git.”
