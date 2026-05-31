import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { userEventActor } from "@/lib/event-log";
import { correlationIdFromHeaders } from "@/lib/observability/correlation";
import { logError, logInfo } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";
import { prisma } from "@/lib/prisma";
import { enqueueAnalyzeVisit } from "@/lib/queue";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const correlationId = correlationIdFromHeaders(_request.headers, "visit");
  const started = Date.now();
  const authz = await requireApiSession(ROLE_GROUPS.rep);
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const { id: visitId } = await params;
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { images: true },
  });

  if (!visit || visit.repId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (visit.images.length === 0) {
    return NextResponse.json({ error: "Upload at least one shelf image" }, { status: 400 });
  }

  if (visit.status !== "PENDING") {
    return NextResponse.json({ status: visit.status, traceId: null });
  }

  await prisma.visit.update({
    where: { id: visitId },
    data: { status: "ANALYZING" },
  });

  await prisma.eventLog.create({
    data: {
      visitId,
      event: "VISIT_SUBMITTED",
      level: "info",
      ...userEventActor(session.user),
      metadata: { repId: session.user.id },
    },
  });

  try {
    const traceId = await enqueueAnalyzeVisit(visitId, true, correlationId);

    await prisma.eventLog.create({
      data: {
        visitId,
        event: "ANALYZE_VISIT_QUEUED",
        level: "info",
        traceId,
        ...userEventActor(session.user),
        metadata: {
          stage: "queue",
          latencyMs: Date.now() - started,
        },
      },
    });

    logInfo("visit submitted for analysis", {
      correlationId: traceId,
      visitId,
      stage: "queue",
      status: "queued",
      latencyMs: Date.now() - started,
    });
    metrics.stageLatency.labels("queue", "success").observe(Date.now() - started);

    const response = NextResponse.json({ status: "ANALYZING", traceId });
    response.headers.set("x-correlation-id", traceId);
    return response;
  } catch (error) {
    logError(error, "visit submit failed", {
      correlationId,
      visitId,
      stage: "queue",
      status: "error",
      latencyMs: Date.now() - started,
    });
    metrics.stageLatency.labels("queue", "error").observe(Date.now() - started);
    Sentry.captureException(error, {
      tags: { stage: "queue", visit_id: visitId, correlation_id: correlationId },
    });
    throw error;
  }
}
