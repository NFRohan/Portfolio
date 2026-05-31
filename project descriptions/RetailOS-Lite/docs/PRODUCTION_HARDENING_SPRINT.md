# Production Hardening Sprint

## Sprint Goal

Turn the internship-winning demo into a safer pilot-ready system without changing the core product flow.

## Sprint Scope

| Track | Deliverables | Definition of Done |
| --- | --- | --- |
| Auth and RBAC | Optional Google OAuth for existing users, email/domain allowlist, credentials retained for local demo | `npm run build` passes; OAuth cannot create arbitrary users |
| Abuse Protection | Redis-backed rate limits on assistant, upload, visit creation, outlet search/submit, and FastAPI protected AI endpoints | 429 responses include `Retry-After`; limits are env-disableable for local debugging |
| Upload Hardening | Browser-to-MinIO/S3 pre-signed image uploads | S3 credentials never reach frontend; completion verifies object before DB insert |
| Database Pooling | Split Prisma pooled runtime URL from direct schema URL | `DATABASE_URL` can point to PgBouncer/Accelerate; `DATABASE_DIRECT_URL` remains direct |
| Queue Recovery | DLQ replay command and admin API for terminal worker failures | Dry-run by default; `--execute` requeues payloads; optional `--remove` cleans DLQ job |
| Vector Store Hygiene | Pinecone namespace cleanup command | Dry-run by default; `--execute` deletes the configured namespace |
| Documentation | Update subsystem docs and gap register | Docs describe implemented controls and remaining production work |

## Implemented In This Slice

- `lib/auth.ts` supports optional Google OAuth when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured.
- OAuth users must already exist in the `User` table and may be constrained by `AUTH_ALLOWED_EMAILS` or `AUTH_ALLOWED_EMAIL_DOMAINS`.
- `lib/rate-limit.ts` adds lightweight fixed-window request throttling for high-cost Next.js API routes.
- FastAPI now rate-limits protected inference/RAG endpoints with `AI_SERVICE_RATE_LIMIT_PER_MINUTE`.
- Rate limits use Redis so they work across horizontally scaled app/service instances.
- FastAPI requires `RETAILOS_AI_SERVICE_API_KEY` outside local/development/test environments.
- S3/MinIO mode uses pre-signed PUT URLs and `/complete` verification instead of app-server image streaming.
- Prisma supports split `DATABASE_URL` and `DATABASE_DIRECT_URL` for pooled deployments.
- `npm run worker:dlq:replay` replays `analyze_visit_dlq` and `embed_visit_report_dlq` jobs.
- `POST /api/ops/dlq/replay` exposes the same recovery path to `ADMIN` users only.
- `npm run rag:clear-namespace` clears the configured Pinecone namespace.

## Remaining Backlog

| Priority | Item | Notes |
| --- | --- | --- |
| P0 | Edge/WAF policy | App and AI limits are Redis-backed; public deployments should still add edge/WAF limits |
| P2 | Scheduled archival automation | Manual archive tooling exists; schedule it for deployed environments |
| P2 | Image thumbnails/compression | Needed before real mobile rollout |
| P2 | pgvector mirror | Optional fallback/ownership layer beside Pinecone |
| P2 | Rich fraud severity model | Current UI focuses on signal count and reasons |

## Validation

Required checks for this slice:

```powershell
npm run check:worker
npm run lint
python -m compileall -q ai_service\app
npx prisma validate
npm run build
```
