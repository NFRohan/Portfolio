# Security And RBAC

## Purpose

Security is sprint-pragmatic but real: authenticated users, server-side role checks, route protection, service-to-service API key support, and explicit known gaps.

## Authentication

```mermaid
flowchart LR
  Browser[Browser]
  Auth[Auth.js session]
  API[Next.js API route]
  RBAC[requireApiSession]
  DB[(PostgreSQL)]
  AI[FastAPI AI service]

  Browser --> Auth --> API --> RBAC
  RBAC -->|allowed| DB
  RBAC -->|forbidden| Deny[401 or 403]
  API -->|x-api-key| AI
```

Auth is implemented with Auth.js/NextAuth. Credentials auth remains enabled for local demos, and optional Google OAuth can be enabled for pilot deployments.

Seeded demo users:

```text
rep@demo.com / demo123
supervisor@demo.com / demo123
admin@demo.com / demo123
```

Optional OAuth configuration:

```env
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_ALLOWED_EMAIL_DOMAINS=example.com
AUTH_ALLOWED_EMAILS=supervisor@example.com
```

OAuth is intentionally account-registry-first:

- OAuth users must already exist in the `User` table.
- Existing `User.role` remains the source of truth for RBAC.
- Domain/email allowlists can further restrict who may sign in; a match in either list is accepted.

Session user includes:

- `id`
- `name`
- `email`
- `role`

## Roles

| Role | Purpose |
| --- | --- |
| `REP` | Create and view own visits |
| `SUPERVISOR` | View all operational data and use assistant |
| `ADMIN` | Supervisor permissions plus operational replay controls |

Role groups in `lib/rbac.ts`:

```ts
authenticated: ["REP", "SUPERVISOR", "ADMIN"]
rep: ["REP"]
supervisor: ["SUPERVISOR", "ADMIN"]
admin: ["ADMIN"]
```

## Server-Side Enforcement

Use `requireApiSession(allowedRoles)` for API routes.

Examples:

| Endpoint | Access |
| --- | --- |
| `POST /api/visits` | `REP` |
| `POST /api/visits/:id/images` | owning `REP` |
| `POST /api/visits/:id/submit` | owning `REP` |
| `GET /api/visits/:id` | owning rep or supervisor/admin |
| `GET /api/dashboard` | `SUPERVISOR`, `ADMIN` |
| `POST /api/assistant/query` | `SUPERVISOR`, `ADMIN` |
| Outlet approval/merge/reject | `SUPERVISOR`, `ADMIN` |
| `POST /api/ops/dlq/replay` | `ADMIN` |

Client-side hiding is not treated as authorization.

## AI Service Auth

FastAPI protects inference/RAG endpoints when an API key is configured:

```env
RETAILOS_AI_SERVICE_API_KEY=shared-secret
```

Client header:

```text
x-api-key: shared-secret
```

Protected endpoints:

- `POST /analyze-shelf`
- `POST /detect-yolo`
- `POST /detect-yolo/upload`
- `POST /rag/index-report`
- `POST /assistant/query`

Protected AI endpoints are also rate-limited:

```env
AI_SERVICE_RATE_LIMIT_ENABLED=true
AI_SERVICE_RATE_LIMIT_PER_MINUTE=60
```

Open endpoints:

- `GET /health`
- `GET /ready`
- `GET /model`
- `GET /metrics`
- `GET /artifacts/overlays/...`

## Data Access Rules

Rep:

- Can create visits.
- Can upload one image to own visit.
- Can submit own visit.
- Can read own visit details.

Supervisor/Admin:

- Can read dashboards and all visits.
- Can approve/reject/merge outlets.
- Can use assistant.
- Can view ops dashboard.

Admin only:

- Can dry-run or execute DLQ replay through `POST /api/ops/dlq/replay`.

## API Rate Limiting

High-cost Next.js routes use Redis-backed fixed-window rate limits:

| Route | Bucket |
| --- | --- |
| `POST /api/assistant/query` | `assistant` |
| `POST /api/visits` | `visit-create` |
| `POST /api/visits/:id/images` | `image-upload` |
| `POST /api/visits/:id/images/presign` | `image-presign` |
| `POST /api/visits/:id/images/complete` | `image-complete` |
| `POST /api/outlets/search` | `outlet-search` |
| `POST /api/outlets/submit` | `outlet-submit` |

Disable locally only when needed:

```env
API_RATE_LIMIT_ENABLED=false
RATE_LIMIT_REDIS_URL=redis://127.0.0.1:6379
RATE_LIMIT_FAIL_OPEN=false
```

## Secrets

Secrets are split:

- Root `.env` for app/worker/local runtime.
- `ai_service/.env` for AI-only secrets such as OpenAI and Pinecone.

Important secrets:

- `AUTH_SECRET`
- `NEXTAUTH_SECRET`
- `OPENAI_API_KEY`
- `PINECONE_API_KEY`
- `RETAILOS_AI_SERVICE_API_KEY`
- Twilio credentials
- S3/MinIO credentials
- Sentry DSN/token

## Known Security Gaps

| Gap | Current state | Production fix |
| --- | --- | --- |
| Credentials auth only | Optional Google OAuth exists for registered users | Use managed company IdP/OIDC and lifecycle automation |
| Rate-limit edge enforcement | Redis-backed app/AI route limits implemented | Add WAF/edge limits in front of public deployments |
| AI service public if exposed without key | Key required outside local/development/test | Keep service private and rotate keys through secret manager |
| Object upload exposure | Browser uses pre-signed MinIO/S3 uploads | Add antivirus/content moderation if needed |
| No per-outlet territory ACL | Role-level ACL only | Add rep territory/outlet assignments |
| Immutable audit export | EventLog records actor metadata for API/worker events | Stream audit logs to append-only storage if required |

## Operational Guidance

- Never deploy with default auth secrets.
- Keep AI service private or API-key protected.
- Do not expose MinIO admin console publicly.
- Rotate OpenAI/Pinecone/Twilio keys after demos if shared.
