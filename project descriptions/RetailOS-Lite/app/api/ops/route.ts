import type { Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@/lib/prisma";
import { queueConfig } from "@/lib/queue";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

type EventRow = Prisma.EventLogGetPayload<object>;
type QueueHealth = Awaited<ReturnType<typeof readQueueHealth>>;

const QUEUE_HEALTH_CACHE_MS = 3000;
let cachedQueueHealth: { expiresAt: number; value: QueueHealth } | null = null;
let redisConnection: Redis | null = null;
let queueClients: Queue[] | null = null;

export async function GET() {
  const authz = await requireApiSession(ROLE_GROUPS.supervisor);
  if (!authz.ok) return authz.response;

  const [events, queueHealth] = await Promise.all([loadEvents(), loadQueueHealth()]);
  const visitIds = [...new Set(events.map((event) => event.visitId).filter((id): id is string => Boolean(id)))].slice(0, 30);
  const visits = await prisma.visit.findMany({
    where: { id: { in: visitIds } },
    include: {
      outlet: true,
      rep: { select: { name: true } },
      aiResult: true,
      fraudSignals: true,
    },
  });
  const visitMap = new Map(visits.map((visit) => [visit.id, visit]));
  const timelines = buildTimelines(events, visitMap);
  const failures = events
    .filter((event) => event.level === "error" || event.event.includes("FAILED"))
    .slice(0, 10)
    .map((event) => serializeEvent(event, visitMap));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    queueHealth,
    workerHealth: workerHealth(queueHealth),
    recentEvents: events.slice(0, 30).map((event) => serializeEvent(event, visitMap)),
    failures,
    timelines,
    assistant: assistantStats(events),
    latency: latencyStats(events, timelines),
  });
}

async function loadEvents() {
  return prisma.eventLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
  });
}

async function loadQueueHealth() {
  const now = Date.now();
  if (cachedQueueHealth && cachedQueueHealth.expiresAt > now) {
    return cachedQueueHealth.value;
  }

  const value = await readQueueHealth();
  cachedQueueHealth = { expiresAt: now + QUEUE_HEALTH_CACHE_MS, value };
  return value;
}

async function readQueueHealth() {
  const redisUrl = queueConfig.redisUrl;
  const analyzeQueueName = queueConfig.analyzeVisitQueueName;
  const embedQueueName = queueConfig.embedVisitReportQueueName;
  const dlqName = queueConfig.analyzeVisitDeadLetterQueueName;
  const embedDlqName = queueConfig.embedVisitReportDeadLetterQueueName;

  try {
    const connection = getRedisConnection(redisUrl);
    if (connection.status === "wait") {
      await connection.connect();
    }
    const queues = getQueueClients(connection, [analyzeQueueName, embedQueueName, dlqName, embedDlqName]);
    const [analyze, embed, dlq, embedDlq] = await Promise.all(queues.map(readQueue));
    return {
      status: "connected",
      queues: [analyze, embed, dlq, embedDlq],
    };
  } catch (error) {
    return {
      status: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      queues: [
        emptyQueue(analyzeQueueName),
        emptyQueue(embedQueueName),
        emptyQueue(dlqName),
        emptyQueue(embedDlqName),
      ],
    };
  }
}

function getRedisConnection(redisUrl: string) {
  if (redisConnection) return redisConnection;
  redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 750,
    lazyConnect: true,
  });
  return redisConnection;
}

function getQueueClients(connection: Redis, queueNames: string[]) {
  const existingNames = queueClients?.map((queue) => queue.name).join("|");
  const nextNames = queueNames.join("|");
  if (queueClients && existingNames === nextNames) return queueClients;

  queueClients?.forEach((queue) => void queue.close().catch(() => undefined));
  queueClients = queueNames.map((name) => new Queue(name, { connection }));
  return queueClients;
}

async function readQueue(queue: Queue) {
  const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
  const failedJobs = await queue.getFailed(0, 4);
  return {
    name: queue.name,
    counts,
    failedJobs: failedJobs.map((job) => ({
      id: job.id,
      name: job.name,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      data: job.data,
    })),
  };
}

function emptyQueue(name: string) {
  return {
    name,
    counts: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
    failedJobs: [],
  };
}

function workerHealth(queueHealth: Awaited<ReturnType<typeof loadQueueHealth>>) {
  const analyzeQueue = queueHealth.queues.find((queue) => queue.name === queueConfig.analyzeVisitQueueName);
  const waiting = Number(analyzeQueue?.counts.waiting ?? 0);
  const active = Number(analyzeQueue?.counts.active ?? 0);
  const failed = queueHealth.queues.reduce((total, queue) => total + Number(queue.counts.failed ?? 0), 0);

  if (queueHealth.status !== "connected") return { status: "degraded", reason: "Redis unavailable" };
  if (failed > 0) return { status: "attention", reason: `${failed} failed job(s)` };
  if (waiting > 10) return { status: "busy", reason: `${waiting} jobs waiting` };
  return { status: active > 0 ? "processing" : "healthy", reason: active > 0 ? `${active} active job(s)` : "Queues are clear" };
}

function buildTimelines(events: EventRow[], visitMap: Map<string, Prisma.VisitGetPayload<{ include: { outlet: true; rep: { select: { name: true } }; aiResult: true; fraudSignals: true } }>>) {
  const byVisit = new Map<string, EventRow[]>();
  for (const event of events) {
    if (!event.visitId) continue;
    byVisit.set(event.visitId, [...(byVisit.get(event.visitId) ?? []), event]);
  }

  return [...byVisit.entries()].slice(0, 8).map(([visitId, visitEvents]) => {
    const visit = visitMap.get(visitId);
    const sorted = [...visitEvents].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return {
      visitId,
      outletName: visit?.outlet.name ?? "Unknown outlet",
      repName: visit?.rep.name ?? "Unknown rep",
      visitStatus: visit?.status ?? "UNKNOWN",
      complianceScore: visit?.aiResult?.complianceScore ?? null,
      fraudSignals: visit?.fraudSignals.filter((signal) => signal.type !== "IMAGE_HASHED").length ?? 0,
      durationMs: sorted.length > 1 ? sorted.at(-1)!.createdAt.getTime() - sorted[0]!.createdAt.getTime() : null,
      events: sorted.map((event) => serializeEvent(event, visitMap)),
    };
  });
}

function serializeEvent(event: EventRow, visitMap: Map<string, Prisma.VisitGetPayload<{ include: { outlet: true; rep: { select: { name: true } }; aiResult: true; fraudSignals: true } }>>) {
  const visit = event.visitId ? visitMap.get(event.visitId) : null;
  const metadata = isRecord(event.metadata) ? event.metadata : {};
  return {
    id: event.id,
    visitId: event.visitId,
    jobId: event.jobId,
    outletName: visit?.outlet.name ?? null,
    event: event.event,
    level: event.level,
    actorId: event.actorId,
    actorRole: event.actorRole,
    actorType: event.actorType,
    stage: stringField(metadata.stage) ?? stageFromEvent(event.event),
    traceId: event.traceId,
    latencyMs: numberField(metadata.latencyMs) ?? numberField(metadata.durationMs),
    metadata,
    createdAt: event.createdAt.toISOString(),
  };
}

function assistantStats(events: EventRow[]) {
  const assistantEvents = events.filter((event) => stageFromEvent(event.event) === "assistant" || event.event.includes("ASSISTANT"));
  return {
    recentQueries: assistantEvents.length,
    lastEventAt: assistantEvents[0]?.createdAt.toISOString() ?? null,
  };
}

function latencyStats(
  events: EventRow[],
  timelines: Array<{ durationMs: number | null }>,
) {
  const workflowDurations = timelines
    .map((timeline) => timeline.durationMs)
    .filter((duration): duration is number => typeof duration === "number" && Number.isFinite(duration));
  const samples = events
    .map((event) => {
      const metadata = isRecord(event.metadata) ? event.metadata : {};
      const latencyMs = numberField(metadata.latencyMs) ?? numberField(metadata.durationMs);
      if (latencyMs === null) return null;
      return {
        stage: stringField(metadata.stage) ?? stageFromEvent(event.event),
        latencyMs,
      };
    })
    .filter((sample): sample is { stage: string; latencyMs: number } => Boolean(sample));
  const byStage = new Map<string, number[]>();
  for (const sample of samples) {
    byStage.set(sample.stage, [...(byStage.get(sample.stage) ?? []), sample.latencyMs]);
  }

  return {
    averageMs: average(workflowDurations),
    sampleCount: workflowDurations.length,
    byStage: [...byStage.entries()]
      .map(([stage, values]) => ({
        stage,
        averageMs: average(values),
        sampleCount: values.length,
      }))
      .sort((a, b) => b.sampleCount - a.sampleCount || a.stage.localeCompare(b.stage)),
  };
}

function stageFromEvent(event: string): string {
  if (event.includes("UPLOAD")) return "upload";
  if (event.includes("QUEUED") || event.includes("SUBMITTED")) return "queue";
  if (event.includes("FRAUD")) return "fraud";
  if (event.includes("REPORT")) return "report";
  if (event.includes("INDEX")) return "embedding";
  if (event.includes("ASSISTANT")) return "assistant";
  if (event.includes("ANALYZE")) return "analyze_visit";
  return "event";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}
