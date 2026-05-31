import type { Role } from "@prisma/client";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { NextRequest } from "next/server";
import { userEventActor } from "@/lib/event-log";
import { prisma } from "@/lib/prisma";
import { queueConfig } from "@/lib/queue";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

type QueueKind = "analyze" | "embedding";

type DeadLetterJobData = {
  payload?: { visitId?: string; traceId?: string };
  failedAt?: string;
  failedReason?: string;
  originalJobId?: string;
};

export async function POST(request: NextRequest) {
  const authz = await requireApiSession(ROLE_GROUPS.admin);
  if (!authz.ok) return authz.response;

  const body = await request.json().catch(() => ({}));
  const queueKind = parseQueueKind(body?.queue);
  const jobId = stringOrUndefined(body?.jobId);
  const visitId = stringOrUndefined(body?.visitId);
  const limit = positiveInt(body?.limit, 25, 100);
  const execute = body?.execute === true;
  const remove = body?.remove === true;
  const spec = queueSpecFor(queueKind);
  const redis = new Redis(queueConfig.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 750,
  });

  const dlq = new Queue<DeadLetterJobData>(spec.dlqName, { connection: redis });
  const targetQueue = new Queue(spec.targetQueueName, { connection: redis });

  try {
    if (redis.status === "wait") await redis.connect();
    const jobs = jobId
      ? [await dlq.getJob(jobId)].filter((job): job is NonNullable<typeof job> => Boolean(job))
      : await dlq.getJobs(["waiting", "delayed", "failed", "paused"], 0, Math.max(0, limit - 1), false);

    const selected = jobs.filter((job) => {
      const payload = job.data.payload;
      return payload?.visitId && (!visitId || payload.visitId === visitId);
    });

    const replayed = [];
    for (const job of selected) {
      const payload = job.data.payload;
      if (!payload?.visitId) continue;

      const replayJobId = `replay-${queueKind}-${payload.visitId}-${Date.now()}`;
      const record = {
        dlqJobId: job.id,
        originalJobId: job.data.originalJobId,
        replayJobId,
        visitId: payload.visitId,
        failedAt: job.data.failedAt,
        failedReason: job.data.failedReason,
      };

      if (execute) {
        await targetQueue.add(spec.jobName, payload, {
          jobId: replayJobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        });
        if (remove) await job.remove();
      }

      replayed.push(record);
      await prisma.eventLog.create({
        data: {
          visitId: payload.visitId,
          event: execute ? "DLQ_JOB_REPLAYED" : "DLQ_REPLAY_DRY_RUN",
          level: execute ? "info" : "warn",
          ...userEventActor({ id: authz.session.user.id, role: authz.session.user.role as Role }),
          metadata: {
            stage: "queue",
            queue: queueKind,
            dlq: spec.dlqName,
            targetQueue: spec.targetQueueName,
            dlqJobId: job.id,
            originalJobId: job.data.originalJobId,
            replayJobId,
            removedFromDlq: execute && remove,
            failedReason: job.data.failedReason,
          },
        },
      });
    }

    return NextResponse.json({
      queue: queueKind,
      dlq: spec.dlqName,
      targetQueue: spec.targetQueueName,
      dryRun: !execute,
      remove,
      found: jobs.length,
      selected: selected.length,
      replayed,
    });
  } finally {
    await Promise.all([dlq.close().catch(() => undefined), targetQueue.close().catch(() => undefined)]);
    redis.disconnect();
  }
}

function queueSpecFor(queue: QueueKind) {
  if (queue === "embedding") {
    return {
      dlqName: queueConfig.embedVisitReportDeadLetterQueueName,
      targetQueueName: queueConfig.embedVisitReportQueueName,
      jobName: "embed_visit_report",
    };
  }

  return {
    dlqName: queueConfig.analyzeVisitDeadLetterQueueName,
    targetQueueName: queueConfig.analyzeVisitQueueName,
    jobName: "analyze_visit",
  };
}

function parseQueueKind(value: unknown): QueueKind {
  if (typeof value !== "string") return "analyze";
  const normalized = value.trim().toLowerCase();
  if (normalized === "embedding" || normalized === "embed" || normalized === "embed_visit_report") return "embedding";
  return "analyze";
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.trunc(parsed));
}
