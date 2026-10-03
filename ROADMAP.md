# CampusFlow Roadmap

Stop-ship against building eleven systems at once. **Not production-ready.**

## Implementation boundaries

### MUST HAVE FOR MVP

Prove one complete loop (final definition below):

- Auth + server authz tests (IDOR)
- Course, optional semester, assessment
- Upload, validate, store, hash dedupe
- Extract, classify, map (module/topic), human review when uncertain
- FTS grounded search with citations
- Flagship Prepare-me → draft plan → confirm
- Cited mock/practice
- Web Focus session (goal + timer) + session outcome
- Replan after skip (confirm if large)
- Exam Agent package + approvals + audit
- Notification rows with real states; in-app (email optional); requested ≠ delivered
- Coverage / readiness **band** view (honest empty/abstain)
- Empty/loading/error/abstain UI
- Observability ids
- CI: typecheck, lint, test, build
- Same migrations in test and “prod” schema

### SHOULD HAVE (cut rather than slip MUST)

- Question extract + family cluster + historical frequency with `n`
- Mastery snapshots as bands
- Exam Lab UI with `observed|inferred|generated` labels
- OCR screenshots
- Quiet hours
- Marks on mocks from **observed** paper weightage
- Answer feedback **without** fake numeric grades if no scheme

### LATER

- Native mobile (IA is specified)
- Push tokens, full notification diagnostics UX
- OS Focus/DND
- Remaining agent packages as implementations
- Friend share ACL, Flows, Drops, rooms, matching
- Vendor calls, transcription consent
- Recordings ingest
- Marks-aware generation/eval against uploaded schemes
- Relative performance
- Campus Brain
- Embeddings in Postgres if FTS fails
- ICS export
- Spline in-product viz
- Official contracted LMS

### DO NOT BUILD

- Attendance, VTOP/VITIAN clone, unofficial scrapers
- WhatsApp inbox, stories, engagement metrics as goals
- Generic ungrounded chatbot
- Custom media server, Kafka, Kubernetes-for-its-own-sake, dedicated vector SaaS, custom LLM training
- Unrestricted agents
- Fake analytics / fake probabilities / empty Campus Brain charts
- Silent institutional submission, impersonation, cheating workflows
- CampusFlow-Lite coupling

## Final MVP definition

**Name:** One student, one course, one assessment, web command center.

**Loop:**

```
RESOURCE UPLOAD
  → ORGANIZE (extract / classify / dedupe / review)
  → COURSE/TOPIC MAP
  → GROUNDED SEARCH
  → PREPARE-ME (Exam Agent)
  → STUDY OPTIMIZER (draft plan)
  → CITED MOCK
  → WEB FOCUS SESSION
  → OUTCOME (session; optional exam log)
  → LEARN (update state, replan)
```

**Challenged candidate:** full Question Analysis + Exam Radar + LLM Evaluation + Smart Push + native Focus is **not** MVP. Radar = coverage band view. Question analysis = SHOULD if papers exist. Evaluation marks = LATER without a scheme. Notifications = durable in-app, not a push platform. Focus = web timer.

**Clients:** web only. **Agents:** Exam Agent only. **Social/A/V/Campus Brain:** none.

## Phase 2

Mobile capture + Today + Focus + Inbox; push funnel; OS Focus permission; share-one-resource ACL; Exam Lab SHOULD items; evaluation with uploaded mark scheme; richer recovery.

## Phase 3

Flows/Drops/rooms; more agent packages; matching with consent; vendor calls; Campus Brain **design + opt-in aggregates** only when `n` and privacy hold.

## Long-term

Contracted institution integrations; exportable academic autobiography; low-risk autopilot; still no unofficial ERP.

## Implementation sequence (after freeze)

1. Freeze ARCHITECTURE decision list
2. Repo skeleton, lint, test, CI, secrets pattern — **no feature UI**
3. Identity + authz helpers + IDOR tests
4. Migrations: users, courses, resources, jobs
5. Upload + storage + hash
6. Ingest extract/classify/link + review states
7. FTS search API + UI
8. Map UI
9. Plans, sessions, web Focus
10. Cited mocks
11. Exam Agent + approvals + audit
12. Notification persistence + in-app
13. Observability
14. Hardening (limits, injection isolation)

Do not skip 3. Do not start React/Vite/Expo **in this Phase 0**.

## MVP done

[AGENTS.md](./AGENTS.md) Definition of Done plus: stranger completes first corpus + Prepare-me on their PDFs; mocks refuse without citations; student-visible audit; honest abstain.
