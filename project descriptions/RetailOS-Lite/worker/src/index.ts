import { config } from "./config.js";
import { createAnalyzeVisitRuntime } from "./queue.js";
import { logError, logInfo, logWarn } from "./observability/logger.js";
import { jobsCompleted, jobsFailed, startMetricsServer } from "./observability/metrics.js";
import { captureWorkerException, Sentry } from "./observability/sentry.js";

const runtime = createAnalyzeVisitRuntime();
const { worker, events } = runtime;
const metricsServer = startMetricsServer();

worker.on("completed", (job) => {
  const summary = job.returnvalue?.outcomeSummary;
  jobsCompleted.labels(worker.name).inc();
  logInfo("job completed", {
    correlationId: job.data.traceId,
    jobId: job.id,
    name: job.name,
    visitId: job.data.visitId,
    stage: "analyze_visit",
    status: summary?.finalStatus,
    complianceScore: summary?.complianceScore,
    supervisorSummary: summary?.supervisorSummary,
    complianceReasons: summary?.complianceReasons,
    fraudSignals: summary?.fraudSignals,
  });
});

worker.on("failed", (job, error) => {
  jobsFailed.labels(worker.name, "analyze_visit").inc();
  logError(error, "job failed", {
    correlationId: job?.data.traceId,
    jobId: job?.id,
    name: job?.name,
    visitId: job?.data.visitId,
    stage: "analyze_visit",
    status: "error",
  });
  captureWorkerException(error, {
    correlationId: job?.data.traceId,
    visitId: job?.data.visitId,
    jobId: job?.id,
    stage: "analyze_visit",
  });
});

events.on("waiting", ({ jobId }) => {
  logInfo("job waiting", { jobId, stage: "queue", status: "waiting" });
});

events.on("failed", ({ jobId, failedReason }) => {
  logWarn("queue event failed", { jobId, stage: "queue", status: "failed", failedReason });
});

logInfo("worker started", {
  stage: "worker",
  status: "started",
  queue: worker.name,
  concurrency: config.workerConcurrency,
  aiServiceUrl: config.aiServiceUrl,
  metricsPort: config.workerMetricsPort,
});

const shutdown = async () => {
  logInfo("worker shutdown started", { stage: "worker", status: "shutdown" });
  await runtime.close();
  metricsServer.close();
  await Sentry.close(2000);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
