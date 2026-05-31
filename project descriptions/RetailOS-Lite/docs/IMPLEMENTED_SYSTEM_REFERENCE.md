# Implemented System Reference

This document captures the backend, AI, worker, and integration contracts that are currently implemented in RetailOS Lite.

Use this as the handoff reference for the Next.js team.

## Current Working Slice

```text
Visit image
  -> optional IndexedDB offline outbox
  -> online sync through Next.js APIs
  -> FastAPI AI service
  -> local YOLO or Modal GPU YOLO
  -> optional OpenAI vision POSM analysis
  -> compliance scoring
  -> BullMQ worker persistence flow
  -> DLQ capture for terminal analyze and embedding failures
  -> dashboard-ready outcome summary
  -> visit report retrieval text
  -> OpenAI embedding + Pinecone vector index
  -> supervisor assistant exact SQL + RAG answers
```

Implemented modules:

| Module | Status | Notes |
| --- | --- | --- |
| FastAPI AI service | Implemented | Health, readiness, model info, YOLO detection, shelf analysis |
| YOLO local inference | Implemented | Uses `Detection Model/best.pt` |
| Modal GPU inference | Implemented | Selected with `RETAILOS_YOLO_BACKEND=modal` |
| OpenAI POSM analysis | Implemented | Optional vision LLM layer for Olympic POSM and summary |
| Compliance scoring | Implemented | Deterministic rules with score, status, reasons, action |
| Worker orchestration | Implemented | BullMQ `analyze_visit` job calls AI service and saves output |
| Dead-letter queue | Implemented | Terminal failed `analyze_visit` and `embed_visit_report` jobs are copied to matching DLQs |
| Fraud checks | Implemented | Exact duplicate, perceptual duplicate, GPS mismatch, timestamp anomaly, EXIF GPS/time checks |
| Image storage | Implemented | Local disk by default; S3-compatible MinIO/R2/S3 driver available |
| Offline sync | Implemented | Rep visits queue in IndexedDB and sync through TanStack Query when online |
| Visit report text | Implemented | Builds fact-heavy text for RAG embedding |
| Embedding worker | Implemented | Consumes `embed_visit_report` and indexes reports via AI service |
| Supervisor assistant | Implemented | Next.js route uses exact Prisma context plus AI service vector retrieval |
| Real database repository | Implemented | Worker uses Prisma when `DATABASE_URL` is set; JSON remains a local fallback |
| Observability | Implemented | Sentry, structured logs, Prometheus metrics, LGTM compose, `/supervisor/ops` |

## Runtime Services

| Service | Path | Purpose |
| --- | --- | --- |
| AI service | `ai_service/app/main.py` | FastAPI API for detection and analysis |
| YOLO backend switch | `ai_service/app/yolo_backend.py` | Routes inference to local model or Modal |
| LLM analysis | `ai_service/app/llm_analysis.py` | OpenAI vision analysis for POSM and summary |
| Compliance engine | `ai_service/app/compliance.py` | Converts model output into business score |
| Worker | `worker/src/index.ts` | Runs BullMQ job processor |
| Worker job | `worker/src/jobs/analyzeVisit.ts` | Full async visit analysis lifecycle |
| Fraud service | `worker/src/services/fraud.ts` | Duplicate hash, GPS, timestamp, EXIF checks |
| Offline outbox | `lib/offline-visits.ts` | IndexedDB queue and idempotent visit sync client |
| Offline sync hook | `hooks/use-offline-visit-sync.ts` | TanStack Query queue polling and retry orchestration |
| Outcome summary | `worker/src/services/outcomeSummary.ts` | Dashboard-ready final explanation |
| Report builder | `worker/src/services/reportBuilder.ts` | RAG-ready retrieval text |
| Assistant API | `app/api/assistant/query/route.ts` | Authenticated supervisor assistant route |
| RAG service | `ai_service/app/rag.py` | OpenAI embeddings, Pinecone search, GPT answer generation |
| Ops dashboard | `app/supervisor/ops/page.tsx` | EventLog timelines, queue health, worker failures |
| Observability docs | `docs/OBSERVABILITY.md` | Sentry and LGTM setup |
| Modal endpoint | `modal_gpu/yolo_endpoint.py` | GPU YOLO detection endpoint |

## Environment

Copy `.env.example` to `.env`.

```env
# AI service
AI_SERVICE_URL=http://127.0.0.1:8001
RETAILOS_AI_SERVICE_API_KEY=
RETAILOS_YOLO_MODEL_PATH=E:\Projects\RetailOS-Lite\Detection Model\best.pt
RETAILOS_YOLO_BACKEND=local
RETAILOS_MODAL_YOLO_URL=
RETAILOS_YOLO_FALLBACK_LOCAL=true
RETAILOS_LLM_ENABLED=true
RETAILOS_LLM_PROVIDER=openai
RETAILOS_LLM_MODEL=gpt-5.4-mini
RETAILOS_CHAT_MODEL=gpt-5.4-mini
RETAILOS_EMBEDDING_MODEL=text-embedding-3-small
RETAILOS_EMBEDDING_DIMENSIONS=512
RETAILOS_CORS_ORIGINS=*
OPENAI_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX=
PINECONE_HOST=
PINECONE_NAMESPACE=retailos-visit-reports

# Image/object storage
IMAGE_STORAGE_DRIVER=local
IMAGE_STORAGE_LOCAL_DIR=public/uploads
IMAGE_STORAGE_LOCAL_PUBLIC_BASE=/uploads
IMAGE_STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:9000/retailos-images
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=retailos-images
S3_ACCESS_KEY_ID=retailos
S3_SECRET_ACCESS_KEY=retailos-secret
S3_FORCE_PATH_STYLE=true
S3_PREFIX=uploads

# Observability
LOG_TO_FILE=false
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1
WORKER_METRICS_PORT=9101

# Worker
REDIS_URL=redis://127.0.0.1:6379
ANALYZE_VISIT_QUEUE=analyze_visit
ANALYZE_VISIT_DLQ=analyze_visit_dlq
EMBED_VISIT_REPORT_QUEUE=embed_visit_report
EMBED_VISIT_REPORT_DLQ=embed_visit_report_dlq
WORKER_CONCURRENCY=2
WORKER_USE_LLM=true
WORKER_LOCAL_DB_PATH=
FRAUD_GPS_THRESHOLD_METERS=200
FRAUD_TIMESTAMP_DELAY_HOURS=6
FRAUD_EXIF_GPS_THRESHOLD_METERS=300
FRAUD_EXIF_TIMESTAMP_DRIFT_HOURS=24
```

For Modal GPU:

```env
RETAILOS_YOLO_BACKEND=modal
RETAILOS_MODAL_YOLO_URL=https://nfr12388--retailos-yolo-gpu-yologpuendpoint-detect.modal.run
RETAILOS_YOLO_FALLBACK_LOCAL=true
```

## Image Storage

Uploads go through `lib/storage.ts` instead of writing directly inside the API route.

Default local mode:

```env
IMAGE_STORAGE_DRIVER=local
```

This writes to `public/uploads` and returns `/uploads/...`, which is fastest for local demos.

MinIO/S3-compatible mode:

```env
IMAGE_STORAGE_DRIVER=s3
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=retailos-images
S3_ACCESS_KEY_ID=retailos
S3_SECRET_ACCESS_KEY=retailos-secret
IMAGE_STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:9000/retailos-images
```

Start local object storage:

```powershell
docker compose -f docker-compose.worker.yml up -d minio minio-init
```

Production swap:

- Keep the same storage driver.
- Replace MinIO endpoint and credentials with Cloudflare R2, AWS S3, Supabase Storage S3, or another S3-compatible bucket.
- Browser uploads can use pre-signed URLs through the S3-compatible storage driver, keeping object credentials server-side.

## AI Service Auth

`/health`, `/ready`, `/model`, and `/artifacts/...` remain open for local checks and image rendering.

Inference endpoints are protected when an API key is configured:

```env
RETAILOS_AI_SERVICE_API_KEY=shared-dev-secret
```

Protected endpoints:

- `POST /analyze-shelf`
- `POST /detect-yolo`
- `POST /detect-yolo/upload`
- `POST /rag/index-report`
- `POST /assistant/query`

The worker automatically sends the same value as `x-api-key` when configured.

## AI Service API

Base URL:

```text
http://127.0.0.1:8001
```

Start locally:

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

### `GET /health`

Use for basic process health.

Response shape:

```json
{
  "status": "ok",
  "modelLoaded": false,
  "modelPath": "E:\\Projects\\RetailOS-Lite\\Detection Model\\best.pt"
}
```

Notes:

- `modelLoaded` means the local model has already been loaded into memory.
- This endpoint does not guarantee Modal configuration is valid.
- Use `/ready` for deployment readiness.

### `GET /ready`

Use for deployment readiness checks.

Response shape:

```json
{
  "status": "ready",
  "yoloBackend": "local",
  "errors": []
}
```

Failure shape:

```json
{
  "status": "not_ready",
  "yoloBackend": "modal",
  "errors": [
    "RETAILOS_MODAL_YOLO_URL is required when RETAILOS_YOLO_BACKEND=modal"
  ]
}
```

Behavior:

- Returns `200` when ready.
- Returns `503` when required backend config is missing.

### `GET /model`

Returns active model metadata.

Sample response:

```json
{
  "modelName": "retail-shelf-yolo",
  "modelVersion": "v1",
  "modelPath": "E:\\Projects\\RetailOS-Lite\\Detection Model\\best.pt",
  "yoloBackend": "local",
  "modalConfigured": false,
  "defaultConfidence": 0.25,
  "defaultImageSize": 1280,
  "classNames": {
    "0": "foodie_noodles_olympics",
    "1": "mr_noodles_competitor"
  }
}
```

### `POST /detect-yolo`

Runs YOLO only. Use this for low-level detection tests.

Request shape:

```json
{
  "visitId": "visit_demo_001",
  "imagePath": "E:\\Projects\\RetailOS-Lite\\Detection Model\\yolo_dataset\\images\\val\\olympic_poc_image_94.jpg",
  "imageUrl": null,
  "confidence": 0.25,
  "imageSize": 1280,
  "saveOverlay": true
}
```

Field notes:

| Field | Required | Notes |
| --- | --- | --- |
| `visitId` | No | Propagated into response and overlay naming |
| `imagePath` | One of `imagePath` or `imageUrl` | Local file path for worker/dev |
| `imageUrl` | One of `imagePath` or `imageUrl` | Remote image URL downloaded by service |
| `confidence` | No | Defaults to env or `0.25` |
| `imageSize` | No | Defaults to env or `1280` |
| `saveOverlay` | No | Saves annotated image if true |

Response shape:

```json
{
  "visitId": "visit_demo_001",
  "modelName": "retail-shelf-yolo",
  "modelVersion": "v1",
  "analysisSource": "YOLO",
  "imageWidth": 1280,
  "imageHeight": 720,
  "confidenceThreshold": 0.25,
  "inputImageSize": 1280,
  "inferenceMs": 261.41,
  "counts": {
    "olympic": 0,
    "competitor": 22,
    "total": 22
  },
  "areas": {
    "olympic": 0,
    "competitor": 142061.61,
    "total": 142061.61
  },
  "metrics": {
    "countRatio": 0,
    "visibilityRatio": 0,
    "olympicAreaRatio": 0,
    "competitorAreaRatio": 0.1541
  },
  "detections": [
    {
      "label": "mr_noodles_competitor",
      "classId": 1,
      "category": "competitor",
      "confidence": 0.91,
      "box": {
        "x": 450.2,
        "y": 120.4,
        "width": 88.1,
        "height": 130.8
      },
      "area": 11523.48
    }
  ],
  "overlayImageUrl": "/artifacts/overlays/visit_demo_001_overlay.jpg"
}
```

### `POST /analyze-shelf`

Main endpoint for the worker. Runs YOLO, optional LLM POSM analysis, compliance scoring, and summary generation.

Request shape:

```json
{
  "visitId": "visit_demo_001",
  "imagePath": "worker/data/images/demo_shelf.jpg",
  "confidence": 0.25,
  "imageSize": 1280,
  "saveOverlay": true,
  "useLlm": true,
  "outletName": "Rahim Store",
  "repNotes": "Shelf near front counter."
}
```

Response shape:

```json
{
  "visitId": "visit_demo_001",
  "yolo": {
    "modelName": "retail-shelf-yolo",
    "modelVersion": "v1",
    "analysisSource": "YOLO_MODAL_GPU",
    "imageWidth": 1280,
    "imageHeight": 720,
    "confidenceThreshold": 0.25,
    "inputImageSize": 1280,
    "inferenceMs": 180.22,
    "counts": {
      "olympic": 0,
      "competitor": 22,
      "total": 22
    },
    "areas": {
      "olympic": 0,
      "competitor": 142061.61,
      "total": 142061.61
    },
    "metrics": {
      "countRatio": 0,
      "visibilityRatio": 0,
      "olympicAreaRatio": 0,
      "competitorAreaRatio": 0.1541
    },
    "detections": [],
    "overlayImageUrl": "/artifacts/overlays/visit_demo_001_overlay.jpg"
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-5.4-mini",
    "posm": {
      "detected": false,
      "confidence": 0.88,
      "evidence": "No clearly Olympic-branded POSM is visible.",
      "missingReason": "Olympic-branded signage or shelf material is not visible."
    },
    "otherPromotionalMaterial": "Competitor packaging and store shelving are visible.",
    "shelfQuality": "Products are visible, but competitor pressure is high.",
    "visibilityNotes": "Olympic visibility is weak based on YOLO detections.",
    "competitorNotes": "Competitor products dominate detected shelf presence.",
    "supervisorSummary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
    "recommendedAction": "Place Olympic POSM and improve Olympic shelf share."
  },
  "compliance": {
    "score": 0,
    "status": "critical",
    "reasons": [
      "No Olympic products were detected.",
      "Olympic visibility is below the minimum target.",
      "Competitor products dominate visible shelf space.",
      "POSM was not detected in the shelf image."
    ],
    "recommendedAction": "Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence."
  },
  "supervisorSummary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
  "warnings": []
}
```

LLM fallback behavior:

- If OpenAI is not configured, `llm` is `null` and analysis still succeeds.
- If OpenAI is configured but the request fails, the response includes a warning and uses YOLO-only compliance.

```json
{
  "llm": null,
  "warnings": [
    "LLM analysis failed; using YOLO-only compliance fallback."
  ]
}
```

### `POST /detect-yolo/upload`

Multipart upload endpoint for quick manual tests. The worker should prefer `/analyze-shelf`.

Form fields:

| Field | Required | Notes |
| --- | --- | --- |
| `file` | Yes | Image file |
| `visit_id` | No | Visit id |
| `confidence` | No | Defaults to service config |
| `image_size` | No | Defaults to service config |
| `save_overlay` | No | Defaults to true |

Response:

- Same as `POST /detect-yolo`.

## Compliance Scoring

Compliance is deterministic and lives in `ai_service/app/compliance.py`.

Initial score:

```text
100
```

Penalties:

| Condition | Penalty |
| --- | ---: |
| No shelf products detected | `-75` |
| No Olympic products detected | `-45` |
| Olympic visibility below `0.25` | `-25` |
| Olympic visibility below `0.50` | `-15` |
| Competitor count greater than Olympic count and competitor count at least `3` | `-20` |
| Any competitor product present | `-5` |
| LLM available and Olympic POSM missing | `-15` |

Status bands:

| Score | Status |
| ---: | --- |
| `80-100` | `excellent` |
| `60-79` | `acceptable` |
| `40-59` | `poor` |
| `0-39` | `critical` |

Important behavior:

- Missing POSM only affects score when the LLM actually runs.
- Score is clamped between `0` and `100`.
- `reasons` are dashboard-facing and should be shown to supervisors.

## Fraud Detection

Implemented in `worker/src/services/fraud.ts`.

Current signals:

| Signal | Severity | Logic |
| --- | --- | --- |
| `DUPLICATE_IMAGE` | `HIGH` | Same SHA-256 hash exists on another visit |
| `PERCEPTUAL_DUPLICATE_IMAGE` | `MEDIUM` or `HIGH` | dHash perceptual hash is visually close to a previous visit image |
| `GPS_MISMATCH` | `MEDIUM` or `HIGH` | Check-in location exceeds outlet threshold |
| `TIMESTAMP_ANOMALY` | `MEDIUM` or `HIGH` | Client timestamp is future-dated or synced too late |
| `EXIF_GPS_MISMATCH` | `MEDIUM` or `HIGH` | Embedded image GPS is far from check-in or outlet location |
| `EXIF_TIMESTAMP_ANOMALY` | `MEDIUM` or `HIGH` | Embedded image capture time is far from submitted visit timestamp |

Implementation notes:

- SHA-256 and perceptual hashes are stored on `VisitImage`; hash creation itself is not counted as fraud.
- Perceptual duplicate detection uses `dhash-8x8` and flags Hamming distance `<= 8`.
- Distance `<= 4` is treated as `HIGH`; distance `5-8` is treated as `MEDIUM`.

Default thresholds:

```env
FRAUD_GPS_THRESHOLD_METERS=200
FRAUD_TIMESTAMP_DELAY_HOURS=6
FRAUD_EXIF_GPS_THRESHOLD_METERS=300
FRAUD_EXIF_TIMESTAMP_DRIFT_HOURS=24
```

Not yet implemented:

- Blur score using OpenCV/Laplacian variance. This is intentionally skipped for the demo because low-end phones and small hand movement can create false positives without a more careful quality pipeline.
- Fraud severity rollup.

## Worker Contract

Queue name:

```text
analyze_visit
```

Job name:

```text
analyze_visit
```

Recommended job id:

```text
analyze-{visitId}
```

Job payload:

```json
{
  "visitId": "visit_demo_001",
  "traceId": "trace_1716310000000",
  "useLlm": true
}
```

Worker lifecycle:

```text
ANALYZE_VISIT_STARTED
  -> visit status ANALYZING
  -> load visit and first image
  -> run contextual fraud checks
  -> call POST /analyze-shelf
  -> build outcomeSummary
  -> build visit report retrievalText
  -> save fraud signals
  -> save AI result
  -> save visit report
  -> status COMPLETE or FLAGGED
  -> enqueue embed_visit_report
  -> ANALYZE_VISIT_COMPLETED
```

Failure lifecycle:

```text
ANALYZE_VISIT_FAILED
  -> visit status FAILED
  -> BullMQ retry according to job options
  -> after final retry, copy payload/error to analyze_visit_dlq
```

Embedding failure lifecycle:

```text
embed_visit_report failed
  -> BullMQ retry according to job options
  -> after final retry, copy payload/error to embed_visit_report_dlq
  -> replay via npm run worker:dlq:replay -- --queue=embedding
```

Final status logic:

| Condition | Final visit status |
| --- | --- |
| High severity fraud signal | `FLAGGED` |
| Compliance status is `critical` | `FLAGGED` |
| Otherwise | `COMPLETE` |

## Dashboard Data Contract

The worker saves `AIResultRecord.outcomeSummary` for compliance and summary fields. Fraud signals are stored in the relational `fraud_signals` table and returned separately as `visit.fraudSignals` to avoid dual writes.

Shape:

```json
{
  "visitId": "visit_demo_001",
  "outletName": "Rahim Store",
  "finalStatus": "FLAGGED",
  "complianceScore": 0,
  "complianceStatus": "critical",
  "complianceReasons": [
    "No Olympic products were detected.",
    "Olympic visibility is below the minimum target.",
    "Competitor products dominate visible shelf space.",
    "POSM was not detected in the shelf image."
  ],
  "supervisorSummary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
  "recommendedAction": "Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence.",
  "counts": {
    "olympic": 0,
    "competitor": 22,
    "total": 22
  },
  "visibilityRatio": 0,
  "posm": {
    "detected": false,
    "evidence": "No clearly Olympic-branded POSM is visible.",
    "missingReason": "Olympic-branded signage or shelf material is not visible."
  }
}
```

Recommended dashboard sections:

- Compliance score and status.
- Supervisor summary.
- Compliance reasons.
- Recommended action.
- Olympic vs competitor counts.
- POSM detected/missing badge.
- Fraud signal badges from `visit.fraudSignals`.
- Raw image and overlay image.

## Visit Report For RAG

The worker builds a `VisitReportRecord` for every analysis.

Shape:

```json
{
  "visitId": "visit_demo_001",
  "outletId": "outlet_001",
  "title": "Rahim Store visit compliance 0",
  "summary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
  "retrievalText": "Outlet: Rahim Store\nOutlet ID: outlet_001\nVisit ID: visit_demo_001\nRep ID: rep_001\nCompliance Score: 0\nCompliance Status: critical\nSupervisor Summary: No Olympic POSM visible. Competitors dominate shelf visibility.\nOlympic Products Detected: 0\nCompetitors Detected: 22\nOlympic Visibility Ratio: 0\nPOSM Detected: false\nPOSM Evidence: No clearly Olympic-branded POSM is visible.\nFraud Signals: GPS_MISMATCH: Rep check-in location is far from the outlet location.\nRecommended Action: Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence.",
  "facts": {
    "compliance": {
      "score": 0,
      "status": "critical"
    },
    "counts": {
      "olympic": 0,
      "competitor": 22,
      "total": 22
    },
    "posm": {
      "detected": false
    }
  },
  "createdAt": "2026-05-21T13:00:00.000Z"
}
```

What exists now:

- Retrieval text is generated.
- `embed_visit_report` job is enqueued after analysis.
- The worker consumes `embed_visit_report` and calls `POST /rag/index-report`.
- The AI service embeds with `text-embedding-3-small` and upserts to Pinecone.
- If Pinecone uses a 512-dimensional index, set `RETAILOS_EMBEDDING_DIMENSIONS=512`; the service can also retry once after a dimension mismatch.
- `POST /api/assistant/query` adds exact Prisma context, then asks the AI service for a GPT answer.

What remains:

- Optional pgvector mirror if we want vector search inside Postgres.
- Better natural-language intent coverage for more ad hoc supervisor questions.

## Supervisor Assistant

Frontend route:

```text
GET /supervisor/insights
```

Next.js API:

```text
POST /api/assistant/query
```

Request:

```json
{
  "question": "Which outlets are failing compliance?"
}
```

Response:

```json
{
  "answer": "Maa Enterprise and City Mart Dhanmondi are failing compliance...",
  "citations": [
    {
      "visitId": "visit_123",
      "outletName": "Maa Enterprise",
      "reason": "Exact database context"
    }
  ],
  "matches": [],
  "model": "gpt-5.4-mini",
  "embeddingModel": "text-embedding-3-small",
  "retrievalMode": "exact_and_vector",
  "warnings": [],
  "exactContextCount": 5
}
```

Flow:

```text
question
  -> auth requires SUPERVISOR or ADMIN
  -> Prisma exact context for compliance/POSM/fraud/review questions
  -> FastAPI /assistant/query
  -> Pinecone semantic matches
  -> GPT-5.4 mini grounded answer with citations
```

Backfill existing reports:

```powershell
npm run rag:index-reports -- --dry-run --limit=10
npm run rag:index-reports -- --limit=100
```

## Repository Contract

The worker uses `PrismaVisitRepository` when `DATABASE_URL` is present and keeps `JsonVisitRepository` as a local fallback. Repository implementations conform to:

```ts
getVisitForAnalysis(visitId)
updateVisitStatus(visitId, status)
updateVisitImage(image)
findImagesByHash(imageHash, excludeVisitId)
saveFraudSignals(signals)
saveAIResult(result)
saveVisitReport(report)
getVisitReport(visitId)
addEvent(event)
```

Expected real tables:

```text
users
outlets
visits
visit_images
ai_results
fraud_signals
visit_reports
event_log
```

## Next.js Integration Flow

When a rep submits a visit:

```text
POST /api/visits/:id/submit
  -> validate visit exists and has at least one image
  -> set status ANALYZING
  -> enqueue analyze_visit job with jobId analyze-{visitId}
  -> return 202 Accepted
```

Do not call YOLO, Modal, or OpenAI directly from the request path.

Suggested response:

```json
{
  "visitId": "visit_demo_001",
  "status": "ANALYZING",
  "jobId": "analyze-visit_demo_001"
}
```

Dashboard polling route:

```text
GET /api/visits/:id
```

Should include:

```json
{
  "id": "visit_demo_001",
  "status": "FLAGGED",
  "outlet": {
    "name": "Rahim Store"
  },
  "images": [
    {
      "url": "/uploads/visit_demo_001.jpg"
    }
  ],
  "aiResult": {
    "complianceScore": 0,
    "status": "critical",
    "supervisorSummary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
    "outcomeSummary": {}
  },
  "fraudSignals": [],
  "visitReport": {
    "retrievalText": "Outlet: Rahim Store..."
  }
}
```

## Test Setup

Install Node dependencies:

```powershell
npm install
```

Start local infrastructure:

```powershell
docker compose -f docker-compose.worker.yml up -d redis postgres minio minio-init
```

Start AI service:

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

Run static checks:

```powershell
npm run check:worker
$env:PYTHONUTF8='1'
python -m compileall ai_service modal_gpu
```

Run health checks:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8001/ready
```

Run worker without Redis:

```powershell
$env:WORKER_USE_LLM='true'
npm run worker:dry-run -- visit_demo_001
```

Run queued smoke test:

```powershell
npm run worker
npm run worker:enqueue-demo -- visit_demo_001
```

Run Modal-backed analysis:

```powershell
$env:RETAILOS_YOLO_BACKEND='modal'
$env:RETAILOS_MODAL_YOLO_URL='https://nfr12388--retailos-yolo-gpu-yologpuendpoint-detect.modal.run'
uvicorn ai_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

Expected acceptance criteria:

- `/ready` returns `ready`.
- `/analyze-shelf` returns YOLO counts, compliance reasons, summary, and optional POSM result.
- `worker:dry-run` prints compliance reasons and fraud signals.
- Queued job completes and saves AI result, fraud signals, visit report, and event log.
- `npm run rag:index-reports -- --dry-run --limit=3` lists reports without indexing.
- `/supervisor/insights` renders the assistant UI.
- `POST /api/assistant/query` returns an answer with citations for supervisors/admins.
- `/supervisor/ops` renders queue health, failures, and visit processing timelines.
- `/api/metrics`, `:9101/metrics`, and `:8001/metrics` expose Prometheus metrics.

## Known Production Gaps

These are intentionally not hidden.

| Gap | Current workaround |
| --- | --- |
| No cloud deployment yet | Local Docker infra and env-driven service URLs are ready |
| Edge/WAF rate-limit policy | Redis-backed app/AI rate limits are implemented; public deployments should add edge limits |
| Managed pooler provisioning | Prisma supports `DATABASE_URL` for pooled runtime traffic and `DATABASE_DIRECT_URL` for schema operations |
| Limited assistant intent parser | Exact compliance/POSM/fraud/review paths exist; broader NL questions fall back to vector retrieval |
