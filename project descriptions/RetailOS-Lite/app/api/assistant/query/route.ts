import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  buildAssistantExactContext,
  exactNoMatchAssistantAnswer,
  fallbackAssistantAnswer,
  type AssistantAnswer,
} from "@/lib/assistant";
import { userEventActor } from "@/lib/event-log";
import { correlationIdFromHeaders } from "@/lib/observability/correlation";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, { bucket: "assistant", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const correlationId = correlationIdFromHeaders(request.headers, "assistant");
  const started = Date.now();
  const authz = await requireApiSession(ROLE_GROUPS.supervisor);
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const exactContext = await buildAssistantExactContext(question);
  const exactNoMatch = exactContext.length === 0 ? exactNoMatchAssistantAnswer(question) : null;
  if (exactNoMatch) {
    const latencyMs = Date.now() - started;
    await recordAssistantEvent({
      event: "ASSISTANT_QUERY_COMPLETED",
      level: "info",
      traceId: correlationId,
      userId: session.user.id,
      userRole: session.user.role,
      question,
      latencyMs,
      exactContextCount: 0,
      retrievalMode: "exact",
      sourceCount: 0,
      status: "exact_no_match",
    });
    const nextResponse = NextResponse.json(exactNoMatch);
    nextResponse.headers.set("x-correlation-id", correlationId);
    return nextResponse;
  }
  const aiServiceUrl = (process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
  const apiKey = process.env.RETAILOS_AI_SERVICE_API_KEY ?? process.env.AI_SERVICE_API_KEY;

  try {
    const response = await fetch(`${aiServiceUrl}/assistant/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        "x-correlation-id": correlationId,
        "x-request-id": correlationId,
      },
      body: JSON.stringify({
        question,
        exactContext,
        topK: typeof body?.topK === "number" ? body.topK : 5,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      const latencyMs = Date.now() - started;
      logWarn("assistant service returned fallback", {
        correlationId,
        stage: "assistant",
        status: String(response.status),
        latencyMs,
        exactContextCount: exactContext.length,
      });
      await recordAssistantEvent({
        event: "ASSISTANT_QUERY_FALLBACK",
        level: "warn",
        traceId: correlationId,
        userId: session.user.id,
        userRole: session.user.role,
        question,
        latencyMs,
        exactContextCount: exactContext.length,
        status: `service_${response.status}`,
        error: detail.slice(0, 500),
      });
      return NextResponse.json(
        fallbackAssistantAnswer(question, exactContext, [`AI assistant service failed (${response.status}): ${detail}`]),
      );
    }

    const answer = (await response.json()) as AssistantAnswer;
    const latencyMs = Date.now() - started;
    logInfo("assistant query completed", {
      correlationId,
      stage: "assistant",
      status: "success",
      latencyMs,
      exactContextCount: exactContext.length,
      retrievalMode: answer.retrievalMode,
    });
    metrics.stageLatency.labels("assistant", "success").observe(latencyMs);
    await recordAssistantEvent({
      event: "ASSISTANT_QUERY_COMPLETED",
      level: "info",
      traceId: correlationId,
      userId: session.user.id,
      userRole: session.user.role,
      question,
      latencyMs,
      exactContextCount: exactContext.length,
      retrievalMode: answer.retrievalMode,
      sourceCount: answer.matches?.length ?? answer.citations?.length ?? 0,
      status: "success",
    });
    const nextResponse = NextResponse.json({
      ...answer,
      exactContextCount: exactContext.length,
    });
    nextResponse.headers.set("x-correlation-id", correlationId);
    return nextResponse;
  } catch (error) {
    logError(error, "assistant query failed", {
      correlationId,
      stage: "assistant",
      status: "error",
      latencyMs: Date.now() - started,
      exactContextCount: exactContext.length,
    });
    metrics.stageLatency.labels("assistant", "error").observe(Date.now() - started);
    Sentry.captureException(error, {
      tags: { stage: "assistant", correlation_id: correlationId },
      extra: { exactContextCount: exactContext.length },
    });
    await recordAssistantEvent({
      event: "ASSISTANT_QUERY_FAILED",
      level: "error",
      traceId: correlationId,
      userId: session.user.id,
      userRole: session.user.role,
      question,
      latencyMs: Date.now() - started,
      exactContextCount: exactContext.length,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      fallbackAssistantAnswer(question, exactContext, [
        error instanceof Error ? error.message : "AI assistant service unavailable",
      ]),
    );
  }
}

async function recordAssistantEvent(input: {
  event: string;
  level: string;
  traceId: string;
  userId: string;
  userRole: string;
  question: string;
  latencyMs: number;
  exactContextCount: number;
  status: string;
  retrievalMode?: string;
  sourceCount?: number;
  error?: string;
}) {
  await prisma.eventLog
    .create({
      data: {
        event: input.event,
        level: input.level,
        ...userEventActor({ id: input.userId, role: input.userRole }),
        traceId: input.traceId,
        metadata: {
          stage: "assistant",
          userId: input.userId,
          latencyMs: input.latencyMs,
          exactContextCount: input.exactContextCount,
          retrievalMode: input.retrievalMode,
          sourceCount: input.sourceCount,
          status: input.status,
          error: input.error,
          questionPreview: input.question.slice(0, 160),
        },
      },
    })
    .catch((error) => {
      logWarn("assistant event persistence failed", {
        correlationId: input.traceId,
        stage: "assistant",
        status: "event_log_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
