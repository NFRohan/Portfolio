# Deployment And Operations

## Purpose

This project is currently optimized for a local Docker demo while keeping cloud migration straightforward.

## Demo Compose

```mermaid
flowchart TB
  Web[web: Next.js]
  Worker[worker: BullMQ]
  AI[ai-service: FastAPI]
  Postgres[(postgres)]
  Redis[(redis)]
  Minio[(minio)]
  Grafana[Grafana]
  Prom[Prometheus]
  Loki[Loki]
  Tempo[Tempo]
  Promtail[Promtail]

  Web --> Postgres
  Web --> Redis
  Web --> Minio
  Worker --> Postgres
  Worker --> Redis
  Worker --> AI
  AI --> Minio
  Prom --> Web
  Prom --> Worker
  Prom --> AI
  Promtail --> Loki
  Grafana --> Prom
  Grafana --> Loki
  Grafana --> Tempo
```

Main command:

```powershell
npm run demo:up
```

Compose file:

```text
docker-compose.demo.yml
```

Services:

| Service | Purpose | Host port |
| --- | --- | --- |
| `web` | Next.js app | `3000` |
| `worker` | BullMQ worker and metrics | `9101` |
| `ai-service` | FastAPI AI service | `8001` |
| `postgres` | Database | internal only |
| `redis` | Queues | internal only |
| `minio` | Object storage | `19000`, `19001` |
| `grafana` | Dashboards | `3005` |
| `prometheus` | Metrics | `9090` |
| `loki` | Logs | `3100` |
| `tempo` | Traces | `3200`, `4317`, `4318` |
| `promtail` | Log shipper | internal |

## Useful URLs

```text
App:        http://127.0.0.1:3000
AI:         http://127.0.0.1:8001/ready
Worker:     http://127.0.0.1:9101/metrics
Grafana:    http://127.0.0.1:3005
Prometheus: http://127.0.0.1:9090
MinIO:      http://127.0.0.1:19001
```

Grafana:

```text
admin / retailos
```

MinIO:

```text
retailos / retailos-secret
```

## Build Commands

```powershell
npm run build
npm run check:worker
npm run demo:build
npm run demo:up
npm run demo:down
npm run demo:logs
```

## Database

The demo Postgres is internal to Docker:

```text
postgresql://retailos:retailos@postgres:5432/retailos
```

Host `.env` may point to `127.0.0.1:5433`, but demo compose does not publish Postgres by default. Use `docker compose exec postgres ...` for direct maintenance.

Apply Prisma schema in compose:

```powershell
docker compose -f docker-compose.demo.yml run --rm app-init npm run db:push
```

Manual SQL:

```powershell
docker compose -f docker-compose.demo.yml exec -T postgres psql -U retailos -d retailos
```

## Demo Reset

Wipe operational Postgres state while keeping demo users:

```sql
TRUNCATE TABLE
  "EventLog",
  "OutletSubmission",
  "OutletAlias",
  "Visit",
  "Outlet"
RESTART IDENTITY CASCADE;
```

Wipe Pinecone namespace:

```powershell
npm run rag:clear-namespace
npm run rag:clear-namespace -- --execute
```

Reindex reports after seeding:

```powershell
docker compose -f docker-compose.demo.yml exec worker npm run rag:index-reports -- --limit=100
```

## Cloud Migration Shape

| Local | Cloud replacement |
| --- | --- |
| Docker web | Vercel/Fly/Render app |
| Docker worker | Render/Fly/Railway worker |
| Docker Postgres | Managed Postgres with pooling |
| Docker Redis | Upstash/Redis Cloud |
| MinIO | Cloudflare R2, S3, Supabase Storage |
| Local AI service | Render/Fly/FastAPI service |
| Local YOLO | Modal GPU or hosted inference |
| LGTM compose | Grafana Cloud or managed observability |

## Production Hardening Checklist

- Require AI service API key outside local.
- Point `DATABASE_URL` at PgBouncer or Prisma Accelerate; keep `DATABASE_DIRECT_URL` pointed at direct Postgres for schema operations.
- Switch image uploads to pre-signed URLs.
- Publish Postgres only through private networking.
- Move local fixed-window rate limits to Redis/WAF-backed distributed rate limits.
- Schedule `npm run ops:archive -- --execute --delete` for retention once deployed.
- Add backup/restore story for Postgres and object storage.
- Add CI checks for build, worker types, and Python compile/tests.
