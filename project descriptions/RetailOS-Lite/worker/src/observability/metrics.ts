import http from "node:http";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import type { Queue } from "bullmq";
import { config } from "../config.js";
import { logInfo } from "./logger.js";

const registry = new Registry();
registry.setDefaultLabels({ service: "worker", environment: config.appEnv });
collectDefaultMetrics({ register: registry, prefix: "retailos_worker_" });

export const queueDepth = new Gauge({
  name: "retailos_worker_queue_depth",
  help: "BullMQ queue depth by queue and state.",
  labelNames: ["queue", "state"] as const,
  registers: [registry],
});

export const jobsCompleted = new Counter({
  name: "retailos_worker_jobs_completed_total",
  help: "Worker jobs completed by queue.",
  labelNames: ["queue"] as const,
  registers: [registry],
});

export const jobsFailed = new Counter({
  name: "retailos_worker_jobs_failed_total",
  help: "Worker jobs failed by queue and stage.",
  labelNames: ["queue", "stage"] as const,
  registers: [registry],
});

export const jobRetries = new Counter({
  name: "retailos_worker_job_retries_total",
  help: "Worker job retry attempts by queue.",
  labelNames: ["queue"] as const,
  registers: [registry],
});

export const stageLatency = new Histogram({
  name: "retailos_worker_stage_latency_ms",
  help: "Worker stage latency in milliseconds.",
  labelNames: ["stage", "status"] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
  registers: [registry],
});

export const fraudSignals = new Counter({
  name: "retailos_worker_fraud_signals_total",
  help: "Fraud signals emitted by type and severity.",
  labelNames: ["type", "severity"] as const,
  registers: [registry],
});

export function observeStage<T>(
  stage: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  return fn()
    .then((result) => {
      stageLatency.labels(stage, "success").observe(Date.now() - started);
      return result;
    })
    .catch((error) => {
      stageLatency.labels(stage, "error").observe(Date.now() - started);
      throw error;
    });
}

export function startMetricsServer() {
  const server = http.createServer(async (request, response) => {
    if (request.url !== "/metrics") {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": registry.contentType });
    response.end(await registry.metrics());
  });

  server.listen(config.workerMetricsPort, () => {
    logInfo("worker metrics server started", {
      stage: "metrics",
      status: "listening",
      port: config.workerMetricsPort,
    });
  });

  return server;
}

export async function refreshQueueMetrics(queues: Array<Queue<any>>) {
  await Promise.all(
    queues.map(async (queue) => {
      const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
      for (const [state, count] of Object.entries(counts)) {
        queueDepth.labels(queue.name, state).set(count);
      }
    }),
  );
}
