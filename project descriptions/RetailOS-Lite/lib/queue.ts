import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createCorrelationId } from "@/lib/observability/correlation";
import { logInfo } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";

export type AnalyzeVisitJobData = {
  visitId: string;
  traceId?: string;
  useLlm?: boolean;
};

export type EmbedVisitReportJobData = {
  visitId: string;
};

function env(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() ? raw : fallback;
}

export const queueConfig = {
  redisUrl: env("REDIS_URL", "redis://127.0.0.1:6379"),
  analyzeVisitQueueName: env("ANALYZE_VISIT_QUEUE", "analyze_visit"),
  analyzeVisitDeadLetterQueueName: env("ANALYZE_VISIT_DLQ", "analyze_visit_dlq"),
  embedVisitReportQueueName: env("EMBED_VISIT_REPORT_QUEUE", "embed_visit_report"),
  embedVisitReportDeadLetterQueueName: env("EMBED_VISIT_REPORT_DLQ", "embed_visit_report_dlq"),
};

let redisConnection: Redis | null = null;
let analyzeQueue: Queue<AnalyzeVisitJobData> | null = null;
let embedQueue: Queue<EmbedVisitReportJobData> | null = null;

export function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new Redis(queueConfig.redisUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return redisConnection;
}

export function getAnalyzeVisitQueue() {
  if (!analyzeQueue) {
    analyzeQueue = new Queue<AnalyzeVisitJobData>(queueConfig.analyzeVisitQueueName, {
      connection: getRedisConnection(),
    });
  }
  return analyzeQueue;
}

export function getEmbedVisitReportQueue() {
  if (!embedQueue) {
    embedQueue = new Queue<EmbedVisitReportJobData>(queueConfig.embedVisitReportQueueName, {
      connection: getRedisConnection(),
    });
  }
  return embedQueue;
}

export async function enqueueAnalyzeVisit(visitId: string, useLlm = true, correlationId = createCorrelationId("visit")) {
  const queue = getAnalyzeVisitQueue();
  const traceId = correlationId;
  const started = Date.now();
  await queue.add(
    "analyze_visit",
    { visitId, traceId, useLlm },
    {
      jobId: `analyze-${visitId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  logInfo("analyze visit queued", {
    correlationId: traceId,
    visitId,
    stage: "queue",
    status: "queued",
    latencyMs: Date.now() - started,
    queue: queueConfig.analyzeVisitQueueName,
  });
  metrics.stageLatency.labels("queue", "success").observe(Date.now() - started);
  return traceId;
}

export async function enqueueVisitReportIndex(visitId: string, correlationId = createCorrelationId("embed")) {
  const queue = getEmbedVisitReportQueue();
  const started = Date.now();
  await queue.add(
    "embed_visit_report",
    { visitId },
    {
      jobId: `embed-${visitId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  logInfo("visit report indexing queued", {
    correlationId,
    visitId,
    stage: "embedding",
    status: "queued",
    latencyMs: Date.now() - started,
    queue: queueConfig.embedVisitReportQueueName,
  });
  metrics.stageLatency.labels("embedding", "queued").observe(Date.now() - started);
  return correlationId;
}
