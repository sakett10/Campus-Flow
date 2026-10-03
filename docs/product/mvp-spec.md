# CampusFlow MVP Specification

## 1. Product Identity

CampusFlow is an academic operating system and second brain for college students.
It is an entirely new product and clean rebuild.

The MVP revolves around the core academic loop:

```
SYLLABUS / NOTES INPUT
  → UNDERSTAND & GROUND
  → UPDATE ACADEMIC STATE
  → EXAM PREPARATION PLAN
  → TARGETED REVISION / PRACTICE
  → STUDENT OUTCOME
```

## 2. In-Scope MVP Capabilities

1. **Course & Assessment Management**:
   - Courses (code, title, term, syllabus status).
   - Assessments (course association, title, type: CAT/FAT/Quiz/Assignment, date, weightage, topics covered).
2. **Resource Corpus Ingestion**:
   - Uploading syllabus, lecture notes, question banks.
   - S3-compatible storage with signed URLs.
   - Background extraction, chunking, and embedding with pgvector.
3. **Exam Agent (Prepare-Me)**:
   - Grounded knowledge extraction and syllabus-topic mapping.
   - Study plan drafting and activation.
   - Question family retrieval and cited mock exam generation.
   - Plan repair/recovery when study sessions are missed.
4. **Study Sessions & Focus Tracking**:
   - Starting/completing study blocks against planned topics.
5. **Notification Events Infrastructure**:
   - Durable scheduling of session reminders and quiet-hours policy.

## 3. Explicitly Deferred / Non-MVP Capabilities

- **No Chat / Conversational Bot**: No general-purpose conversational LLM UI.
- **No Realtime Call / Voice / Video**: No LiveKit or WebRTC.
- **No Native Mobile App**: Responsive web first.
- **No Social / Matching / Campus Feeds**: No friend graphs or public sharing.
- **No Spline in Core App**: No 3D scene rendering in web dashboard.
- **No Institutional Tenancy**: Single tenant model without `campus_id`.
