# RetailOS Lite Showcase Demo Runbook

Target live demo time: 35 minutes.

Goal: show a production-shaped AI retail workflow, not a pile of features. The story is:

```text
fast rep execution
  -> async AI analysis
  -> explainable supervisor decisions
  -> governed outlet data
  -> operational visibility
  -> AI assistant over historical reports
```

## One-Sentence Positioning

RetailOS Lite is an AI-native retail execution system where field reps submit shelf evidence, async workers run YOLO/OpenAI/fraud analysis, and supervisors get explainable compliance intelligence with RAG, WhatsApp alerts, and observability.

## Pre-Demo Checklist

Do this before the call.

```powershell
git status --short
npm run build
npm run check:worker
npm run demo:build
npm run demo:up:detached
```

Health checks:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/login
Invoke-RestMethod http://127.0.0.1:8001/ready
Invoke-RestMethod http://127.0.0.1:9101/metrics
```

Keep logs ready in a terminal:

```powershell
npm run demo:logs
```

Open these tabs in order:

| Tab | URL |
| --- | --- |
| Rep app | `http://127.0.0.1:3000/login` |
| Supervisor app | `http://127.0.0.1:3000/supervisor` |
| Ops dashboard | `http://127.0.0.1:3000/supervisor/ops` |
| AI service ready | `http://127.0.0.1:8001/ready` |
| Grafana | `http://127.0.0.1:3005` |
| MinIO | `http://127.0.0.1:19001` |

Credentials:

| Account | Login |
| --- | --- |
| Rep | `rep@demo.com` / `demo123` |
| Supervisor | `supervisor@demo.com` / `demo123` |
| Grafana | `admin` / `retailos` |
| MinIO | `retailos` / `retailos-secret` |

## Demo Timing

| Time | Segment | Outcome |
| ---: | --- | --- |
| 0-3 min | Product framing | They understand the business workflow |
| 3-8 min | Architecture framing | They see the system is modular and async |
| 8-15 min | Rep flow | Create/submit visit; show fast UX |
| 15-22 min | Supervisor review | Score, reasons, POSM, fraud, image overlay |
| 22-27 min | Outlet governance | New outlet review and duplicate merge story |
| 27-31 min | Assistant/RAG | Ask operational questions with citations |
| 31-34 min | Observability | Ops dashboard, queues, latency, Grafana |
| 34-35 min | Close | Gaps, scale strategy, final message |

Do not demo every button. Keep the story moving.

## Segment 1: Product Framing

Say:

> We optimized around the retail workflow first: a rep visits a small outlet, captures shelf evidence, and supervisors need a fast, explainable answer to whether Olympic/Foodie visibility is compliant.

Then:

> The heavy AI work is async. The rep does not wait for YOLO/OpenAI in the request path. The system queues analysis, runs fraud checks, generates reports, and indexes them for the assistant.

Rubric points hit:

- product thinking
- business workflow
- API/data flow understanding
- AI-native engineering

## Segment 2: Architecture Framing

Open: [docs/systems/system-map.md](./systems/system-map.md)

Show the diagram.

Say:

> Next.js owns product UX and APIs. BullMQ absorbs expensive work. The worker owns orchestration and persistence. FastAPI owns AI inference and RAG. Postgres is operational truth, Pinecone is semantic memory, and EventLog/LGTM make the workflow observable.

Call out:

- YOLO for trained product/competitor detection.
- OpenAI vision for POSM because YOLO was not trained for POSM.
- Deterministic compliance scoring for explainability.
- Exact SQL/Prisma context before vector search for reliable assistant answers.

Do not spend more than 5 minutes here.

## Segment 3: Rep Visit Flow

Login as rep:

```text
rep@demo.com / demo123
```

Route:

```text
/rep/visits/new
```

Steps:

1. Enter a store name.
2. Let GPS populate or use current captured location.
3. Upload one shelf image.
4. Submit visit.
5. Show the analysis state.

Say:

> We intentionally limited the rep flow to one image per visit. Multi-image analysis creates packet duplication and cross-image interpretation problems. For the sprint, one shelf evidence image gives a cleaner AI and fraud pipeline.

If offline sync is worth showing:

- Disconnect or say the flow queues to IndexedDB when offline.
- Show offline sync badge if available.
- Do not risk toggling the network live unless rehearsed.

Important talking points:

- `clientVisitId` gives idempotency for offline retries.
- Upload persists through the storage abstraction.
- Submit only enqueues work and returns quickly.

## Segment 4: AI Processing And Supervisor Review

Switch to supervisor:

```text
supervisor@demo.com / demo123
```

Route:

```text
/supervisor
```

Show:

- total visits
- average compliance
- missing POSM
- fraud detections
- recent visits

Open a visit inspection page.

Show:

- raw image and YOLO overlay
- AI supervisor summary
- compliance score
- compliance reasons
- share of shelf
- POSM details
- fraud signal panel

Say:

> YOLO gives us grounded product and competitor detections. OpenAI fills the visual reasoning gap for POSM and shelf quality. Compliance itself is rule-based so supervisors can see exactly why a visit is poor or critical.

If YOLO count looks imperfect:

> We do not pretend the detector is perfect. We use YOLO as grounding for product and competitor presence, then use OpenAI for contextual visual audit. The score remains explainable and the image overlay lets supervisors review the evidence.

## Segment 5: Fraud Detection

On the visit inspection page, show fraud status/signals.

Say:

> Fraud checks run worker-side after upload. We implemented exact duplicate image, perceptual duplicate image, GPS mismatch, timestamp anomaly, and EXIF GPS/time checks. Blur was intentionally skipped because it produces noisy false positives on low-end phones without calibration.

Mention:

- `IMAGE_HASHED` is metadata, not user-facing fraud.
- High severity fraud can flag the visit.
- Fraud reasons are persisted separately in `FraudSignal`, not hidden inside AI prose.

If asked about rate limits/backpressure:

> AI service load is controlled by BullMQ, bounded worker concurrency, lightweight HTTP rate limits, and protected FastAPI endpoints. The next hardening step is Redis/WAF-backed distributed rate limiting and queue-depth admission control.

## Segment 6: Outlet Governance

Route:

```text
/supervisor/outlets
```

Show:

- pending outlet review
- duplicate hints
- master outlet list
- approve/reject/merge actions

Say:

> Bangladesh-style outlet data is messy. Reps should not be forced into a perfect master list, but we also cannot let every spelling become a new store. So reps submit name plus GPS; the system scores nearby canonical outlets and supervisors govern ambiguous cases.

For duplicate merge:

> Merge does not throw reports away. Visits and visit reports move to the canonical outlet, aliases are preserved, the duplicate is marked rejected, and affected reports are queued for Pinecone reindexing.

This is a strong product-thinking moment. Do not skip it.

## Segment 7: Assistant And RAG

Route:

```text
/supervisor/insights
```

Ask prepared questions:

```text
Which outlets are failing compliance?
```

```text
Which outlets have fraud signals?
```

```text
Which visits are missing POSM?
```

Say:

> The assistant is not just vector search. For exact operational questions, we first build database context using Prisma. Pinecone is used for semantic memory and narrative questions. This avoids hallucinating fraud or compliance lists from approximate vector matches.

If answer has no matches:

> That is intentional. For fraud queries, if exact fraudCount is zero, the assistant refuses to invent fraud from semantic matches.

## Segment 8: Observability

Route:

```text
/supervisor/ops
```

Show:

- worker health
- analyze and embedding queues
- failed jobs
- workflow average latency chip
- collapsible processing timelines
- stage badges
- recent failures

Say:

> This is the internal AI operations view. Every visit creates events as it moves from upload to queue to worker to fraud to AI to report generation to Pinecone indexing. This lets us debug async workflows without guessing.

Open Grafana:

```text
http://127.0.0.1:3005
```

Show briefly:

- dashboard list
- logs/metrics if populated

Do not get stuck in Grafana. The internal ops dashboard is more reliable for live storytelling.

## Segment 9: Close Strong

Say:

> The key design decision was to keep the rep workflow fast and move intelligence into async, observable workflows. The system uses AI where it fits: YOLO for detection, OpenAI vision for POSM/context, deterministic scoring for trust, and RAG for supervisor questions.

Then acknowledge gaps:

> If we had another sprint, I would add edge/WAF rate-limit policy, image compression, scheduled retention jobs, and cloud-managed infrastructure. The architecture already isolates those changes.

Final sentence:

> This is not a chatbot bolted onto CRUD. It is a production-shaped retail execution workflow with AI, queues, fraud, governed master data, and observability.

## Backup Paths

### If Live Submission Fails

Use seeded/pre-created visits.

Say:

> The live path is the same one used for these visits. I will switch to a precomputed visit so we can inspect the AI output without waiting on external services.

Then show:

- `/supervisor`
- `/supervisor/visits`
- visit inspection page
- `/supervisor/ops`

### If AI Service Is Down

Check:

```powershell
docker compose -f docker-compose.demo.yml ps
docker compose -f docker-compose.demo.yml logs ai-service --tail=80
```

Say:

> The architecture degrades through the queue. Failed jobs are visible in ops and can move to DLQ instead of blocking the rep workflow.

### If Pinecone/OpenAI Is Slow

Use exact-context assistant questions.

Say:

> Exact operational questions are answered from Postgres first. Vector retrieval is additive, not required for fraud/compliance lists.

### If Ports Conflict

Use:

```powershell
$env:WEB_PORT=3001
$env:AI_SERVICE_PORT=18001
$env:GRAFANA_PORT=13005
npm run demo:up
```

### If Docker Is Already Running But UI Looks Stale

```powershell
npm run demo:down
npm run demo:up:detached
npm run demo:logs
```

## Questions To Be Ready For

### Why YOLO and OpenAI?

YOLO is for trained, repeatable product/competitor detection. OpenAI handles untrained visual reasoning: Olympic POSM, shelf quality, clutter, and operational summaries. Compliance remains deterministic.

### How do you scale AI processing?

Scale workers horizontally, keep per-worker concurrency bounded, separate costly queues, use Modal/GPU for YOLO, and protect AI service with private networking/API key/rate limits.

### How do you prevent duplicate outlets?

Search-first outlet submission, normalized names, aliases, GPS-scoped candidate matching, confidence scoring, supervisor review, and merge that preserves visits/reports.

### How do you avoid chatbot hallucinations?

Exact DB context is built before vector search. Fraud/compliance/POSM list questions require exact database evidence. Vector matches are background, not proof.

### How do you handle fraud?

Worker-side exact duplicate, perceptual duplicate, GPS mismatch, timestamp anomaly, and EXIF checks. Signals are persisted relationally and shown with reasons.

### What is production-ready vs demo-ready?

Production-shaped: async queues, signed object uploads, API key auth, optional OAuth scaffold, RBAC, observability, DLQ replay, database-assisted outlet matching, RAG grounding, and Redis-backed rate limits. Next hardening: edge/WAF policy, managed pooling, image optimization, and cloud deployment.

## Do Not Say

- "It is just a demo."
- "YOLO is bad."
- "The chatbot just searches Pinecone."
- "We did not have time."

Say instead:

- "For this sprint, we chose the simplest production-shaped implementation."
- "The architecture isolates the next hardening step."
- "We optimized for the business workflow and explainability."

## Final Rehearsal Script

Use this if nerves hit:

> I will show this as an end-to-end retail execution workflow. First, a rep submits shelf evidence from the field. That request stays fast because AI runs async in BullMQ workers. Then the worker performs fraud checks, calls our FastAPI AI service for YOLO and OpenAI POSM analysis, saves explainable compliance results, and indexes a visit report for the assistant. On the supervisor side, we review compliance, fraud, outlet verification, RAG insights, and ops telemetry.
