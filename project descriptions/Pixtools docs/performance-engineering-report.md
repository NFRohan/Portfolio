# PixTools Performance Engineering Report (Exhaustive Production-Type Run)

## 1) Executive Summary

This report documents an exhaustive, in-region (us-east-1) performance run executed on **2026-03-04 UTC** against the live `dev` stack.  
The run is suitable as the baseline reference for performance engineering because it includes:

- multi-scenario load (baseline, spike, retry storm, starvation mix),
- pre/post health checks,
- pre/post cluster snapshots,
- post-run runtime logs from API, workers, RabbitMQ, Cluster Autoscaler, and KEDA.

Primary conclusions:

- The platform is **stable at moderate sustained load** (baseline), with clean success behavior.
- Under high concurrency and mixed workload pressure, the system degrades with **500s + transport timeouts** (k6 status `0`), and API latency increases materially.
- The app node reaches CPU saturation during stress windows, while scaling has hard caps (`max=3`) that constrain recovery.
- There is a significant **ML queue wait** signal in worker logs (roughly 2.5 hours for sampled jobs), indicating backlog carry-over and high heavy-job contention.
- Control-plane/metrics plumbing has noise:
  - KEDA metrics adapter RBAC and readiness errors in logs.
  - Cluster Autoscaler warnings about non-ASG control-plane node mapping.
  - `/metrics` scraping attempts hitting API and returning 404.

---

## 2) Test Scope And Method

### 2.1 Run Profile

Source: `bench/results/prod-perf-suite-20260305-041336/production-performance-summary.json`

- Region: `us-east-1`
- Environment: `dev`
- Base URL: `http://k8s-pixtools-pixtools-f106dc8583-438717947.us-east-1.elb.amazonaws.com`
- K3s server: `i-00ce07dfb4b42e79f`
- Temporary in-region load runner: `i-075ae3ac121132a99` (terminated after run)

Scenario matrix:

1. `baseline`: 30 VUs, 10m, completion polling enabled
2. `spike`: 120 VUs, 5m
3. `retry_storm`: 60 VUs, 5m, request timeout 8s, max attempts 2
4. `starvation_mix`: 8m, heavy RPS 8, light RPS 4

### 2.2 Evidence Sources

- Scenario outputs:
  - `bench/results/prod-perf-suite-20260305-041336/10-baseline.txt`
  - `bench/results/prod-perf-suite-20260305-041336/20-spike.txt`
  - `bench/results/prod-perf-suite-20260305-041336/30-retry-storm.txt`
  - `bench/results/prod-perf-suite-20260305-041336/40-starvation-mix.txt`
- Run summary:
  - `bench/results/prod-perf-suite-20260305-041336/production-performance-summary.json`
- Cluster snapshots:
  - `bench/results/prod-perf-suite-20260305-041336/02-pre-cluster.txt`
  - `bench/results/prod-perf-suite-20260305-041336/91-post-cluster.txt`
- Runtime logs bundle:
  - `bench/results/prod-perf-suite-20260305-041336/runtime-logs/`

---

## 3) Scenario Results

## 3.1 Baseline (steady-state)

From `10-baseline.txt`:

- Submitted: **3779**
- Completed: **3779**
- Failed jobs: **0**
- HTTP avg: **187.92 ms**
- HTTP p95: **651.65 ms**
- HTTP failed rate: **0.00%**
- HTTP status counts: `202=3779`, `200=17790`
- Timeout points: `0`

Interpretation:

- Healthy and production-acceptable under this profile.
- Approx accepted throughput: ~**378 jobs/min**.

## 3.2 Spike (high fan-in)

From `20-spike.txt`:

- Submitted: **6119**
- Failed jobs: **232**
- HTTP avg: **5693.73 ms**
- HTTP p95: **8538.94 ms**
- HTTP failed rate: **3.65%**
- HTTP status counts: `202=6119`, `500=201`, `0=31`
- Timeout points: `279`

Interpretation:

- Throughput rose (~**1224 jobs/min accepted**) but latency and reliability degraded.
- Failure mode is primarily **server error (500)** + **transport timeout/failure (status 0)**.

## 3.3 Retry Storm

From `30-retry-storm.txt`:

- Submitted: **6461**
- Client retries: **14**
- Duplicate processing signals: **4284**
- HTTP avg: **2784.38 ms**
- HTTP p95: **3618.04 ms**
- HTTP failed rate: **0.22%**
- HTTP status counts: `202=6461`, `500=11`, `0=3`
- Timeout points: `27`

Interpretation:

- Retry behavior remains mostly controlled, but duplicate-processing pressure is substantial.
- 500s and timeouts still appear under retry stress.

## 3.4 Starvation Mix (heavy + light)

From `40-starvation-mix.txt`:

- Heavy submitted: **3768**
- Light submitted: **1877**
- Mix failures: **76**
- HTTP avg: **876.12 ms**
- HTTP p95: **6136.97 ms**
- Light workload p95: **5469.43 ms**
- HTTP failed rate: **1.33%**
- HTTP status counts: `202=5645`, `500=76`
- Timeout points: `0`

Interpretation:

- Light jobs are materially impacted in mixed load, indicating contention/backlog coupling.

---

## 4) Error Taxonomy

Aggregated across all scenarios (from k6 status counts):

- `500`: **288**
- `0` (transport-level timeout/connection failure): **34**
- `202`: **22004**
- `200`: **17790**

Not observed in this run:

- `409`, `429`, `502`, `503`, `504`

Conclusion:

- The dominant hard failures are application-level `500` plus transport-level timeouts, not rate-limit semantics.

---

## 5) Cluster Behavior During/After Run

From `91-post-cluster.txt`:

- API HPA at sample time: `cpu 80%/60`, replicas `3/3 max`.
- Worker standard scaler active at cap: `keda-hpa-pixtools-worker-standard 5243/8, replicas 3/3 max`.
- App node saturation observed: `ip-10-40-2-203` at **100% CPU** in post-run sample.
- Events include API probe failures:
  - readiness/liveness probe timeouts (`context deadline exceeded`) on API pods.

From health probes:

- Pre-run RTT: ~`0.03s - 0.08s` (`01-pre-health.txt`)
- Post-run RTT: ~`0.28s - 0.45s` (`90-post-health.txt`)

Interpretation:

- System recovers to running state, but post-run health latency remains elevated.

---

## 6) Runtime Log Findings

## 6.1 API logs

From `runtime-logs/02-api-logs.txt`:

- Predominantly `/api/health` 200s.
- Repeated `/metrics` 404s from internal scrape sources.

Implication:

- Observability endpoint mismatch/noise exists (scrape path not served by API), polluting logs and adding avoidable request volume.

## 6.2 Worker standard logs

From `runtime-logs/03-worker-standard-logs.txt` sampled processing durations:

- Count: `8` parsed `task_finish` durations
- p50: **0.144s**
- p95: **0.181s**
- max: **0.240s**

Implication:

- Standard task execution itself is fast; bottlenecks are likely queueing/scheduling/CPU contention rather than task runtime.

## 6.3 Worker ML logs

From `runtime-logs/04-worker-ml-logs.txt`:

- Parsed denoise task runtime:
  - p50: **11.244s**
  - p95: **11.654s**
- Parsed queue wait (`start_time - enqueue_time`) from available records:
  - min: **8954.76s**
  - p50: **8999.33s**
  - p95: **9021.24s**
  - max: **9031.61s**

Implication:

- Heavy queue delay is very large in sampled records (about 2.5h), signaling backlog persistence and starvation risk for heavy jobs.

## 6.4 RabbitMQ logs

From `runtime-logs/05-rabbitmq-logs.txt`:

- No memory/disk alarm signatures in sampled tail.
- Very frequent short-lived AMQP connections (accept/auth/close cycles).

Implication:

- Broker is alive, but connection churn suggests polling/short-lived clients and avoidable connection overhead.

## 6.5 Cluster Autoscaler logs

From `runtime-logs/06-cluster-autoscaler-logs.txt`:

- Repeated warnings:
  - `Failed to check cloud provider has instance for ip-10-40-1-114... node is not present in aws`
- Frequent loops:
  - `No unschedulable pods`
  - `scale down candidates. skipping`

Implication:

- Autoscaler is mostly idle during sampled window and emits noisy warnings about control-plane node mapping.

## 6.6 KEDA logs

From `runtime-logs/07-keda-operator-logs.txt`:

- Metrics adapter repeatedly waiting for gRPC connection.
- RBAC/authorization errors:
  - forbidden `subjectaccessreviews`
  - missing `extension-apiserver-authentication-reader` role
  - `Failed to watch` errors

Implication:

- KEDA core scaler works, but metrics-server side has RBAC and readiness instability, reducing confidence in metrics-driven scaling health.

---

## 7) Bottleneck Analysis

## 7.1 API Saturation Under Spike

Evidence:

- Spike p95 ~8.54s, HTTP failures 3.65%, 500 + transport failures.
- API probe timeout warnings in events.
- API HPA reaches max replicas.

Assessment:

- The current `maxReplicas=3` cap is too low for the tested spike profile.

## 7.2 App Node CPU Ceiling

Evidence:

- Post-run node sample shows app node at 100% CPU.
- Worker/API both colocated on app node.

Assessment:

- CPU saturation is a primary driver of latency/failure escalation.

## 7.3 Heavy Workload Backlog

Evidence:

- ML queue wait in logs ~8955-9032s for sampled jobs.
- Starvation mix light p95 still high (~5.47s), with 500s.

Assessment:

- Heavy-job backlog and queue coupling remain a major latency amplifier.

## 7.4 Control Plane / Scaling Hygiene Gaps

Evidence:

- KEDA metrics RBAC errors.
- Autoscaler control-plane mapping warnings.
- API `/metrics` scrape 404 noise.

Assessment:

- These are not the sole reason for spike failures but are reliability and operability risks that complicate scale behavior.

---

## 8) Priority Remediation Plan

## P0 (before production-grade load claims)

1. Raise API and worker scale ceilings and retest.
   - Increase `pixtools-api` and `pixtools-worker-standard` max replicas above 3.
   - Ensure node group max size supports new pod ceilings.
2. Fix KEDA metrics-server RBAC/auth chain.
   - Resolve missing roles and forbidden SAR checks.
3. Eliminate `/metrics` 404 scrape noise.
   - Route scrapes to correct metrics endpoints only.
4. Add retry/load-shed policy at API edge.
   - Controlled admission when queue depth or CPU crosses threshold.

## P1 (short-term hardening)

1. Reduce RabbitMQ connection churn via pooled/persistent AMQP connections where possible.
2. Separate heavy-ML and light queues with explicit capacity reservations.
3. Tighten probe budgets to avoid restart storms during short CPU spikes.
4. Clean autoscaler node mapping assumptions for non-ASG control-plane.

## P2 (performance governance)

1. Define SLO-based gates (latency, failure rate, queue wait, drain time).
2. Automate this exact suite in CI/CD as a release gate.
3. Add runbook automation for failed-scenario triage.

---

## 9) Recommended SLO Gates For Next Baseline

1. Baseline p95 <= 700ms, failed rate <= 0.2%.
2. Spike failed rate <= 1.0%, no transport status `0`.
3. Retry storm 500 count <= 0.2% of accepted requests.
4. Starvation mix light p95 <= 2.0s.
5. ML queue wait p95 <= 300s during stress window.
6. Zero KEDA metrics RBAC errors during run.

---

## 10) Limitations

1. Runtime log pulls were done via SSM `StandardOutputContent` and are bounded (large outputs can be truncated).
2. `completed` metric is scenario-dependent; non-polling scenarios may report zero completions even when jobs continue asynchronously.
3. This run targets `dev`, not production data shape.

---

## 11) Final Assessment

Current state is **functional and resilient at moderate load**, but **not yet production-grade for aggressive concurrency** with strict reliability targets.

The most impactful fixes are:

1. scale ceiling/resource headroom,
2. KEDA metrics RBAC stabilization,
3. queue isolation/backlog control,
4. API protection under burst (backpressure + admission strategy).

This report plus the attached artifacts are a valid baseline for your performance engineering workstream.
