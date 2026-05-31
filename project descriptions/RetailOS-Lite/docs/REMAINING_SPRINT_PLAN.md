# Remaining Sprint Plan

This plan lists what is not complete yet and turns it into implementation-ready sprint work.

Goal: make the AI and worker backend production-ready enough to hand off cleanly to the Next.js teammate, then finish the user-facing workflow quickly.

## Current Completion Snapshot

| Area | Current state | Next action |
| --- | --- | --- |
| YOLO inference | Working locally and through Modal GPU | Add regression tests and error fixtures |
| LLM POSM analysis | Working through OpenAI vision | Add timeout/error tests and prompt fixture tests |
| Compliance scoring | Working deterministic rules | Add unit tests for scoring bands |
| BullMQ worker | Working with JSON repository | Swap to Prisma repository |
| Fraud detection | Core implemented | EXIF, exact duplicate, perceptual duplicate, GPS, and timestamp exist; blur intentionally skipped |
| Visit report text | Working | Add embedding worker and pgvector |
| RBAC | Designed only | Add simple `REP`, `SUPERVISOR`, `ADMIN` enforcement |
| Dashboard data | Backend summary shape exists | Build Next.js pages and API routes |
| Offline sync | Implemented | Add manual browser recording if demo time allows |
| Observability | Designed, not wired | Add OTEL traces and LGTM stack |
| Deployment | Not complete | Deploy frontend, API, worker, Redis, Postgres |

## Backend Handoff Gate

Finish this before the Next.js handoff.

Deliverables:

- Stable `.env.example` and startup docs.
- AI service validates config through `/ready`.
- Worker validates Redis and AI service config at boot.
- Worker output includes dashboard-ready `outcomeSummary`.
- Worker failure states are persisted as `FAILED` with an event log reason.
- Test fixtures exist for compliant, non-compliant, missing POSM, and fraud cases.

Definition of Done:

- `npm run check:worker` passes.
- `python -m compileall ai_service modal_gpu` passes.
- `/health` and `/ready` return expected responses.
- `npm run worker:dry-run -- visit_demo_001` prints compliance reasons.
- BullMQ queued smoke test processes one visit end to end.
- README or docs include exact startup commands.

Test setup:

```powershell
npm install
docker compose -f docker-compose.worker.yml up -d redis
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --host 127.0.0.1 --port 8001
npm run check:worker
python -m compileall ai_service modal_gpu
npm run worker:dry-run -- visit_demo_001
```

## Sprint Modules

### 1. Database And Prisma Repository

Why it matters:

The worker is currently production-shaped but backed by `worker/data/db.json`. Next.js needs real tables.

Deliverables:

- Prisma schema for `User`, `Outlet`, `Visit`, `VisitImage`, `AIResult`, `FraudSignal`, `VisitReport`, and `EventLog`.
- Postgres connection through `DATABASE_URL`.
- Seed script with reps, supervisors, outlets, and demo visits.
- `PrismaVisitRepository` implementing the existing worker repository contract.
- Worker switches repository based on env, for example `WORKER_REPOSITORY=prisma`.

Definition of Done:

- `npx prisma migrate dev` creates all tables.
- `npx prisma db seed` creates demo data.
- Worker can analyze a seeded visit and persist results to Postgres.
- Dashboard queries do not need to read JSON files.
- Existing JSON repository still works as local fallback.

Tests:

- Unit test repository methods against a test database.
- Integration test `analyzeVisit` with Prisma repository and mocked AI service.
- Manual verification query confirms rows in `ai_results`, `fraud_signals`, `visit_reports`, and `event_log`.

Suggested commands:

```powershell
npx prisma migrate dev
npx prisma db seed
npm run check:worker
npm run worker:dry-run -- visit_demo_001
```

### 2. Auth And RBAC

Why it matters:

The demo needs different rep and supervisor experiences, and API routes must not expose all operational data to reps.

Deliverables:

- Simple auth using Auth.js or credentials-based sprint auth.
- `users.role` with `REP`, `SUPERVISOR`, and `ADMIN`.
- Shared server helper for route protection.
- Rep routes scoped to own visits.
- Supervisor/admin routes can read dashboard, AI results, reports, fraud signals, and assistant.

Definition of Done:

- Rep can create and submit own visits.
- Rep cannot view another rep's visit directly by id.
- Supervisor can view all visits and dashboard.
- Assistant route rejects `REP` users.
- Admin can access user/outlet management routes if those routes exist.

Tests:

- Route test: rep can read own visit.
- Route test: rep cannot read another rep's visit.
- Route test: supervisor can read all visits.
- Route test: rep cannot call assistant query.
- UI smoke: rep and supervisor navigation differ.

### 3. Store Visit Workflow API

Why it matters:

This is the business flow: rep checks in, uploads image, submits visit, and receives async status.

Deliverables:

- `POST /api/visits` creates a visit draft.
- `POST /api/visits/:id/images` stores image metadata.
- `POST /api/visits/:id/submit` enqueues `analyze_visit`.
- `GET /api/visits/:id` returns visit, image, AI result, fraud signals, report, and events.
- `GET /api/outlets` returns selectable outlets.

Definition of Done:

- Visit can be created with outlet, GPS, timestamp, notes.
- At least one image is required before submit.
- Submit route returns `202` with `jobId`.
- Double submit uses idempotent job id `analyze-{visitId}`.
- Visit status transitions from `PENDING` to `ANALYZING` to `COMPLETE` or `FLAGGED`.

Tests:

- API route tests for validation errors.
- Integration test for submit route with mocked BullMQ queue.
- Manual test creates a visit and sees worker process it.

Sample submit response:

```json
{
  "visitId": "visit_123",
  "status": "ANALYZING",
  "jobId": "analyze-visit_123"
}
```

### 4. Image Storage

Why it matters:

The demo cannot rely on local paths once frontend upload starts.

Deliverables:

- Storage provider selected: Supabase Storage, S3-compatible storage, or local dev storage.
- Signed upload URL route, or direct multipart upload route for sprint speed.
- `visit_images` rows store `url`, `storageKey`, `contentType`, `sizeBytes`, and hash fields.
- Worker can analyze using `imageUrl`.

Definition of Done:

- Rep uploads image from browser.
- Uploaded image is visible in visit detail.
- Worker can fetch the same image and analyze it.
- Failed uploads do not create submit-ready visits.

Tests:

- Upload API rejects non-image content types.
- Upload API rejects images above configured max size.
- Worker integration test analyzes a URL-backed image.

### 5. Dashboard And Visit Detail

Why it matters:

This is what judges will see. The output must explain reasons, not just statuses.

Deliverables:

- Dashboard cards for visits, flagged visits, average compliance, queue status.
- Visit table with outlet, rep, status, score, POSM badge, fraud badge.
- Visit detail page with image, overlay, supervisor summary, reasons, action, detections.
- Image history per outlet.

Definition of Done:

- `FLAGGED` visits visibly show why they were flagged.
- Compliance reasons are displayed as first-class UI.
- Fraud signals show severity and message.
- Raw image and overlay are both accessible.
- Empty/loading/error states exist.

Tests:

- Component tests for `FLAGGED`, `COMPLETE`, and `FAILED` states.
- API fixture test renders dashboard from seeded data.
- Manual test after worker run shows updated result without page refresh or after polling.

Dashboard must render:

```json
{
  "complianceScore": 0,
  "complianceReasons": [
    "No Olympic products were detected.",
    "Competitor products dominate visible shelf space.",
    "POSM was not detected in the shelf image."
  ],
  "fraudSignals": [
    {
      "severity": "HIGH",
      "message": "Rep check-in location is far from the outlet location."
    }
  ]
}
```

### 6. Assistant And RAG

Why it matters:

The chatbot should answer operational questions like "Which outlets are failing compliance?" with exact lists, not vague summaries.

Deliverables:

- `visit_reports` table includes `retrievalText`, `facts`, and `embedding`.
- `embed_visit_report` worker consumes queued report jobs.
- Embeddings stored in Postgres with `pgvector`.
- Assistant route supports exact SQL/Prisma queries and semantic retrieval.
- Chat UI with cited outlet/visit results.

Definition of Done:

- New analyzed visit creates a report and embedding.
- Exact question uses database filters, not vector search only.
- Semantic question retrieves similar visit reports.
- Assistant response cites outlet names and visit ids.
- Assistant refuses or narrows unsafe broad SQL requests.

Query routing rule:

| User question | Backend method |
| --- | --- |
| "Which outlets are failing compliance?" | SQL/Prisma filter `score < threshold` or status in `poor/critical` |
| "Show outlets missing POSM" | SQL/Prisma filter on report facts or AI result POSM |
| "Find visits similar to this issue" | pgvector semantic search |
| "Summarize repeated issues" | SQL/Prisma retrieval plus LLM synthesis |

Tests:

- Unit test query classifier.
- Integration test exact failing-outlets query against seeded data.
- Integration test vector retrieval returns relevant report.
- Snapshot test assistant response includes outlet names and visit ids.

Sample assistant response:

```json
{
  "answer": "3 outlets are failing compliance: Rahim Store, Maa Enterprise, and City Mart.",
  "sources": [
    {
      "visitId": "visit_demo_001",
      "outletName": "Rahim Store",
      "score": 0,
      "reasons": ["No Olympic products were detected."]
    }
  ]
}
```

### 7. Offline Sync

Why it matters:

Offline capture is an impressive bonus and realistic for field reps.

Deliverables:

- IndexedDB store for visit drafts, one shelf image blob, and sync outbox. `DONE`
- Client-generated ids for offline visits. `DONE`
- Online/offline indicator. `DONE`
- Background sync loop that uploads pending visits when online. `DONE`
- Conflict-safe submit flow using idempotency keys. `DONE`

Definition of Done:

- Rep can create visit while offline.
- Rep can attach one shelf image while offline.
- Draft survives page refresh through IndexedDB.
- When online, visit is created, images upload, and worker job enqueues.
- UI shows `Pending sync`, `Syncing`, or `Retry needed`; synced visits move into normal visit history.

Tests:

- Browser test with network disabled creates a draft.
- Browser test restores network and confirms sync.
- Manual test verifies no duplicate visits after repeated sync clicks.

Suggested stack:

```text
Native IndexedDB
TanStack Query sync loop
client-generated visit ids
idempotency key per visit submit
```

### 8. Fraud Detection Hardening

Why it matters:

Fraud detection is mandatory and helps demo credibility.

Deliverables:

- Perceptual hash for near-duplicate images. `DONE`
- Blur detection using Laplacian variance. `SKIPPED` for demo reliability because shaky captures and low-end phone cameras would create avoidable false positives.
- Existing exact SHA-256 duplicate check remains.
- Existing EXIF GPS/time checks remain.
- GPS mismatch and timestamp anomaly persisted to database.
- Fraud score or severity rollup on visit.

Definition of Done:

- Reused exact image creates `DUPLICATE_IMAGE` signal.
- EXIF GPS/time mismatch creates `EXIF_GPS_MISMATCH` or `EXIF_TIMESTAMP_ANOMALY`.
- Nearby but not exact duplicate can be detected if perceptual hash lands.
- Fake GPS creates `GPS_MISMATCH`.
- Fraud reasons appear in dashboard and assistant facts.

Tests:

- Same image on two visits flags duplicate.
- Visually similar image on two visits creates `PERCEPTUAL_DUPLICATE_IMAGE`.
- Far check-in coordinates flag GPS mismatch.
- Future client timestamp flags anomaly.
- EXIF GPS/time fixture flags image metadata mismatch.

### 9. Observability And LGTM

Why it matters:

This turns the project from "it works" into "we can operate it."

Deliverables:

- OpenTelemetry instrumentation in Next.js API routes.
- OpenTelemetry instrumentation in BullMQ worker.
- OpenTelemetry instrumentation in FastAPI service.
- Trace id passed from request to queue to AI service.
- Docker Compose LGTM stack or Grafana Cloud config.
- Grafana dashboard for queue depth, latency, errors, inference time.

Definition of Done:

- One visit submission produces a trace across API, queue, worker, AI service, and database.
- Logs include `visitId`, `jobId`, and `traceId`.
- Metrics show queue depth and worker failures.
- Dashboard screenshot can be shown in final demo.

Tests:

- Manual trace check in Grafana Tempo.
- Log query in Loki for one `visitId`.
- Prometheus query shows worker job count.
- Failure test shows error log and failed job metric.

### 10. Alerts

Why it matters:

Alerts are a quick bonus and make critical compliance feel actionable.

Deliverables:

- `send_alert` queue or alert-log fallback.
- Alert created when visit is `FLAGGED`.
- Optional Twilio WhatsApp integration.
- Dashboard alert history.

Definition of Done:

- Critical visit creates alert record.
- Alert contains outlet, score, reason, and recommended action.
- Demo can show either actual WhatsApp message or mocked alert log.

Tests:

- Integration test flagged visit enqueues alert.
- Non-flagged visit does not enqueue alert.
- Mock provider records expected payload.

### 11. Deployment

Why it matters:

The sprint needs a shareable demo.

Deliverables:

- Frontend on Vercel.
- API/worker on Railway, Render, Fly.io, or similar.
- Redis on Upstash or managed Redis.
- Postgres with pgvector on Neon, Supabase, or Railway.
- Modal YOLO endpoint configured in production env.
- Smoke-test checklist.

Definition of Done:

- Public frontend URL works.
- API `/ready` works from deployed environment.
- Worker processes a submitted visit.
- Modal endpoint is used for YOLO inference.
- Dashboard shows real analysis result.

Tests:

- Production health check.
- Production visit submit.
- Production worker log confirms job completed.
- Production dashboard shows result and reasons.

## Recommended 72-Hour Execution Order

### Hours 0-8: Backend Production Gate

Deliver:

- Finalize docs and env contracts.
- Add backend scoring/fraud tests.
- Confirm local, Modal, LLM, and worker smoke paths.

DoD:

- Backend handoff gate passes.

### Hours 8-20: Database And Visit API

Deliver:

- Prisma schema.
- Seed data.
- Prisma repository.
- Visit create/upload/submit/read APIs.

DoD:

- Submit API enqueues a real BullMQ job and worker persists to Postgres.

### Hours 20-36: Next.js Workflow And Dashboard

Deliver:

- Outlet selection.
- GPS check-in.
- Image upload.
- Visit submission.
- Dashboard and visit detail.

DoD:

- End-to-end demo from browser upload to analysis result.

### Hours 36-48: Assistant And RAG

Deliver:

- Visit report embeddings.
- Assistant route.
- Exact compliance SQL/Prisma query support.
- Chat UI.

DoD:

- Asking "Which outlets are failing compliance?" returns a list with outlet names, scores, and reasons.

### Hours 48-60: Offline Sync And Fraud Hardening

Deliver:

- IndexedDB outbox.
- Offline visit draft with image blob.
- Blur detection.
- Better duplicate detection if time allows.

DoD:

- Offline visit syncs when network returns and then enters worker pipeline.

### Hours 60-72: Observability, Deploy, Demo Polish

Deliver:

- LGTM trace/log dashboard.
- Alert log or WhatsApp alert.
- Production deployment.
- Seeded demo scenario.
- Final demo script.

DoD:

- One clean demo flow plus one failure/flagged flow.
- Grafana or logs show traceable async pipeline.

## Daily Test Checklist

Run before every handoff or demo recording:

```powershell
npm run check:worker
$env:PYTHONUTF8='1'
python -m compileall ai_service modal_gpu
Invoke-RestMethod http://127.0.0.1:8001/ready
npm run worker:dry-run -- visit_demo_001
```

When Redis is involved:

```powershell
docker compose -f docker-compose.worker.yml up -d redis
npm run worker
npm run worker:enqueue-demo -- visit_demo_001
```

When Prisma lands:

```powershell
npx prisma migrate status
npx prisma db seed
npm test
```

When frontend lands:

```powershell
npm run lint
npm run typecheck
npm run test
npm run e2e
```

## Demo Acceptance Script

The finished sprint should support this exact story:

1. Rep opens visit workflow and selects outlet.
2. Rep checks in with GPS.
3. Rep uploads shelf image.
4. App submits visit and immediately shows `ANALYZING`.
5. Worker picks up BullMQ job.
6. YOLO runs on Modal GPU.
7. LLM checks for Olympic POSM.
8. Compliance score is calculated.
9. Fraud checks run.
10. Dashboard shows score, reasons, POSM status, fraud flags, image, and overlay.
11. Assistant answers "Which outlets are failing compliance?" with exact outlet list.
12. Observability view shows request-to-worker-to-AI trace.

## Highest-Risk Items

| Risk | Mitigation |
| --- | --- |
| Database integration takes longer than expected | Keep JSON repository fallback for demo, but prioritize Prisma early |
| Object storage slows frontend | Start with multipart local upload, then swap provider |
| RAG becomes vague | Use SQL/Prisma for exact list questions and vector search only for semantic similarity |
| Offline sync causes duplicates | Use client ids plus submit idempotency keys |
| Modal or OpenAI outage during demo | Keep local YOLO fallback and allow `useLlm=false` |
| Observability takes too long | Ship structured logs and event log first, then add LGTM dashboard |

## Cut Line If Time Is Tight

Must ship:

- Visit workflow.
- Image upload.
- Async worker analysis.
- YOLO detection.
- Compliance reasons.
- Supervisor summary.
- Fraud signal.
- Dashboard.

High-value bonus:

- Modal GPU inference.
- Assistant exact queries.
- Offline sync.
- LGTM observability.
- Alert log or WhatsApp mock.

Can cut:

- Advanced RBAC beyond `REP`, `SUPERVISOR`, and `ADMIN`.
- True WhatsApp delivery if alert log exists.
- Perceptual hash if exact duplicate and blur checks exist.
- Complex conflict resolution for offline sync.
- Full vector search if exact assistant queries work.
