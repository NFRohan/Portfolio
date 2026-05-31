import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "prom-client";

const globalForMetrics = globalThis as unknown as {
  retailosMetrics?: ReturnType<typeof createMetrics>;
};

export const metrics = globalForMetrics.retailosMetrics ?? createMetrics();
globalForMetrics.retailosMetrics = metrics;

function createMetrics() {
  const registry = new Registry();
  registry.setDefaultLabels({
    service: process.env.OTEL_SERVICE_NAME || "web",
    environment: process.env.APP_ENV || process.env.NODE_ENV || "development",
  });

  collectDefaultMetrics({ register: registry, prefix: "retailos_" });

  const queueDepth = new Gauge({
    name: "retailos_queue_depth",
    help: "Current BullMQ queue depth by queue and state.",
    labelNames: ["queue", "state"] as const,
    registers: [registry],
  });

  const jobsCompleted = new Counter({
    name: "retailos_jobs_completed_total",
    help: "Completed jobs by queue.",
    labelNames: ["queue"] as const,
    registers: [registry],
  });

  const jobsFailed = new Counter({
    name: "retailos_jobs_failed_total",
    help: "Failed jobs by queue and stage.",
    labelNames: ["queue", "stage"] as const,
    registers: [registry],
  });

  const stageLatency = new Histogram({
    name: "retailos_stage_latency_ms",
    help: "Operational stage latency in milliseconds.",
    labelNames: ["stage", "status"] as const,
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
    registers: [registry],
  });

  const fraudSignals = new Counter({
    name: "retailos_fraud_signals_total",
    help: "Fraud signals emitted by type and severity.",
    labelNames: ["type", "severity"] as const,
    registers: [registry],
  });

  return { registry, queueDepth, jobsCompleted, jobsFailed, stageLatency, fraudSignals };
}
