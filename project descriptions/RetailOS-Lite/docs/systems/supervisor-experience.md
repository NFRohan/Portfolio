# Supervisor Experience

## Purpose

The supervisor side is the operational control plane: compliance overview, visit review, outlet verification, assistant insights, and AI workflow observability.

## UI Routes

| Route | Purpose |
| --- | --- |
| `/supervisor` | Overview dashboard |
| `/supervisor/visits` | Paginated visit log |
| `/supervisor/visits/:id` | Visit inspection page |
| `/supervisor/outlets` | Outlet verification and master outlet list |
| `/supervisor/insights` | AI assistant |
| `/supervisor/ops` | Internal ops dashboard |

All supervisor routes are intended for `SUPERVISOR` or `ADMIN`.

## Overview Dashboard

```mermaid
flowchart LR
  UI[Supervisor UI]
  Dashboard[/GET /api/dashboard/]
  Visits[/GET /api/visits/]
  Detail[/GET /api/visits/:id/]
  Ops[/GET /api/ops/]
  DB[(PostgreSQL)]
  Redis[(BullMQ)]

  UI --> Dashboard --> DB
  UI --> Visits --> DB
  UI --> Detail --> DB
  UI --> Ops --> DB
  Ops --> Redis
```

API: `GET /api/dashboard?range=7d&tz=Asia/Dhaka`

The endpoint returns:

- `summary.visitsToday`
- `summary.avgComplianceScore`
- `summary.missingPosmCount`
- `summary.fraudDetectionCount`
- `summary.posmCompliancePct`
- `summary.qualityScore`
- `trend[]`
- `recentVisits[]`
- `needsAttention[]`

Implementation details:

- Uses bounded recent visit queries.
- Uses SQL daily aggregates for time-series cards.
- Clean visit rate means no fraud, POSM present, and compliance at least `70`.
- Fraud count excludes `IMAGE_HASHED`.

## Visit Logs

API: `GET /api/visits`

Supported query params:

| Param | Purpose |
| --- | --- |
| `scope=all|mine` | Supervisor all visits or own visits |
| `page` | Page number |
| `pageSize` | Page size, capped at `100` |
| `status=all|safe|flagged|review-needed|high-risk` | Risk filter |
| `q` | Outlet/rep search |
| `from`, `to` | Created-at date filters |

Performance note:

- Pagination, risk filters, and facet counts are handled in Prisma/Postgres.
- The endpoint returns list items, not full visit details.

## Visit Inspection

API: `GET /api/visits/:id`

Displays:

- Raw shelf image.
- YOLO overlay image.
- AI supervisor summary.
- Compliance score/status.
- Compliance reasons.
- Share-of-shelf metrics.
- POSM details.
- Fraud signal panel.

Risk status is derived in `lib/visits.ts` from:

- Actionable fraud signal count.
- High fraud severity.
- Compliance score.
- Missing POSM.
- Visit status.

## Outlet Verification

Route: `/supervisor/outlets`

Sections:

- Pending review queue.
- Duplicate hints.
- Master outlet list.

Actions:

- Approve new outlet.
- Reject outlet/submission.
- Merge duplicate outlet into canonical outlet.

Merge behavior is intentionally preservation-first:

- Visits move to the canonical target outlet.
- Visit reports move to target outlet.
- Report retrieval text is retargeted to canonical outlet.
- Old outlet is marked `REJECTED`, not hard-deleted.
- Old outlet names/aliases are preserved as aliases on the canonical outlet.
- Affected reports are queued for Pinecone reindexing.

## AI Insights

Route: `/supervisor/insights`

Backed by `POST /api/assistant/query`.

Use cases:

- "Which outlets are failing compliance?"
- "Which outlets have fraud signals?"
- "Which visits are missing POSM?"
- "Summarize recurring visibility problems."

The assistant uses exact database context first for operational lists and vector retrieval for semantic context.

## Ops Dashboard

Route: `/supervisor/ops`

Backed by `GET /api/ops`.

Shows:

- Queue health.
- Worker health.
- Failed jobs.
- Recent operational events.
- Collapsible processing timelines.
- Workflow average latency chip, computed from visit timeline duration.
- Per-stage latency chips, computed from EventLog latency samples.
- Assistant query count.

This page is designed for demo storytelling: it makes the async AI workflow visible without requiring Grafana.

## Known Gaps

- Supervisor settings page is intentionally not implemented.
- Dashboard time-series are one-day aggregates in Postgres, not a separate OLAP store.
- Fraud severity rollup is not shown as a separate model; UI focuses on count and reason display.
