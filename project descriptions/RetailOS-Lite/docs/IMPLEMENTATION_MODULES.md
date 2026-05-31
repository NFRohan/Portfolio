# RetailOS Lite Implementation Modules

This breakdown is optimized for a two-person sprint. It keeps modules independent enough for parallel work while preserving one clean end-to-end demo path.

## Build Strategy

Protect the core loop first:

```text
Rep creates visit
  -> image uploaded
  -> analysis job queued
  -> fraud + YOLO + compliance + LLM summary runs
  -> dashboard shows result
  -> assistant can answer from stored reports
```

Everything should plug into this loop. If a feature does not improve the loop or the demo story, defer it.

## Two-Person Ownership

### Developer A: Backend, AI Pipeline, Infra

Owns:

- Database schema
- Next.js API routes
- Upload/storage integration
- BullMQ queues and workers
- FastAPI AI service
- YOLO integration
- Fraud checks
- Compliance scoring
- LLM summary generation
- Embeddings/RAG backend
- LGTM/OpenTelemetry instrumentation

### Developer B: Frontend, Product Workflow, UX

Owns:

- Auth screens and role routing
- Rep visit workflow
- Image upload UI
- Offline draft/outbox UI
- Supervisor dashboard
- Visit detail page
- Fraud/compliance badges
- Assistant UI
- Ops dashboard UI
- Demo polish and seed data presentation

## Shared Contract Rules

- Backend exposes stable JSON contracts early, even if responses are mocked.
- Frontend builds against contracts, not database internals.
- Workers can initially return fake AI results, then swap in YOLO/LLM output.
- Every visit should have a visible status: `PENDING`, `ANALYZING`, `COMPLETE`, `FLAGGED`, or `FAILED`.
- Every async step should write an event log entry.

## Module 1: Foundation And Contracts

Owner: Developer A

Purpose:

Establish the shared skeleton so everyone can work independently.

Deliverables:

- Monorepo/app structure
- Environment variable template
- Prisma schema
- Seed script
- Shared TypeScript types or Zod schemas
- API response conventions

Core types:

```ts
type VisitStatus = "PENDING" | "ANALYZING" | "COMPLETE" | "FLAGGED" | "FAILED"

type ComplianceStatus = "excellent" | "acceptable" | "poor" | "critical"

type FraudSeverity = "LOW" | "MEDIUM" | "HIGH"
```

Done means:

- App boots locally.
- Database migrates.
- Seed users/outlets exist.
- Frontend can call a health/check endpoint.

## Module 2: Auth And Roles

Owner: Developer B

Purpose:

Separate rep and supervisor workflows.

Roles:

- `REP`: can create visits and view own visit history
- `SUPERVISOR`: can view dashboard, visits, alerts, assistant
- `ADMIN`: optional, can view ops pages and users

Routes:

```text
/login
/rep/visits
/rep/visits/new
/supervisor
/supervisor/visits/[id]
/assistant
/ops
```

Done means:

- Demo users can log in.
- Rep and supervisor land on different pages.
- Protected routes redirect unauthenticated users.

## Module 3: Outlet And Visit API

Owner: Developer A

Purpose:

Create and manage the visit lifecycle.

Endpoints:

```text
GET  /api/outlets
POST /api/outlets
POST /api/visits
GET  /api/visits
GET  /api/visits/:id
POST /api/visits/:id/submit
```

`POST /api/visits` request:

```json
{
  "clientVisitId": "local_123",
  "outletId": "outlet_123",
  "checkInLat": 23.7808,
  "checkInLng": 90.2792,
  "clientTimestamp": "2026-05-21T10:15:00+06:00",
  "notes": "Shelf checked near front counter."
}
```

`POST /api/visits/:id/submit` behavior:

- Set visit status to `ANALYZING`
- Enqueue `analyze_visit`
- Write `VISIT_SUBMITTED` event

Done means:

- Rep can create a visit.
- Submit changes status to `ANALYZING`.
- Job appears in queue.

## Module 4: Rep Visit Workflow UI

Owner: Developer B

Purpose:

Make the field workflow fast and mobile-friendly.

Screens:

- Outlet selector
- GPS check-in
- Image picker/capture
- Notes
- Submit confirmation
- Visit history

UI states:

- Draft
- Saved locally
- Uploading
- Submitted
- Analyzing
- Complete
- Failed

Done means:

- A rep can complete a visit from phone-sized viewport.
- The UI clearly shows visit status.
- Demo flow takes less than one minute.

## Module 5: Image Upload And Object Storage

Owner: Developer A

Purpose:

Store raw shelf images and analysis overlays.

Endpoints:

```text
POST /api/uploads/sign
POST /api/visits/:id/images
```

`POST /api/uploads/sign` request:

```json
{
  "visitId": "visit_123",
  "fileName": "shelf.jpg",
  "contentType": "image/jpeg"
}
```

`POST /api/visits/:id/images` request:

```json
{
  "url": "https://storage.example/shelf.jpg",
  "imageHash": "sha256_hash",
  "metadata": {
    "width": 1280,
    "height": 720,
    "sizeBytes": 234000
  }
}
```

Done means:

- Frontend can upload an image.
- Image metadata is attached to a visit.
- Uploaded image appears on visit detail page.

## Module 6: Offline Visit Capture

Owner: Developer B, with API support from Developer A

Purpose:

Let reps capture visits and one shelf photo without network.

Frontend responsibilities:

- Store drafts in IndexedDB
- Store one shelf image blob in IndexedDB
- Show offline banner
- Show pending sync count
- Retry failed sync

Backend responsibilities:

- Accept `clientVisitId`
- Make visit creation idempotent
- Preserve client timestamp

Local statuses:

```text
draft
queued
syncing
synced
failed
```

Done means:

- User can create a visit while offline.
- Visit syncs when online returns.
- Synced visit triggers normal analysis.

## Module 7: Queue And Worker Pipeline

Owner: Developer A

Purpose:

Decouple visit submission from heavy AI processing.

Implementation status:

- Standalone worker module exists under `worker/`
- Local JSON repository exists for dry-run testing before Prisma lands
- BullMQ queue bootstrap exists
- Dry-run script can execute `analyze_visit` without Redis

Queues:

```text
analyze_visit
embed_visit_report
send_alert
```

`analyze_visit` payload:

```json
{
  "visitId": "visit_123",
  "traceId": "trace_abc"
}
```

Worker steps:

```text
load visit
load images
run contextual fraud checks
call FastAPI /analyze-shelf
receive YOLO + LLM POSM + compliance + summary
save AIResult
save FraudSignal rows
queue embed_visit_report
mark visit COMPLETE or FLAGGED
write event log
```

Done means:

- Job retries on failure.
- Job writes status and events.
- Job owns orchestration; API requests never wait on YOLO or LLM calls.
- Failed jobs are visible in ops page.

## Module 8: Fraud Detection

Owner: Developer A

Purpose:

Flag suspicious or low-quality submissions.

Checks:

- Duplicate image hash
- Blurry image using Laplacian variance
- GPS mismatch using Haversine distance
- Timestamp anomaly using client/server timestamp delta

Output:

```json
{
  "flags": [
    {
      "type": "BLURRY_IMAGE",
      "severity": "MEDIUM",
      "message": "Image appears blurry. Sharpness score is below threshold.",
      "metadata": {
        "sharpness": 72.4,
        "threshold": 100
      }
    }
  ]
}
```

Done means:

- At least two fraud checks work.
- Fraud badges appear in dashboard and visit detail.
- High severity signals mark visit as `FLAGGED`.

## Module 9: YOLO Shelf Detection

Owner: Developer A

Purpose:

Detect Olympic products and competitors from shelf images.

Runtime options:

- Local YOLO for development and fallback
- Modal GPU YOLO endpoint for distributed inference

FastAPI endpoint:

```text
POST /detect-yolo
```

Request:

```json
{
  "visitId": "visit_123",
  "imageUrls": ["https://storage.example/shelf.jpg"]
}
```

Response:

```json
{
  "modelName": "retail-shelf-yolo",
  "modelVersion": "v1",
  "detections": [
    {
      "label": "olympic_product",
      "confidence": 0.91,
      "box": {
        "x": 120,
        "y": 80,
        "width": 160,
        "height": 220
      }
    }
  ],
  "counts": {
    "olympic": 8,
    "competitor": 15
  },
  "visibilityRatio": 0.34,
  "overlayImageUrl": "https://storage.example/overlay.jpg"
}
```

Done means:

- Worker can call YOLO endpoint.
- Detections are stored.
- Overlay image appears in visit detail.
- Modal GPU can be enabled with `RETAILOS_YOLO_BACKEND=modal` without changing worker code.

## Module 10: Compliance Engine

Owner: Developer A

Purpose:

Turn detection and fraud data into business scoring.

Inputs:

- YOLO counts
- Visibility ratio
- Competitor count
- POSM signal from LLM or manual form
- Fraud flags

Score bands:

```text
80-100 excellent
60-79 acceptable
40-59 poor
0-39 critical
```

Output:

```json
{
  "score": 42,
  "status": "poor",
  "reasons": [
    "Olympic shelf share is low",
    "Competitor products dominate the visible shelf",
    "POSM is missing"
  ],
  "recommendedAction": "Request a revisit with POSM placement and improved shelf visibility."
}
```

Done means:

- Compliance score is deterministic.
- Reasons are visible in dashboard.
- Same input produces same score.

## Module 11: LLM Summary Generation

Owner: Developer A

Purpose:

Generate supervisor-friendly summaries and POSM analysis from structured facts plus the shelf image.

Input:

- Detection counts
- Compliance score
- Compliance reasons
- Fraud flags
- Outlet metadata
- Rep notes
- Shelf image

Output:

```json
{
  "posm": {
    "detected": false,
    "confidence": 0.82,
    "evidence": "No visible Olympic branded poster, shelf strip, dangler, or promotional sign."
  },
  "supervisorSummary": "Outlet has poor Olympic visibility and missing POSM. Competitor presence is strong.",
  "recommendedAction": "Ask rep to revisit and place POSM near the shelf."
}
```

Done means:

- POSM presence is detected by vision LLM when configured.
- Summary is short and useful.
- Prompt version/model name are stored.
- If LLM fails, fallback summary is generated from rules.

## Module 12: Supervisor Dashboard

Owner: Developer B

Purpose:

Make AI results operationally visible.

Widgets:

- Visits today
- Average compliance score
- Flagged visits
- Failing outlets
- Recent AI summaries
- Fraud flags by type
- Image history

Endpoint:

```text
GET /api/dashboard
```

Done means:

- Supervisor can see which outlets need action.
- Dashboard updates after analysis completes.
- Visit detail shows raw image, overlay, score, reasons, fraud flags, and summary.

## Module 13: AI Assistant And RAG

Owner: Developer A backend, Developer B UI

Purpose:

Let supervisors ask operational questions.

Backend tools:

```text
getFailingOutlets
getFlaggedVisits
getOutletHistory
searchVisitReports
```

Assistant endpoint:

```text
POST /api/chat
```

Example question:

```text
Which outlets are failing compliance today?
```

Correct behavior:

- Use SQL/Prisma tool for exact list questions.
- Use vector search for fuzzy/similarity questions.
- LLM formats the retrieved rows.
- LLM does not invent outlets.

Done means:

- Assistant returns a list of failing outlets with score, reason, and visit link.
- Assistant can search previous visit reports semantically.

## Module 14: Embeddings And Visit Reports

Owner: Developer A

Purpose:

Create searchable memory for past visits.

`embed_visit_report` worker steps:

```text
load AIResult + Visit + Outlet + FraudSignal
build VisitReport.retrievalText
generate embedding
save VisitReport
```

Done means:

- Every completed visit has a report.
- Reports can be retrieved by vector search.
- Assistant uses reports as context.

## Module 15: Ops Dashboard And LGTM

Owner: Developer A backend/telemetry, Developer B UI

Purpose:

Show the system is observable and production-shaped.

Backend:

- OpenTelemetry spans
- Structured JSON logs
- Queue metrics
- Event log table
- `/api/ops/metrics`
- `/api/ops/events`

Frontend:

- Queue status cards
- Failed jobs table
- Recent events
- Trace id links or copyable trace ids

Grafana panels:

- Queue depth
- Job duration p95
- YOLO latency
- LLM latency
- Job failure rate
- Compliance score trend
- Fraud flags by type

Done means:

- A demo user can open `/ops` and see pipeline activity.
- Grafana shows at least queue/job/model metrics.
- Logs include `visitId`, `jobId`, and `traceId`.

## Module 16: Alerts

Owner: Developer A backend, Developer B UI copy/presentation

Purpose:

Notify supervisors when visits are critical or suspicious.

MVP:

- Store alert log in database
- Show alert in dashboard
- Optional WhatsApp/Twilio integration

Trigger:

```text
complianceScore < 40 OR high severity fraud flag exists
```

Done means:

- Critical visit produces an alert.
- Alert is visible in dashboard.
- Optional WhatsApp can be enabled with env vars.

## Integration Order

1. Foundation, schema, seed data
2. Auth and visit creation
3. Image upload
4. YOLO inference endpoint with one test image
5. Queue job calls YOLO and saves detections
6. Dashboard reads YOLO-backed result
7. Fraud checks
8. Compliance scoring
9. LLM summary
10. Visit report and embeddings
11. Assistant tools
12. Offline sync
13. LGTM dashboards
14. Alerts and polish

## YOLO-First Slice

Because the trained model is ready, prioritize image inference immediately after upload works.

Goal:

```text
local shelf image
  -> FastAPI /detect-yolo
  -> detections JSON
  -> optional overlay image
  -> worker stores AIResult
  -> dashboard displays counts, ratio, overlay, and model version
```

Build order:

1. Create a standalone FastAPI `/detect-yolo` endpoint that accepts either a file upload or image URL.
2. Load the YOLO model once at process startup, not per request.
3. Return normalized detections with labels, confidence, bounding boxes, counts, visibility ratio, model name, and model version.
4. Add overlay generation only after raw detections are stable.
5. Wire the BullMQ `analyze_visit` worker to call `/analyze-shelf`.
6. Save detections into `AIResult.yoloDetections` with `analysisSource = "YOLO"` or `"HYBRID"`.
7. Show the output on the supervisor visit detail page before polishing the scoring rules.

The first milestone should not wait for auth, offline sync, RAG, or LGTM. A working YOLO inference path is the strongest proof that the project is more than a CRUD dashboard.

## Minimum Demo Cut

If time gets brutal, ship these:

- Rep visit creation
- Image upload
- Async job status
- YOLO or LLM shelf result
- Compliance score
- Supervisor summary
- Dashboard
- One fraud check
- Assistant `getFailingOutlets`

## Strong Demo Cut

If the sprint is going well, ship these too:

- YOLO overlays
- Modal GPU inference backend
- Offline visit outbox
- LGTM/Grafana panels
- RAG over previous visits
- WhatsApp or alert log
- Ops dashboard with failed jobs and traces
