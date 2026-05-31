# Worker And Queues

## Purpose

The worker decouples rep submission from expensive AI and fraud processing. Request handlers enqueue work and return quickly; the worker owns analysis, persistence, alerts, and report indexing.

## Queues

| Queue | Job | Purpose |
| --- | --- | --- |
| `analyze_visit` | `analyze_visit` | Full visit analysis lifecycle |
| `embed_visit_report` | `embed_visit_report` | Embed and upsert visit report to Pinecone |
| `analyze_visit_dlq` | `analyze_visit_failed` | Dead-letter copy after terminal analyze failure |
| `embed_visit_report_dlq` | `embed_visit_report_failed` | Dead-letter copy after terminal embedding failure |

Queue names are env-configurable:

```env
ANALYZE_VISIT_QUEUE=analyze_visit
EMBED_VISIT_REPORT_QUEUE=embed_visit_report
ANALYZE_VISIT_DLQ=analyze_visit_dlq
EMBED_VISIT_REPORT_DLQ=embed_visit_report_dlq
```

## Enqueue Points

| Enqueue | Code | Trigger |
| --- | --- | --- |
| `enqueueAnalyzeVisit` | `lib/queue.ts` | `POST /api/visits/:id/submit` |
| `enqueueVisitReportIndex` | `lib/queue.ts` | Outlet merge report retargeting |
| worker internal `embedQueue.add` | `worker/src/queue.ts` | Successful visit analysis |

## Analyze Job Payload

```json
{
  "visitId": "visit_123",
  "traceId": "visit_...",
  "useLlm": true
}
```

Job id:

```text
analyze-{visitId}
```

Retry policy:

- `attempts: 3`
- exponential backoff, `2000ms`
- terminal failures copied to DLQ.

## Analyze Lifecycle

Code: `worker/src/jobs/analyzeVisit.ts`

```mermaid
sequenceDiagram
  participant Queue as BullMQ analyze_visit
  participant Worker as Node Worker
  participant DB as PostgreSQL
  participant AI as FastAPI AI Service
  participant Embed as BullMQ embed_visit_report
  participant DLQ as analyze_visit_dlq

  Queue->>Worker: analyze_visit job
  Worker->>DB: EventLog ANALYZE_VISIT_STARTED and Visit(ANALYZING)
  Worker->>DB: load visit, outlet, image
  Worker->>Worker: fraud checks
  Worker->>AI: POST /analyze-shelf
  AI-->>Worker: YOLO, POSM, compliance
  Worker->>DB: save FraudSignal, AIResult, VisitReport
  Worker->>DB: Visit(COMPLETE or FLAGGED)
  Worker->>Embed: enqueue embed_visit_report
  Worker->>DB: EventLog ANALYZE_VISIT_COMPLETED
  Worker-->>DLQ: copy payload after terminal failure
```

```text
ANALYZE_VISIT_STARTED
  -> Visit(ANALYZING)
  -> load visit, outlet, rep, first image
  -> run fraud checks
  -> FRAUD_CHECKS_COMPLETED
  -> call AI service /analyze-shelf
  -> build AIResult
  -> build outcomeSummary
  -> build VisitReport
  -> save fraud signals
  -> save AI result
  -> save visit report
  -> Visit(COMPLETE or FLAGGED)
  -> VISIT_REPORT_GENERATED
  -> enqueue embed_visit_report
  -> ANALYZE_VISIT_COMPLETED
  -> optional WhatsApp fraud alert
```

Final visit status:

| Condition | Status |
| --- | --- |
| High severity fraud | `FLAGGED` |
| Compliance status `critical` | `FLAGGED` |
| Otherwise | `COMPLETE` |

## Embedding Lifecycle

Code: `worker/src/queue.ts`

```text
embed_visit_report
  -> repository.getVisitReport(visitId)
  -> AI service POST /rag/index-report
  -> Pinecone upsert vector id visit-report:{visitId}
  -> EventLog VISIT_REPORT_INDEXED
  -> optional embed_visit_report_dlq after terminal failure
```

This same queue is used after outlet merge so stale Pinecone metadata is overwritten.

## Dead-Letter Queue

When an `analyze_visit` or `embed_visit_report` job fails its final attempt, the worker adds a copy to the matching DLQ with:

- original job id/name
- attempts made
- failed reason
- stacktrace
- original payload
- timestamp

Purpose:

- Preserve payload for debugging.
- Allow replay without making the rep revisit the store.
- Avoid making the rep revisit the store for a transient bug.

Replay command:

```powershell
npm run worker:dlq:replay -- --limit=10
npm run worker:dlq:replay -- --execute --remove --visit-id=visit_123
npm run worker:dlq:replay -- --queue=embedding --limit=10
npm run worker:dlq:replay -- --queue=embedding --execute --remove --visit-id=visit_123
```

The command is dry-run by default. `--queue=analyze` requeues into `analyze_visit`; `--queue=embedding` requeues into `embed_visit_report`; `--remove` deletes the DLQ copy after successful enqueue.

Admin API:

```http
POST /api/ops/dlq/replay
```

Request:

```json
{
  "queue": "embedding",
  "visitId": "visit_123",
  "execute": false,
  "remove": false
}
```

The endpoint requires `ADMIN`. Without `execute: true`, it records a dry-run event and returns the matching DLQ payloads without requeueing.

## Repository Boundary

Worker repository interface:

```ts
getVisitForAnalysis(visitId)
updateVisitStatus(visitId, status)
updateVisitImage(image)
findImagesByHash(imageHash, excludeVisitId)
findImagesWithPerceptualHash(excludeVisitId)
saveFraudSignals(signals)
saveAIResult(result)
saveVisitReport(report)
getVisitReport(visitId)
addEvent(event)
hasVisitEvent(visitId, event)
```

Implementations:

- `PrismaVisitRepository` for the real database.
- `JsonVisitRepository` as local fallback/dev fixture path.

## Operational Signals

Worker emits:

- structured JSON logs
- Sentry exceptions
- Prometheus metrics
- EventLog records
- queue metrics

Important metadata:

- `visitId`
- `jobId`
- `traceId`
- `stage`
- `latencyMs`
- `status`

## Known Gaps

- Queue cleanup uses bounded `removeOnComplete`/`removeOnFail` plus manual archive tooling, not automated retention policies.
- Report indexing failures do not block visit completion; they surface in ops/failures and can be replayed from `embed_visit_report_dlq`.
