# CampusFlow Privacy

Policy intent, not legal advice. Production personal data requires a real privacy policy, regional lawful basis, and vendor DPAs. **This spec is not production-ready.**

## Data categories

| Category                 | Meaning                     | Examples                                                               | Default              |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------- | -------------------- |
| **private**              | Only the student            | Corpus, map, plans, mastery, exam outcomes, agent audit, notifications | MVP everything       |
| **shared with friends**  | Explicit ACL or share grant | A single resource, later                                               | Off                  |
| **shared within Flow**   | Membership                  | Contextual messages, later                                             | Off                  |
| **anonymized aggregate** | No re-identification        | Campus Brain stats                                                     | Off; min `n`         |
| **public**               | Marketing only              | Docs site                                                              | Never academic files |

There is **no** “public academic profile” in the product.

## Consent

| Type                           | Default                  | Revocation                       |
| ------------------------------ | ------------------------ | -------------------------------- |
| Account ToS / privacy version  | Required to use          | Stop using; delete               |
| Resource share                 | Off                      | Revoke ACL immediately           |
| Friend compare                 | Off; both parties        | Revoke; hide views               |
| Model **training** on corpus   | **Off**                  | Revoke; future training only     |
| Call recording / transcription | Off; **per participant** | Stop; delete artifacts if stored |
| Campus Brain contribution      | Off                      | Exit cohort; future jobs omit    |

Consent rows: [DATA_MODEL.md](./DATA_MODEL.md) `consents`. UI must show what is granted.

## Model-training / learning policy

- MVP: **do not train** on user PDFs. Vendor inference under DPA only.
- Product “LEARN FROM OUTCOME” means **the student’s own** mastery/plan updates, not global model weights.
- Any later training: documented opt-in, purpose limitation, no training on other users’ private files.

## Call recording / transcription

- Separate consents. Host cannot silently consent for others.
- Stored transcript/recording = **private corpus** of consenting users; ingest pipeline + retention apply.
- If anyone declines recording, do not record (vendor policy must match).

## Retention

| Data                 | Recommendation (freeze before launch) |
| -------------------- | ------------------------------------- |
| Active corpus        | Until user deletes                    |
| Soft-deleted objects | Purge ≤ 30 days                       |
| Ingest temp          | TTL hours                             |
| Audit                | 12 months then delete/anonymize       |
| Notifications        | 90 days after terminal state          |
| Messages/Drops       | Drop TTL; Flow: user delete           |
| Aggregates           | Rolling windows                       |
| Backups              | Follow same deletion (documented lag) |

## Deletion

Account delete: auth identity, files, chunks, embeddings if any, plans, notifications, tokens, consents, audits after hold, vendor deletion requests. Shared copies: revoke; recipients lose access; their local caches expire. Legal hold: documented exception.

## Export

Machine-readable JSON (courses, topics, plans, citations, consents) + original files. No other users’ private data.

## Focus / contacts

Do not upload address books. OS break-through stays on-device.

## Campus Brain

k-anonymity and/or DP; minimum cohort; opt-in; no dean identifiable dashboard as a student feature; no “top students.”

## Logging

`resource_id` not bytes; no tokens; minimize emails in error SaaS.

## Security overlap

See [ARCHITECTURE.md](./ARCHITECTURE.md). Server authz, signed URLs, fail-closed agents, untrusted client IDs.

## Incident

Breach process including embeddings **before** launch, not after.

## MVP checklist

- [ ] Subprocessors + region
- [ ] Retention numbers accepted
- [ ] Export/delete planned
- [ ] Training default off
- [ ] No unofficial university SSO
- [ ] Categories mapped in product copy
