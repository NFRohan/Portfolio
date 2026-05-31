# Backend Handoff: AI Service + Worker

This backend slice is ready for the Next.js teammate to integrate against.

For the complete implemented API/data contract, see [IMPLEMENTED_SYSTEM_REFERENCE.md](IMPLEMENTED_SYSTEM_REFERENCE.md).

For remaining work, deliverables, DoD, and test setup, see [REMAINING_SPRINT_PLAN.md](REMAINING_SPRINT_PLAN.md).

## What Is Stable

### AI Service

Start:

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --host 127.0.0.1 --port 8001
```

Operational endpoints:

```text
GET  /health
GET  /ready
GET  /model
POST /analyze-shelf
POST /detect-yolo
POST /detect-yolo/upload
```

Use `/ready` for deployment health checks. It returns `503` if the local model is missing or Modal is selected without a Modal URL.

### Worker

Start Redis:

```powershell
docker compose -f docker-compose.worker.yml up -d redis
```

Start worker:

```powershell
npm run worker
```

Enqueue a demo job:

```powershell
npm run worker:enqueue-demo -- visit_demo_001
```

Queue name:

```text
analyze_visit
```

Job payload:

```json
{
  "visitId": "visit_123",
  "traceId": "trace_abc",
  "useLlm": true
}
```

Recommended job id:

```text
analyze-{visitId}
```

This makes duplicate submit clicks idempotent at the queue level.

## Next.js Integration Contract

When a rep submits a visit:

```text
POST /api/visits/:id/submit
  -> set visit status ANALYZING
  -> enqueue analyze_visit job
  -> return immediately
```

Do not call YOLO/OpenAI directly from the request path.

## Data The Dashboard Should Render

The worker produces an `outcomeSummary` on the AI result and completion event.

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
  "supervisorSummary": "No Olympic POSM visible. Competitors dominate front-counter shelf.",
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
  },
  "fraudSignals": []
}
```

Recommended dashboard cards:

- Compliance score and status
- Supervisor summary
- Compliance reasons
- Recommended action
- Olympic vs competitor counts
- POSM detected/missing badge
- Fraud signal badges
- Raw image and overlay image

## Persistence Mapping

Current implementation writes to `worker/data/db.json` through `JsonVisitRepository`.

Swap this for a Prisma repository with the same methods:

```ts
getVisitForAnalysis(visitId)
updateVisitStatus(visitId, status)
updateVisitImage(image)
findImagesByHash(imageHash, excludeVisitId)
saveFraudSignals(signals)
saveAIResult(result)
saveVisitReport(report)
addEvent(event)
```

The frontend should read from real tables once Prisma lands:

```text
visits
visit_images
ai_results
fraud_signals
visit_reports
event_log
```

## Production Readiness Checks

Run before handing off:

```powershell
npm run check:worker
$env:PYTHONUTF8='1'; python -m compileall ai_service modal_gpu
```

Run AI service checks:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8001/ready
```

Run worker dry-run:

```powershell
$env:WORKER_USE_LLM='true'
npm run worker:dry-run -- visit_demo_001
```

Run queued smoke:

```powershell
docker compose -f docker-compose.worker.yml up -d redis
npm run worker
npm run worker:enqueue-demo -- visit_demo_001
```

## Environment

Copy `.env.example` to `.env` and fill:

```env
OPENAI_API_KEY=
RETAILOS_YOLO_BACKEND=local
RETAILOS_MODAL_YOLO_URL=
REDIS_URL=redis://127.0.0.1:6379
AI_SERVICE_URL=http://127.0.0.1:8001
```

For Modal GPU:

```env
RETAILOS_YOLO_BACKEND=modal
RETAILOS_MODAL_YOLO_URL=https://nfr12388--retailos-yolo-gpu-yologpuendpoint-detect.modal.run
RETAILOS_YOLO_FALLBACK_LOCAL=true
```

## What Is Not Part Of This Slice

- Next.js routes
- Auth
- Prisma repository implementation
- File/object storage upload UI
- Dashboard rendering
- RAG assistant UI
- LGTM dashboard wiring

Those can be implemented against the contracts above.
