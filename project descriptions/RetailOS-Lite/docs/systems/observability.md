# Observability

## Purpose

Observability demonstrates that the team understands operational AI systems: async workflow state, queue health, failure visibility, latency, and traceable visit processing.

## Layers

```mermaid
flowchart TB
  Web[Next.js]
  Worker[Worker]
  AI[FastAPI AI]
  EventLog[(EventLog)]
  Logs[(JSON log files)]
  Metrics[Prometheus metrics]
  Sentry[Sentry]
  Grafana[Grafana LGTM]
  Ops[/supervisor/ops]

  Web --> EventLog
  Worker --> EventLog
  AI --> Logs
  Web --> Logs
  Worker --> Logs
  Web --> Metrics
  Worker --> Metrics
  AI --> Metrics
  Web --> Sentry
  Worker --> Sentry
  AI --> Sentry
  EventLog --> Ops
  Logs --> Grafana
  Metrics --> Grafana
```

| Layer | Purpose |
| --- | --- |
| `EventLog` | Product-native audit timeline |
| `/supervisor/ops` | Internal control room for demos and debugging |
| Structured logs | JSON logs from web, worker, AI service |
| Metrics | Prometheus counters/histograms |
| Sentry | Error tracking and light tracing |
| LGTM | Grafana, Loki, Tempo, Prometheus |

## Correlation IDs

Correlation IDs are propagated through:

- Next.js request headers.
- Queue jobs.
- Worker logs/events.
- AI service calls.
- Assistant requests.

Common fields:

- `correlationId`
- `traceId`
- `visitId`
- `jobId`
- `outletId`
- `stage`
- `latencyMs`
- `status`

## EventLog

EventLog is the source for internal timelines.

Important events:

| Event | Meaning |
| --- | --- |
| `UPLOAD_STORED` | Image persisted |
| `VISIT_SUBMITTED` | Rep submitted visit |
| `ANALYZE_VISIT_QUEUED` | BullMQ job enqueued |
| `ANALYZE_VISIT_STARTED` | Worker began processing |
| `FRAUD_CHECKS_COMPLETED` | Fraud checks completed |
| `VISIT_REPORT_GENERATED` | RAG report persisted |
| `ANALYZE_VISIT_COMPLETED` | Visit analysis complete |
| `ANALYZE_VISIT_FAILED` | Worker failed |
| `VISIT_REPORT_INDEXED` | Pinecone indexing complete |
| `ASSISTANT_QUERY_COMPLETED` | Assistant answered |
| `OUTLET_MERGED` | Outlet merge performed |

## Ops Dashboard

Route: `/supervisor/ops`

API: `GET /api/ops`

Shows:

- worker health
- queue depth
- failed jobs
- assistant query count
- workflow average latency chip
- per-stage latency chips
- recent failures
- collapsible processing timelines

The headline latency chip uses end-to-end visit timeline duration. Per-stage chips use EventLog latency samples, so workflow time and stage time are intentionally shown separately.

The page works without Grafana because it uses `EventLog` and BullMQ directly.

## Metrics Endpoints

| Service | Endpoint |
| --- | --- |
| Next.js | `/api/metrics` |
| Worker | `:9101/metrics` |
| AI service | `:8001/metrics` |

Tracked categories:

- stage latency
- job failures
- queue depth
- retry count
- YOLO latency
- OpenAI latency
- Pinecone latency
- assistant latency
- fraud signal counts
- protected endpoint rate-limit events

## Logs

When `LOG_TO_FILE=true`:

| Service | File |
| --- | --- |
| Web | `logs/web.log` |
| Worker | `logs/worker.log` |
| AI service | `logs/ai-service.log` |

Promtail ships these logs to Loki in the demo stack.

## LGTM Stack

Demo compose includes:

- Grafana: `http://127.0.0.1:3005`
- Prometheus: `http://127.0.0.1:9090`
- Loki: `http://127.0.0.1:3100`
- Tempo: `http://127.0.0.1:3200`

Grafana credentials:

```text
admin / retailos
```

Provisioned dashboard:

```text
RetailOS Lite - AI Operations
```

## Sentry

Integrated in:

- Next.js app/API.
- Worker.
- AI service.

Configured through:

```env
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=retailos-lite-local
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_DSN=
```

Session replay and aggressive profiling are intentionally disabled.

## Production Notes

- EventLog is useful for product timelines, not a replacement for centralized logs.
- Tempo tracing is lightweight; the project avoids enterprise OTEL complexity.
- The ops page should remain bounded and polling-aware to avoid becoming the source of load.
- Sentry sampling should stay low for sprint/demo traffic.
