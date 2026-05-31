# RetailOS Lite Architecture

RetailOS Lite is a 72-hour AI-native retail execution workflow.

The core product story:

1. A rep checks in at an outlet with GPS, timestamp, notes, and shelf images.
2. The app stores the visit and enqueues async analysis.
3. AI detects Olympic products, competitor presence, POSM evidence, and fraud signals.
4. Supervisors see compliance scores, reasons, image history, and AI summaries.
5. An assistant can answer operational questions from previous visit reports.

This document is intentionally high level. Detailed API contracts and sprint tasks live in:

- [Implemented System Reference](IMPLEMENTED_SYSTEM_REFERENCE.md)
- [Backend Handoff](BACKEND_HANDOFF.md)
- [Remaining Sprint Plan](REMAINING_SPRINT_PLAN.md)
- [Modal GPU Inference](MODAL_GPU_INFERENCE.md)
- [YOLO Inference Pipeline](YOLO_INFERENCE_PIPELINE.md)

## Architecture Goals

- Prioritize the retail workflow over technical novelty.
- Keep user-facing requests fast by pushing heavy AI work to queues.
- Use YOLO for trained product detection and LLM vision for untrained visual reasoning.
- Store structured outputs first, prose second.
- Make every flagged visit explainable with reasons.
- Keep local fallback paths so demo risk stays low.
- Show production-shaped engineering with async queues, Modal GPU, and observability.

## System Diagram

```text
Rep Web/PWA
  |
  v
Next.js App
  - visit workflow
  - dashboard
  - assistant
  - API routes
  |
  +--> PostgreSQL + pgvector
  |     - visits, images, ai_results
  |     - fraud_signals, visit_reports
  |
  +--> Object Storage
  |     - raw shelf images
  |     - annotated overlays
  |
  +--> Redis / BullMQ
        - analyze_visit
        - embed_visit_report
        - send_alert
        |
        v
      Worker
        - fraud checks
        - AI service calls
        - result persistence
        |
        v
      FastAPI AI Service
        - YOLO local or Modal GPU
        - OpenAI POSM analysis
        - compliance scoring
        - supervisor summary
```

## Recommended Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js App Router, TypeScript, Tailwind |
| Product backend | Next.js route handlers or server actions |
| Auth/RBAC | Auth.js or sprint-speed credentials auth with server-side role checks |
| Database | PostgreSQL with Prisma |
| Vector search | pgvector |
| Queue | Redis + BullMQ |
| Worker | Node.js TypeScript worker |
| AI service | FastAPI |
| Product detection | YOLO model in `Detection Model/best.pt` |
| GPU inference | Modal GPU endpoint |
| POSM and summary | OpenAI vision model |
| Storage | Supabase Storage, S3-compatible storage, or local dev storage |
| Observability | OpenTelemetry + Grafana/Loki/Tempo/Metrics |
| Deployment | Vercel, Railway/Render/Fly, Modal, managed Redis/Postgres |

## Core Services

### Next.js App

Owns product workflow and supervisor UI.

Responsibilities:

- Auth and role-aware navigation.
- Outlet selection.
- GPS check-in.
- Image upload.
- Visit submit.
- Dashboard and visit detail.
- Assistant UI.
- API routes that create visits, upload images, enqueue jobs, and read results.

The Next.js request path should not run YOLO or call OpenAI directly for analysis.

### BullMQ Worker

Owns async visit analysis orchestration.

Responsibilities:

- Consume `analyze_visit`.
- Load visit, outlet, and image records.
- Run fraud checks.
- Call FastAPI `/analyze-shelf`.
- Persist AI results, fraud signals, visit reports, and event logs.
- Mark visits `COMPLETE`, `FLAGGED`, or `FAILED`.
- Enqueue `embed_visit_report`.

### FastAPI AI Service

Owns image intelligence and compliance logic.

Responsibilities:

- Run YOLO locally or route inference to Modal GPU.
- Generate overlay images.
- Call OpenAI vision for Olympic POSM and shelf-quality reasoning.
- Calculate compliance score and reasons.
- Return structured JSON for the worker.

### Modal GPU Endpoint

Owns distributed YOLO inference.

Responsibilities:

- Load `best.pt` on a GPU container.
- Accept base64 image payloads.
- Return detections, counts, bounding boxes, and visibility metrics.
- Default inference size is `1280`, matching the model setup.

## End-To-End Flow

```text
Rep submits visit
  -> Next.js validates visit and image
  -> Image is stored
  -> Visit status becomes ANALYZING
  -> BullMQ job analyze_visit is enqueued
  -> Worker runs fraud checks
  -> Worker calls FastAPI /analyze-shelf
  -> FastAPI runs YOLO through local or Modal backend
  -> FastAPI optionally runs OpenAI POSM analysis
  -> FastAPI calculates compliance
  -> Worker saves AI result, fraud signals, report text, and events
  -> Visit becomes COMPLETE or FLAGGED
  -> Dashboard displays reasons and recommendations
```

## Data Model Summary

Minimum tables:

| Table | Purpose |
| --- | --- |
| `users` | Reps, supervisors, admins, roles |
| `outlets` | Outlet metadata and expected GPS |
| `outlet_assignments` | Optional rep-to-outlet access scoping |
| `visits` | Check-in, status, timestamps, notes |
| `visit_images` | Raw images, storage keys, hashes, metadata |
| `ai_results` | YOLO output, POSM result, score, summary |
| `fraud_signals` | Duplicate, blur, GPS, timestamp findings |
| `visit_reports` | RAG-ready report text, facts, embedding |
| `event_log` | Audit trail and operational timeline |

The worker currently uses a JSON repository for local testing. Production should swap this for a Prisma repository with the same method contract.

## RBAC Strategy

RBAC should be simple but real. Do not rely on client-side hiding only; enforce access in server routes.

MVP roles:

| Role | Can do |
| --- | --- |
| `REP` | Create own visits, upload images, submit visits, view own visit status |
| `SUPERVISOR` | View all visits, dashboards, AI results, fraud signals, reports, assistant |
| `ADMIN` | Supervisor permissions plus user/outlet management and system settings |

Route enforcement:

| Area | Access |
| --- | --- |
| Visit creation and image upload | `REP`, `SUPERVISOR`, `ADMIN` |
| Own visit read | Owning `REP`, `SUPERVISOR`, `ADMIN` |
| Dashboard | `SUPERVISOR`, `ADMIN` |
| Assistant | `SUPERVISOR`, `ADMIN` |
| User/outlet admin | `ADMIN` |
| Worker and FastAPI internals | Service-only, not browser-accessible |

MVP implementation:

- Store `role` on `users`.
- Add a shared server helper like `requireRole(["SUPERVISOR", "ADMIN"])`.
- Scope rep queries by `repId`.
- Use outlet assignments only if needed for demo realism.
- Keep UI role-aware, but treat server checks as the source of truth.

## AI Analysis Strategy

Use the right model for each job:

| Need | Tool |
| --- | --- |
| Olympic product detection | YOLO |
| Competitor product detection | YOLO |
| Share-of-shelf approximation | YOLO bounding boxes |
| POSM presence | Vision LLM |
| Shelf neatness and context | Vision LLM |
| Compliance score | Deterministic rules |
| Supervisor summary | LLM summary with rule-based fallback |
| Historical questions | SQL/Prisma plus vector retrieval |

Important rule: POSM means Olympic-branded POSM only. Other brand signage should be described but should not count as Olympic POSM.

## Compliance Strategy

Compliance should be transparent, not mysterious.

Inputs:

- Olympic product count.
- Competitor product count.
- Olympic visibility ratio.
- Competitor dominance.
- Olympic POSM presence.
- Fraud signals.

Outputs:

- Numeric score.
- Status: `excellent`, `acceptable`, `poor`, or `critical`.
- Human-readable reasons.
- Recommended action.
- Supervisor summary.

The dashboard must show reasons, not just the final score.

## Fraud Strategy

Mandatory MVP checks:

- Duplicate image detection.
- GPS mismatch.
- Timestamp anomaly.
- EXIF GPS/time mismatch.

High-value hardening:

- Blurry image detection.
- Perceptual hash for near-duplicates.
- Fraud severity rollup.

Fraud checks run server-side in the worker after a visit is submitted or synced from offline mode.

## Assistant And RAG Strategy

The assistant should not rely on vector search for exact operational lists.

Use SQL/Prisma for questions like:

- "Which outlets are failing compliance?"
- "Which visits are missing POSM?"
- "Show critical visits this week."

Use vector search for questions like:

- "Find visits similar to this shelf issue."
- "Summarize recurring visibility problems."
- "Where have we seen this kind of competitor dominance?"

Each analyzed visit produces a concise `visit_report` with:

- Summary.
- Structured facts.
- Retrieval text.
- Embedding.

## Offline Sync Strategy

Offline sync is a bonus feature, but it fits the field-rep workflow well.

MVP behavior:

- Store visit draft and one shelf image blob in IndexedDB.
- Use client-generated visit ids.
- Show pending sync status.
- When online, upload image first, submit visit second, enqueue analysis third.
- Use idempotency keys to avoid duplicate visits.

Recommended client stack:

- Dexie or `idb-keyval`.
- TanStack Query persistence.
- Browser online/offline events.

## Observability Strategy

The async pipeline is a strong observability demo.

Trace shape:

```text
visit.submit
  -> db.visit.create
  -> queue.analyze_visit.enqueue
  -> worker.analyze_visit
  -> fraud.check
  -> ai.analyze_shelf
  -> yolo.inference
  -> llm.posm
  -> db.results.save
```

Minimum signals:

- `visitId`, `jobId`, and `traceId` in logs.
- Queue depth.
- Worker job duration and failure count.
- YOLO inference latency.
- LLM latency and failure count.
- Compliance score distribution.

## API Boundaries

### Next.js API

```text
POST /api/visits
POST /api/visits/:id/images
POST /api/visits/:id/submit
GET  /api/visits/:id
GET  /api/dashboard
POST /api/assistant/query
```

### Worker Queues

```text
analyze_visit
embed_visit_report
send_alert
```

### FastAPI AI Service

```text
GET  /health
GET  /ready
GET  /model
POST /detect-yolo
POST /detect-yolo/upload
POST /analyze-shelf
```

## Deployment Shape

```text
Vercel
  - Next.js app

Managed Postgres
  - app data
  - pgvector reports

Managed Redis
  - BullMQ queues

Worker host
  - analyze_visit worker
  - embedding worker

FastAPI host
  - AI service
  - local fallback inference

Modal
  - GPU YOLO endpoint

Grafana/LGTM
  - logs, traces, metrics
```

## Demo Path

The final demo should show:

1. Rep creates a visit.
2. Rep checks in with GPS.
3. Rep uploads shelf image.
4. Visit moves to `ANALYZING`.
5. Worker runs async AI analysis.
6. Dashboard shows compliance score and reasons.
7. Supervisor opens image overlay and POSM finding.
8. Fraud signal appears if applicable.
9. Assistant answers "Which outlets are failing compliance?"
10. Observability view shows the async trace or structured logs.

## Build Priorities

Must ship:

- Store visit workflow.
- Image upload.
- YOLO analysis.
- Compliance scoring.
- Supervisor summary.
- At least one fraud signal.
- Dashboard.

High-impact bonuses:

- Modal GPU inference.
- Offline sync.
- Assistant with exact SQL-backed answers.
- LGTM observability.
- Alert log or WhatsApp alert.

Can cut if time is tight:

- Advanced RBAC beyond `REP`, `SUPERVISOR`, and `ADMIN`.
- Complex offline conflict resolution.
- True WhatsApp delivery.
- Perceptual hash.
- Advanced dashboard filters.

## Key Decisions

- Heavy AI work belongs in workers, not request handlers.
- FastAPI is the AI service boundary; Next.js owns product APIs.
- YOLO handles trained detections; LLM handles POSM/context.
- Exact assistant questions use SQL/Prisma before vector search.
- Every flagged visit must expose reasons and recommended action.
- Local fallback is required for demo resilience.
