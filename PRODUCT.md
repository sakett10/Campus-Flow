# CampusFlow Product Specification

**Phase:** 0 (specification). Not production-ready. No application code.

CampusFlow is an academic operating system and second brain for college students. It continuously understands a student’s academic state, organizes resources, models progress, analyzes assessments, estimates useful question patterns **with uncertainty or abstention**, optimizes study decisions, protects focused study time, connects students **contextually**, and uses AI agents to automate **permitted** academic workflows.

It is **not** attendance software, a VTOP/VITIAN replacement, a generic task manager, a generic AI chatbot, a WhatsApp clone, or a generic social network.

**Positioning honesty:** “Operating system” is the long-horizon identity. The product **earns** that name only after the academic loop is real. Until then, CampusFlow is the system that turns a student’s files into exam-ready academic state. Students already have an LMS, Drive, WhatsApp, and a calendar. Those are not the competitors we clone; they are the world we sit on top of **without unofficial scrapers**.

**Institution stance:** “FAT” is an example assessment name (common in some Indian universities). The product is institution-agnostic. **Do not invent university APIs.** Official integrations exist only under contract, later.

## Core loop (central system)

Everything maps to this loop. Features that do not strengthen it wait.

```
EVENT / INPUT
  → UNDERSTAND
  → UPDATE ACADEMIC STATE
  → PREDICT          (or abstain)
  → OPTIMIZE
  → AGENT ACTS       (scoped, permissioned, audited)
  → NOTIFY / FOCUS / CONNECT
  → STUDENT OUTCOME
  → LEARN FROM OUTCOME
```

| Stage                    | Meaning                                           | MVP mapping                                     |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------- |
| EVENT / INPUT            | Upload, capture, session skip, exam date, command | File upload, declared assessment, “Prepare me…” |
| UNDERSTAND               | Extract, classify, cluster, retrieve              | Ingest pipeline                                 |
| UPDATE ACADEMIC STATE    | Graph + coverage + sessions                       | Map, links, plan, mocks                         |
| PREDICT                  | Pattern/importance **from evidence**              | Abstain or descriptive families if papers exist |
| OPTIMIZE                 | Time allocation                                   | Deterministic planner + constraints             |
| AGENT ACTS               | Permissioned tools                                | One Exam Agent package                          |
| NOTIFY / FOCUS / CONNECT | Remind, protect time, later contextual social     | In-app/email reminder + web Focus timer         |
| STUDENT OUTCOME          | Session or exam result                            | Session complete/skip; optional exam log        |
| LEARN                    | Update mastery/plan                               | Coverage/practice bands; replan                 |

**CONNECT in MVP** means connecting the student to the **next academic action**, not launching chat.

## Target users

**Primary:** undergraduates who already pile syllabus PDFs, slides, notes, and previous papers, and who have a dated assessment.

**Secondary (later):** project-heavy students; small groups sharing **an artifact**; privacy-preserving campus aggregates (never identifiable records).

**Not primary:** registrars, attendance officers, faculty gradebooks, students who refuse to upload and expect portal scraping.

### Jobs to be done

1. Turn a pile of files into a course map.
2. Show what is unready, and how thin the evidence is.
3. Spend remaining hours on the highest-leverage topics.
4. Practice from _my_ papers and notes, cited.
5. Repair the plan after I miss a block.

## Core problems

| Problem                          | Why clones fail                     |
| -------------------------------- | ----------------------------------- |
| Files have no academic structure | Drive/WhatsApp dumps                |
| No coverage vs syllabus          | LMS file lists                      |
| Generic plans                    | Calendars without mastery or papers |
| Ungrounded practice              | Chatbots invent the course          |
| No learning after the exam       | Notes apps                          |
| Noisy alerts                     | LMS mail + group chats vs Focus     |
| Social study is unmoored         | Chat apps without academic objects  |

## Product principles

1. Corpus is authority; models are instruments.
2. Abstain over fabricate. No fake probabilities.
3. One loop beats eleven systems.
4. Authorization before data access; never trust client IDs; never frontend authz.
5. Agents are employees with tools, not superusers.
6. Predictions carry evidence, sample size, uncertainty, model version, timestamp — or they do not ship.
7. Academic integrity is a constraint: no cheating, impersonation, unofficial submission, or identity falsification.
8. Social is contextual or absent.
9. Focus promises CampusFlow behavior; OS silencing requires OS APIs and permission.
10. Calm, technical, dense UI. No fake dashboards.

## Killer experience — “Prepare me for Physics FAT.”

The student issues a command (palette, button, or later voice). The system binds to a **course + assessment** the student owns, then uses:

- syllabus and uploaded resources
- previous papers and assignments **if present**
- student performance **if any sessions/evals exist**
- available time (student-declared)
- exam date (student-declared)

It then, **only with evidence**:

1. Builds/refreshes course structure.
2. Identifies weak or uncovered areas (or says data is insufficient).
3. Analyzes question families **if papers exist** (historical, not prophecy).
4. Prioritizes topics under time.
5. Creates a study schedule (draft → confirm).
6. Generates mock papers **from cited sources**.
7. Creates revision cycles in the plan.
8. Creates Focus sessions (web timer in MVP; OS-native later).
9. Schedules notifications (requested ≠ delivered).
10. Replans after missed sessions (confirm if large).
11. Learns from **opt-in** actual exam outcomes.

### Flagship workflow state machine

See [ARCHITECTURE.md](./ARCHITECTURE.md#flagship-workflow). Summary of states:

`intake → bind_assessment → ingest_gate → map_ready | map_needs_review → evidence_scan → predict_or_abstain → optimize_draft → await_confirmation → plan_active → session_cycle → mock_cycle → outcome → learn → closed`

Missing syllabus, zero extractable text, or no time budget → `blocked_insufficient_data` with `missing[]`. That is success of honesty, not a failed product moment.

## Product systems (connected, not microservices)

Systems are **modules inside one application**. They share one Postgres, one job processor, one authz kernel.

### 1. Second Brain

**Inputs:** syllabus, lecture slides, notes, textbooks, assignments, previous papers, question banks, screenshots, recordings, student-created resources.

**Behavior:** detect course, extract structure, organize, deduplicate, classify, link to topics/questions, source-grounded retrieval, maintain academic memory (versioned extracts + user edits).

Pipeline (normative): [ARCHITECTURE.md](./ARCHITECTURE.md#resource-intelligence-pipeline).

### 2. Academic Knowledge Graph

Entities: semester, course, module, chapter, topic, subtopic, concept, prerequisite, resource, question, question family, assessment, student, mastery, study session, exam outcome.

**Explicit (user or document structure):** semester membership, course, module/chapter headings the user confirms, resource ownership, assessment dates, session records, exam outcomes the student logs, friend/share ACLs (later).

**Inferred (model, always provenance’d, user-overridable):** topic/concept links, prerequisites, question families, mastery, pattern/importance, campus aggregates (later).

Documents win vs inferred nodes. See [DATA_MODEL.md](./DATA_MODEL.md).

### 3. Academic Intelligence

Capabilities (not all MVP):

| Capability                     | Rule                                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| Topic mastery                  | Band + evidence; not a fake %                                     |
| Weakness detection             | Uncovered / unpracticed / failed items                            |
| Exam readiness                 | Band vs date + coverage; abstain if thin                          |
| Question-family clustering     | On **this corpus**; descriptive                                   |
| Historical frequency           | Count in ingested papers; `n` shown                               |
| Question priority              | Optimizer input, not “will appear”                                |
| Uncertainty                    | Required on every probabilistic output                            |
| Relative-performance scenarios | LATER; dual consent                                               |
| Mock generation                | Cited chunks only                                                 |
| Marks-aware answers            | Only if marking scheme **document** cited                         |
| Answer evaluation              | Grounded to scheme or rubric; else qualitative + abstain on marks |
| Revision recommendations       | From mastery + date                                               |
| Time-allocation                | Explainable optimizer                                             |

**Do not claim exact future-question prediction.**

Every probabilistic artifact stores: `evidence_refs`, `sample_size`, `uncertainty` (interval or band), `model_version`, `created_at`, `kind` ∈ {`observed`, `inferred`, `generated`}.

### 4. Autopilot / AI agents

Nine **packages** on **one runtime**. Not nine services. Spec: [AGENTS.md](./AGENTS.md). MVP implements **Exam Agent** only; others are specified so they do not later appear as unrestricted bots.

### 5. Notification engine

Durable events. `requested`/`scheduled` ≠ `delivered`. Full funnel in ARCHITECTURE.md.

### 6. Focus Mode

Explicit permission. Goal, countdown, defer CampusFlow notifications, OS break-through only via OS APIs, tracking, summary, mastery write-back, replan hook. Web Focus is real but weaker than native OS integration.

### 7. Social / Flows

Not WhatsApp. Friends, contextual threads, course Flows, ephemeral Drops, study rooms, help requests, resource sharing, teammate matching. Messages reference academic objects. **LATER** for product surfaces.

### 8. Voice / video

1:1 and group audio/video, study rooms, screen share, participant ACL, optional transcription/summary with **consent**, linkage to call-memory as resources. **Vendor media.** Never a custom media server. **LATER.**

### 9. Campus Brain

Privacy-preserving aggregates: resource usefulness, topic difficulty, family intelligence, misconceptions, course patterns, recommendations. **No individual records.** Opt-in, k-anonymous / DP as designed. **LATER.** Do not ship empty or fake campus charts.

## Challenge: proposed web nav vs product model

Suggested target: `HOME · BRAIN · EXAMS · RESOURCES · CHAT · FLOWS · ACTIONS · CALLS`.

**Reject as primary IA.** It splits one course across Brain/Exams/Resources, and puts **three chat-like tops** (Chat, Flows, Calls) in the OS chrome — that is how products become WhatsApp.

**Mature IA (when social exists):**

- **Today** — loop
- **Courses** — Brain + Resources + map live here
- **Prep** — assessments, mocks, exam lab
- **Inbox** — notifications + agent approvals (not “Actions” junk)
- **Campus** (later) — Flows/Drops/people as _one_ place, Calls as a mode inside a room — not a sibling of Home

MVP web nav is smaller: **Today · Courses · Activity · Settings**. Prep lives inside a course. No Chat/Calls.

Mobile is **first-class in the product**, not in the MVP build. See ARCHITECTURE.md IA.

## Challenge: candidate MVP loop

Candidate:

`UPLOAD → ORGANIZE → MAP → QUESTION ANALYSIS → MASTERY → EXAM RADAR → OPTIMIZER → MOCK → EVALUATION → SMART NOTIFICATION → FOCUS → OUTCOME`

**Too wide for a first proof.** Question analysis and “exam radar” are empty without papers. LLM **evaluation with marks** without a marking scheme is fake grading. Native-quality notifications and Focus are a second product.

**Final MVP loop (tighter, still complete):**

`UPLOAD → VALIDATE/STORE → EXTRACT → ORGANIZE/MAP (human review if uncertain) → GROUNDED SEARCH → PREP COMMAND → OPTIMIZE DRAFT PLAN → CONFIRM → CITED MOCK/PRACTICE → WEB FOCUS SESSION → SESSION OUTCOME → REPLAN → HONEST ABSENT PREDICTIONS`

If previous papers exist, **question analysis** is a SHOULD on the same path, labeled historical. Exam Radar is a **view** over coverage + families + date, not a separate system — include a simple coverage/readiness **band** view, not a fake threat dashboard.

## Metrics

Activation: time-to-first-useful-map; J1 completion in 24h.

Loop: prep runs / assessment; sessions started / planned; mocks with citations; replans after skips.

Trust: citation clicks; classification correction rate; abstain impressions (should be visible, not hidden).

Outcome (opt-in): self-reported exam result vs pre-exam band — never a campus leaderboard.

**Not north stars:** messages, call minutes, “AI chats,” decorative widgets.

## Product risks

| Risk                  | Mitigation                                        |
| --------------------- | ------------------------------------------------- |
| No uploads            | Privacy copy, 10-minute value, easy capture later |
| Bad extraction        | Always show original file; human review           |
| Oracle expectation    | Abstention as competence                          |
| Scope to OS chrome    | This MVP contract                                 |
| Integrity scandal     | Non-goals; no silent submit                       |
| Looks like LMS scrape | No unofficial APIs                                |
| Chat gravity          | Defer social                                      |
| Fake Campus Brain     | Do not ship                                       |

## Assumptions

1. Manual courses + uploads at start.
2. English-first.
3. Single-owner corpus in MVP.
4. Student-declared assessments.
5. No official university APIs at launch.
6. Modular monolith + Postgres is enough.
7. Vendor parse/LLM APIs allowed with DPA; **no custom training** in MVP.
8. Web proves the loop; mobile IA is specified, not built.
9. Focus cannot silence third-party apps without OS permission.
10. CampusFlow-Lite is frozen and unused.

## Unresolved product questions

1. First-cohort geography / exam vocabulary in copy.
2. FAT as example vs default string.
3. How hard we prompt exam-score logging.
4. Monetization (must not drive dark patterns).
5. When one-to-one file share is allowed.
6. Self-serve vs ops-assisted review of low-confidence ingest.
