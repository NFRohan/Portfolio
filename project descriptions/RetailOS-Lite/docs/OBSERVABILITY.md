# RetailOS Lite Observability

This is a lightweight production-shaped observability setup for the sprint demo.

It covers:

- Sentry error tracking and light tracing.
- JSON logs for web, worker, and AI service.
- Prometheus metrics for queues, worker stages, AI service, OpenAI, Pinecone, and assistant latency.
- Local LGTM stack: Grafana, Loki, Tempo, Prometheus.
- Internal supervisor control room at `/supervisor/ops`.

## Enable Local Telemetry

```powershell
$env:LOG_TO_FILE='true'
$env:LOG_DIR='logs'
$env:APP_ENV='development'
```

When `LOG_TO_FILE=true`:

- Next.js writes `logs/web.log`.
- Worker writes `logs/worker.log`.
- AI service writes `logs/ai-service.log`.

Logs are still printed to the terminal.

## Sentry

Set these in `.env`:

```env
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=retailos-lite-local
SENTRY_TRACES_SAMPLE_RATE=0.1

NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
NEXT_PUBLIC_SENTRY_RELEASE=retailos-lite-local
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.05
```

Optional source-map upload:

```env
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

Tracked stages:

```text
upload
queue
analyze_visit
fraud
yolo
report
embedding
assistant
```

## Metrics Endpoints

| Service | Endpoint |
| --- | --- |
| Next.js web/API | `http://127.0.0.1:3000/api/metrics` |
| Worker | `http://127.0.0.1:9101/metrics` |
| AI service | `http://127.0.0.1:8001/metrics` |

Worker metrics need the worker process running.

```powershell
npm run worker
```

## LGTM Stack

Start Grafana, Loki, Prometheus, Tempo, and Promtail:

```powershell
docker compose -f docker-compose.observability.yml up -d
```

Grafana:

```text
http://127.0.0.1:3005
```

Default credentials:

```text
admin / retailos
```

Provisioned dashboard:

```text
RetailOS Lite - AI Operations
```

Prometheus scrapes host services through `host.docker.internal`, so run the app, worker, and AI service on the host:

```powershell
$env:LOG_TO_FILE='true'
npm run dev
npm run worker
uvicorn ai_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

## Internal Ops Dashboard

Supervisor route:

```text
/supervisor/ops
```

Shows:

- Queue indicators.
- Worker health.
- Recent failures.
- EventLog stream.
- Processing timelines.
- Compliance/fraud/latency chips.

The timeline is reconstructed from `EventLog`, so the page still works even if Grafana is not running.

## Demo Script

1. Start Redis/Postgres/MinIO.
2. Start AI service.
3. Start worker.
4. Start Next.js.
5. Start LGTM stack.
6. Submit a rep visit.
7. Open `/supervisor/ops`.
8. Open Grafana at `http://127.0.0.1:3005`.

Talking point:

> Every visit gets a correlation ID. That ID follows upload, queueing, worker analysis, AI service calls, fraud checks, report generation, and Pinecone indexing through logs, EventLog, metrics, and Sentry.
