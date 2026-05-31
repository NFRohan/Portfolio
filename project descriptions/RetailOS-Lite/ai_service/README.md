# RetailOS Lite AI Service

FastAPI service for YOLO shelf detection, OpenAI POSM analysis, and RAG assistant retrieval.

## Run A Local Smoke Test

```powershell
$env:PYTHONUTF8='1'
python ai_service/scripts/test_inference.py
```

## Start The API

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --port 8001
```

## JSON Inference

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8001/detect-yolo `
  -ContentType 'application/json' `
  -Body (@{
    visitId = 'demo_visit'
    imagePath = 'E:\Projects\RetailOS-Lite\Detection Model\yolo_dataset\images\val\olympic_poc_image_94.jpg'
    confidence = 0.25
    saveOverlay = $true
  } | ConvertTo-Json)
```

## Upload Inference

```powershell
curl.exe -X POST http://localhost:8001/detect-yolo/upload `
  -F "visit_id=demo_visit" `
  -F "file=@Detection Model/yolo_dataset/images/val/olympic_poc_image_94.jpg"
```

The response includes normalized detections, class counts, visibility ratios, model metadata, and an optional overlay URL under `/artifacts/overlays/...`.

## Shelf Analysis

Use this endpoint from the worker because it returns YOLO detections plus compliance, optional LLM/POSM analysis, and a supervisor summary.

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8001/analyze-shelf `
  -ContentType 'application/json' `
  -Body (@{
    visitId = 'demo_visit'
    imagePath = 'E:\Projects\RetailOS-Lite\Detection Model\yolo_dataset\images\val\olympic_poc_image_94.jpg'
    confidence = 0.25
    saveOverlay = $true
    useLlm = $true
    outletName = 'Rahim Store'
    repNotes = 'Shelf near front counter.'
  } | ConvertTo-Json)
```

Use `/detect-yolo` when you only need raw model output for debugging.

## API Key Protection

Local dev works without a key. To protect inference endpoints, set:

```powershell
$env:RETAILOS_AI_SERVICE_API_KEY='shared-dev-secret'
```

Then callers must send:

```text
x-api-key: shared-dev-secret
```

Protected endpoints:

- `POST /analyze-shelf`
- `POST /detect-yolo`
- `POST /detect-yolo/upload`
- `POST /rag/index-report`
- `POST /assistant/query`

Health, readiness, model metadata, and overlay artifacts remain open for smoke tests and dashboard rendering.

## LLM POSM Analysis

Set `OPENAI_API_KEY` to enable LLM-based POSM and shelf-quality analysis.

```powershell
$env:OPENAI_API_KEY='sk-...'
$env:RETAILOS_LLM_MODEL='gpt-5.4-mini'
```

The service also auto-loads secrets from either `.env` or `ai_service/.env`.

When enabled, `/analyze-shelf` adds:

- `llm.posm.detected`
- `llm.posm.confidence`
- `llm.posm.evidence`
- `llm.otherPromotionalMaterial`
- `llm.shelfQuality`
- `llm.visibilityNotes`
- `llm.competitorNotes`
- `llm.supervisorSummary`
- `llm.recommendedAction`

If the key is missing, `llm` is `null` and the service falls back to YOLO-only compliance and deterministic summaries.

## RAG Assistant

Set OpenAI and Pinecone env vars in `ai_service/.env`:

```powershell
$env:RETAILOS_CHAT_MODEL='gpt-5.4-mini'
$env:RETAILOS_EMBEDDING_MODEL='text-embedding-3-small'
$env:RETAILOS_EMBEDDING_DIMENSIONS='512'
$env:PINECONE_API_KEY='...'
$env:PINECONE_INDEX='retailos'
$env:PINECONE_HOST='https://your-index-host.svc...pinecone.io'
$env:PINECONE_NAMESPACE='retailos-visit-reports'
```

Index a report:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8001/rag/index-report `
  -Headers @{ 'x-api-key' = 'shared-dev-secret' } `
  -ContentType 'application/json' `
  -Body (@{
    visitId = 'visit_demo_001'
    outletId = 'outlet_rahim_store'
    title = 'Rahim Store visit compliance 42'
    summary = 'POSM missing and competitor pressure is high.'
    retrievalText = 'Outlet: Rahim Store...'
    facts = @{}
    createdAt = '2026-05-23T00:00:00.000Z'
  } | ConvertTo-Json -Depth 6)
```

Ask a question through Next.js `POST /api/assistant/query`; the Next route adds exact Postgres context before proxying to the AI service.

If your Pinecone index was created with a non-default dimension, set `RETAILOS_EMBEDDING_DIMENSIONS` to match it. The service also retries once when Pinecone reports a dimension mismatch.

## Readiness

Use `/ready` for deployment checks:

```powershell
Invoke-RestMethod http://localhost:8001/ready
```

It returns `503` when the selected YOLO backend is misconfigured.

## Observability

The AI service emits structured JSON logs, Sentry errors, and Prometheus metrics for YOLO, OpenAI, Pinecone, and assistant stages.

Metrics:

```text
http://127.0.0.1:8001/metrics
```

Enable local Loki ingestion through Promtail:

```powershell
$env:LOG_TO_FILE='true'
uvicorn ai_service.app.main:app --reload --port 8001
```

Sentry:

```powershell
$env:SENTRY_DSN='https://...'
$env:SENTRY_TRACES_SAMPLE_RATE='0.1'
```

See [docs/OBSERVABILITY.md](../docs/OBSERVABILITY.md) for the full LGTM setup.
