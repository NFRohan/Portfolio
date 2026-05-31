# Docker Demo Runbook

Use this path for the live demo to avoid host Postgres/Redis port conflicts.

## Start

Build images once:

```powershell
npm run demo:build
```

Then start the stack:

```powershell
npm run demo:up
```

The first AI service build is still the slowest step because it installs the CPU
vision stack. Later runs should reuse Docker cache unless dependencies change.
`demo:up` intentionally does not rebuild; this keeps demo restarts fast.
`demo:build` builds services sequentially and disables Compose Bake to avoid
Docker Desktop export stalls on Windows.

Detached mode:

```powershell
npm run demo:up:detached
npm run demo:logs
```

## URLs

- RetailOS: http://localhost:3000
- AI service: http://localhost:8001/ready
- Worker metrics: http://localhost:9101/metrics
- Grafana: http://localhost:3005
- Prometheus: http://localhost:9090
- MinIO console: http://localhost:19001

Grafana login:

- User: `admin`
- Password: `retailos`

RetailOS demo users:

- Rep: `rep@demo.com` / `demo123`
- Supervisor: `supervisor@demo.com` / `demo123`
- Admin: `admin@demo.com` / `demo123`

## Why This Avoids Port Hiccups

Postgres and Redis are internal-only in `docker-compose.demo.yml`.

- Web uses `postgres:5432` and `redis:6379` inside Docker.
- Worker uses the same internal service names.
- AI service reads the shared upload volume and mounted YOLO model.

Only demo-facing ports are exposed to the host.

If a demo-facing port is busy, override it:

```powershell
$env:WEB_PORT=3001
$env:AI_SERVICE_PORT=18001
$env:GRAFANA_PORT=13005
npm run demo:up
```

## Stop

```powershell
npm run demo:down
```

To wipe demo data:

```powershell
docker compose -f docker-compose.demo.yml down -v
```

## Notes

- `app-init` runs `prisma db push` and `prisma db seed` before web/worker start.
- Web and worker share the same slim production Node image; app-init uses a separate tools image for Prisma.
- The YOLO model is mounted from `Detection Model/best.pt`.
- OpenAI, Pinecone, Sentry, and Twilio secrets are read from local `.env` / `ai_service/.env`.
- Uploaded images are stored in a shared Docker volume so web, worker, and AI service see the same local paths.
