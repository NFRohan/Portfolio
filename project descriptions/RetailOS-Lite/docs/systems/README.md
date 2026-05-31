# RetailOS Lite System Documentation

This directory is the subsystem-level handoff pack for RetailOS Lite. It is intended for senior engineers reviewing architecture, boundaries, operational behavior, and demo readiness.

For the live assessment script, use the [Showcase Demo Runbook](../SHOWCASE_DEMO_RUNBOOK.md).
For post-demo hardening scope, use the [Production Hardening Sprint](../PRODUCTION_HARDENING_SPRINT.md).

## Reading Order

| Doc | Scope |
| --- | --- |
| [System Map](./system-map.md) | End-to-end architecture, services, data ownership |
| [Rep Visit Workflow](./rep-visit-workflow.md) | Field rep check-in, image upload, offline sync, submit lifecycle |
| [Supervisor Experience](./supervisor-experience.md) | Dashboard, visit logs, inspection, outlet verification, ops page |
| [API And Data Model](./api-and-data-model.md) | Route contracts, tables, status semantics |
| [Outlet Master Data](./outlet-master-data.md) | Outlet creation, matching, duplicate detection, approval, merge |
| [Image ML And Compliance](./image-ml-and-compliance.md) | YOLO, OpenAI POSM analysis, scoring, AI service contracts |
| [Worker And Queues](./worker-and-queues.md) | BullMQ jobs, retries, DLQ, report indexing |
| [Fraud Detection](./fraud-detection.md) | Duplicate image, perceptual hash, GPS, timestamp, EXIF signals |
| [Chatbot And RAG](./chatbot-rag.md) | Exact database context, Pinecone retrieval, answer generation |
| [WhatsApp Alerts](./whatsapp-alerts.md) | Fraud and new-outlet supervisor alerting |
| [Observability](./observability.md) | EventLog, Sentry, LGTM, metrics, ops dashboard |
| [Security And RBAC](./security-and-rbac.md) | Auth.js, route authorization, AI service auth, security gaps |
| [Storage And Offline Sync](./storage-and-offline-sync.md) | Local/S3 image storage, IndexedDB offline queue |
| [Deployment And Operations](./deployment-and-operations.md) | Docker demo topology, env, seeding, operational runbook |

## Current Production Shape

RetailOS Lite is a local-first demo system with production-shaped boundaries:

- Next.js owns product UI, auth, API routes, and dashboard queries.
- PostgreSQL/Prisma owns operational state.
- Redis/BullMQ owns async work.
- Node worker owns analysis orchestration, fraud checks, persistence, alerts, and report indexing.
- FastAPI owns AI inference, POSM analysis, compliance scoring, embeddings, and assistant generation.
- Pinecone owns vector memory.
- LGTM/Sentry/EventLog expose operational visibility.

The project is optimized for a 72-hour sprint assessment, so several systems are intentionally pragmatic rather than enterprise-complete. Those tradeoffs are called out in each subsystem doc.
