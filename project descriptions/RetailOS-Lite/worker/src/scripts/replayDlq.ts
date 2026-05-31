import { Queue } from "bullmq";
import { config } from "../config.js";
import { createRedisConnection } from "../queue.js";
import type { AnalyzeVisitJobData } from "../types/domain.js";

type DeadLetterJobData = {
  payload?: AnalyzeVisitJobData | EmbedVisitReportJobData;
  failedAt?: string;
  failedReason?: string;
  originalJobId?: string;
};

type EmbedVisitReportJobData = {
  visitId: string;
};

type Args = {
  queue: "analyze" | "embedding";
  limit: number;
  dryRun: boolean;
  remove: boolean;
  jobId?: string;
  visitId?: string;
};

const args = parseArgs(process.argv.slice(2));
const connection = createRedisConnection();
const queueSpec = queueSpecFor(args.queue);
const dlq = new Queue<DeadLetterJobData>(queueSpec.dlqName, { connection });
const targetQueue = new Queue(queueSpec.targetQueueName, { connection });

async function main() {
  const jobs = await dlq.getJobs(["waiting", "delayed", "failed", "paused"], 0, Math.max(0, args.limit - 1), false);
  const selected = jobs.filter((job) => {
    const payload = job.data.payload;
    return (
      payload &&
      (!args.jobId || job.id === args.jobId) &&
      (!args.visitId || payload.visitId === args.visitId)
    );
  });

  console.log(
    JSON.stringify({
      event: "dlq_replay_scan",
      queue: args.queue,
      dlq: queueSpec.dlqName,
      targetQueue: queueSpec.targetQueueName,
      found: jobs.length,
      selected: selected.length,
      dryRun: args.dryRun,
      remove: args.remove,
    }),
  );

  for (const job of selected) {
    const payload = job.data.payload;
    if (!payload) continue;

    const replayJobId = `replay-${payload.visitId}-${Date.now()}`;
    const record = {
      queue: args.queue,
      dlqJobId: job.id,
      originalJobId: job.data.originalJobId,
      visitId: payload.visitId,
      failedAt: job.data.failedAt,
      failedReason: job.data.failedReason,
      replayJobId,
    };

    if (args.dryRun) {
      console.log(JSON.stringify({ event: "dlq_replay_dry_run", ...record }));
      continue;
    }

    await targetQueue.add(queueSpec.jobName, payload, {
      jobId: replayJobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    if (args.remove) {
      await job.remove();
    }

    console.log(JSON.stringify({ event: "dlq_replayed", ...record, removedFromDlq: args.remove }));
  }
}

function parseArgs(raw: string[]): Args {
  const args: Args = {
    queue: "analyze",
    limit: 25,
    dryRun: true,
    remove: false,
  };

  for (const arg of raw) {
    if (arg === "--execute") args.dryRun = false;
    if (arg === "--remove") args.remove = true;
    if (arg.startsWith("--queue=")) args.queue = parseQueueKind(arg.slice("--queue=".length), args.queue);
    if (arg.startsWith("--limit=")) args.limit = positiveInt(arg.slice("--limit=".length), args.limit);
    if (arg.startsWith("--job-id=")) args.jobId = arg.slice("--job-id=".length).trim() || undefined;
    if (arg.startsWith("--visit-id=")) args.visitId = arg.slice("--visit-id=".length).trim() || undefined;
  }

  return args;
}

function queueSpecFor(queue: Args["queue"]) {
  if (queue === "embedding") {
    return {
      dlqName: config.embedVisitReportDeadLetterQueueName,
      targetQueueName: config.embedVisitReportQueueName,
      jobName: "embed_visit_report",
    };
  }

  return {
    dlqName: config.analyzeVisitDeadLetterQueueName,
    targetQueueName: config.analyzeVisitQueueName,
    jobName: "analyze_visit",
  };
}

function parseQueueKind(raw: string, fallback: Args["queue"]): Args["queue"] {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "embedding" || normalized === "embed" || normalized === "embed_visit_report") return "embedding";
  if (normalized === "analyze" || normalized === "analyze_visit") return "analyze";
  return fallback;
}

function positiveInt(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([dlq.close(), targetQueue.close()]);
    await connection.quit();
  });
