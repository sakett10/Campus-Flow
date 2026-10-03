# ADR-004: Database, PostgreSQL FTS, and deferred vectors

## Status

Accepted (Reconciled)

## Decision

**PostgreSQL** is the authoritative system of record. **Drizzle ORM** and Drizzle Kit migrations provide strict, type-safe schema migrations. Tests apply **the exact production migrations**.

### Search Architecture: FTS FIRST

For the MVP, search is strictly **Full-Text Search (FTS) first** using PostgreSQL's native `tsvector` and `tsquery` capabilities over extracted text chunks.

**Final MVP Search Pipeline**:

```
document
  → extracted text
  → chunks
  → PostgreSQL FTS (tsvector/tsquery)
  → ranking
  → source citation
```

Embeddings and vector indexing (`pgvector`) are **explicitly deferred to a later hybrid-search phase**. The `vector` extension capability is provisioned in PostgreSQL migrations so that future hybrid retrieval can occur within the same single database without external vector databases (Pinecone, Qdrant, Weaviate are strictly rejected).

No embeddings or vector models are required or used for the MVP.

**`campus_id` is omitted** until multi-institution tenancy is an actual requirement.

## Alternatives considered

- **Vector-first / Embeddings-first**: Rejected for MVP. Text chunking + PostgreSQL FTS provides high precision, zero embedding generation latency/cost, and deterministic keyword grounding for course syllabi and lecture slides.
- **Dedicated Vector Database (Pinecone, Weaviate, Qdrant)**: Rejected. Introduces dual-storage synchronization risks and operational overhead.
- **Prisma**: Extra client generation step; Drizzle is SQL-shaped and fits strict ownership schemas.
- **Neo4j**: Rejected for the academic graph.

## Reason

PostgreSQL FTS provides robust search functionality for MVP without requiring external AI embedding API calls or additional infrastructure. Keeping pgvector as a future in-database upgrade path ensures long-term architectural simplicity.

## Consequences

- MVP search operates purely via PostgreSQL full-text search.
- Tests and production environments run identical migrations.
- No embedding pipelines or vector indices are created in the MVP phase.
