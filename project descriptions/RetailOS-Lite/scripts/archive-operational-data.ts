import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import dotenv from "dotenv";

dotenv.config();

type Args = {
  olderThanDays: number;
  limit: number;
  execute: boolean;
  deleteAfterArchive: boolean;
  outputDir: string;
};

const args = parseArgs(process.argv.slice(2));
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy: () => null,
  connectTimeout: 750,
});
redis.on("error", () => undefined);

async function main() {
  await fs.mkdir(args.outputDir, { recursive: true });
  const cutoff = new Date(Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const eventLogPath = path.join(args.outputDir, `event-log-${timestamp}.jsonl`);
  const queuePath = path.join(args.outputDir, `bullmq-jobs-${timestamp}.jsonl`);

  const eventArchive = await archiveEventLogs(cutoff, eventLogPath);
  const queueArchive = await archiveQueues(queuePath);

  console.log(
    JSON.stringify({
      event: "operational_archive_completed",
      dryRun: !args.execute,
      deleteAfterArchive: args.deleteAfterArchive,
      cutoff: cutoff.toISOString(),
      eventLogPath,
      queuePath,
      eventRows: eventArchive.count,
      queueJobs: queueArchive.count,
      errors: [...eventArchive.errors, ...queueArchive.errors],
    }),
  );
}

async function archiveEventLogs(cutoff: Date, outputPath: string): Promise<{ count: number; errors: string[] }> {
  try {
    const rows = await prisma.eventLog.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: args.limit,
    });

    await writeJsonl(outputPath, rows);
    if (args.execute && args.deleteAfterArchive && rows.length > 0) {
      await prisma.eventLog.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    }
    return { count: rows.length, errors: [] };
  } catch (error) {
    await writeJsonl(outputPath, []);
    return { count: 0, errors: [`event_log_unavailable: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

async function archiveQueues(outputPath: string): Promise<{ count: number; errors: string[] }> {
  const queueNames = [
    process.env.ANALYZE_VISIT_QUEUE || "analyze_visit",
    process.env.EMBED_VISIT_REPORT_QUEUE || "embed_visit_report",
    process.env.ANALYZE_VISIT_DLQ || "analyze_visit_dlq",
    process.env.EMBED_VISIT_REPORT_DLQ || "embed_visit_report_dlq",
  ];
  let count = 0;
  const records: unknown[] = [];
  const errors: string[] = [];

  try {
    if (redis.status === "wait") await redis.connect();
  } catch (error) {
    await writeJsonl(outputPath, records);
    return { count, errors: [`redis_unavailable: ${error instanceof Error ? error.message : String(error)}`] };
  }

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection: redis });
    try {
      const jobs = await queue.getJobs(["completed", "failed"], 0, Math.max(0, args.limit - 1), false);
      for (const job of jobs) {
        records.push({
          queueName,
          id: job.id,
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason,
          returnvalue: job.returnvalue,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
        });
      }
      count += jobs.length;
      if (args.execute && args.deleteAfterArchive) {
        for (const job of jobs) {
          await job.remove().catch(() => undefined);
        }
      }
    } catch (error) {
      errors.push(`${queueName}_unavailable: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await queue.close().catch(() => undefined);
    }
  }

  await writeJsonl(outputPath, records);
  return { count, errors };
}

async function writeJsonl(outputPath: string, rows: unknown[]): Promise<void> {
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(outputPath, content ? `${content}\n` : "", "utf8");
}

function parseArgs(raw: string[]): Args {
  const args: Args = {
    olderThanDays: 7,
    limit: 1000,
    execute: false,
    deleteAfterArchive: false,
    outputDir: "archives/ops",
  };

  for (const arg of raw) {
    if (arg === "--execute") args.execute = true;
    if (arg === "--delete") args.deleteAfterArchive = true;
    if (arg.startsWith("--older-than-days=")) {
      args.olderThanDays = positiveInt(arg.slice("--older-than-days=".length), args.olderThanDays);
    }
    if (arg.startsWith("--limit=")) {
      args.limit = positiveInt(arg.slice("--limit=".length), args.limit);
    }
    if (arg.startsWith("--output-dir=")) {
      args.outputDir = arg.slice("--output-dir=".length).trim() || args.outputDir;
    }
  }

  return args;
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
    await prisma.$disconnect();
    redis.disconnect();
  });
