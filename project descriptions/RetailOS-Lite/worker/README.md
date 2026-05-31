# RetailOS Worker

BullMQ worker for async visit analysis.

## What It Does

```text
analyze_visit job
  -> load visit/images
  -> contextual fraud checks
  -> compute SHA-256 + perceptual hashes for duplicate detection
  -> EXIF GPS/time checks when image metadata exists
  -> call FastAPI /analyze-shelf
  -> save AIResult
  -> save FraudSignal rows
  -> build VisitReport retrieval text
  -> enqueue and process embed_visit_report for Pinecone indexing
  -> mark visit COMPLETE or FLAGGED
  -> copy terminal failures to analyze_visit_dlq
  -> copy terminal embedding failures to embed_visit_report_dlq
  -> write EventLog entries
```

The worker uses Prisma/Postgres when `DATABASE_URL` is present and `WORKER_USE_PRISMA` is not `false`. It falls back to `worker/data/db.json` for local pipeline tests.

## Install

```powershell
npm install
```

## Start AI Service

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --port 8001
```

## Dry Run Without Redis

```powershell
$env:WORKER_USE_LLM='false'
npm run worker:dry-run -- visit_demo_001
```

Use `WORKER_USE_LLM=true` when `OPENAI_API_KEY` is configured and you want POSM analysis.

The dry-run prints the supervisor-facing outcome:

```text
Compliance: 0 (critical)
Supervisor summary: Add Olympic POSM at eye level...
Compliance reasons:
- No Olympic products were detected.
- Competitor products dominate visible shelf space.
- POSM was not detected in the shelf image.
Fraud signals:
- MEDIUM EXIF_GPS_MISMATCH: Image EXIF GPS location does not match the submitted visit location.
- MEDIUM PERCEPTUAL_DUPLICATE_IMAGE: Image is visually similar to a previous visit image.
```

## Run With BullMQ

Start Redis, then:

```powershell
docker compose -f docker-compose.worker.yml up -d redis postgres
```

Run the worker and enqueue a demo job:

```powershell
npm run worker
npm run worker:enqueue-demo -- visit_demo_001
```

Relevant env vars:

```env
AI_SERVICE_URL=http://127.0.0.1:8001
RETAILOS_AI_SERVICE_API_KEY=
REDIS_URL=redis://127.0.0.1:6379
ANALYZE_VISIT_QUEUE=analyze_visit
ANALYZE_VISIT_DLQ=analyze_visit_dlq
EMBED_VISIT_REPORT_QUEUE=embed_visit_report
EMBED_VISIT_REPORT_DLQ=embed_visit_report_dlq
WORKER_USE_LLM=true
WORKER_METRICS_PORT=9101
LOG_TO_FILE=false
SENTRY_DSN=
```

`RETAILOS_AI_SERVICE_API_KEY` is optional for local dev. When set on the FastAPI service, the worker sends it as `x-api-key` for `/analyze-shelf`.

Terminal failed `analyze_visit` and `embed_visit_report` jobs are copied into their DLQs with the original payload, attempts, failure reason, and stacktrace so the job can be inspected and replayed.

## RAG Indexing

The worker has a second BullMQ consumer for `EMBED_VISIT_REPORT_QUEUE`. After analysis, it loads the saved `VisitReport`, calls the AI service `POST /rag/index-report`, and writes `VISIT_REPORT_INDEXED` to the event log.

Backfill existing reports:

```powershell
npm run rag:index-reports -- --dry-run --limit=10
npm run rag:index-reports -- --limit=100
```

The backfill uses Postgres when `DATABASE_URL` is present and falls back to `worker/data/db.json` for local demos.

Replay failed indexing jobs:

```powershell
npm run worker:dlq:replay -- --queue=embedding --limit=10
npm run worker:dlq:replay -- --queue=embedding --execute --remove --visit-id=visit_123
```

## Observability

The worker emits structured JSON logs, Sentry errors, and Prometheus metrics.

Metrics:

```text
http://127.0.0.1:9101/metrics
```

Enable local Loki ingestion through Promtail:

```powershell
$env:LOG_TO_FILE='true'
npm run worker
```

Then start:

```powershell
docker compose -f docker-compose.observability.yml up -d
```

See [docs/BACKEND_HANDOFF.md](../docs/BACKEND_HANDOFF.md) for the Next.js integration contract and dashboard fields.
