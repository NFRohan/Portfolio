import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { userEventActor } from "@/lib/event-log";
import { correlationIdFromHeaders } from "@/lib/observability/correlation";
import { logError, logInfo } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { saveVisitImageFile } from "@/lib/storage";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, { bucket: "image-upload", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const correlationId = correlationIdFromHeaders(request.headers, "upload");
  const started = Date.now();
  const authz = await requireApiSession(ROLE_GROUPS.rep);
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const { id: visitId } = await params;
  const visit = await prisma.visit.findUnique({ where: { id: visitId } });
  if (!visit || visit.repId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existingImage = await prisma.visitImage.findFirst({
    where: { visitId },
    select: { id: true },
  });
  if (existingImage) {
    return NextResponse.json({ error: "Only one shelf image is allowed per visit." }, { status: 409 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const imageHash = formData.get("imageHash") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    const storedImage = await saveVisitImageFile({ file, visitId });

    const image = await prisma.visitImage.create({
      data: {
        visitId,
        url: storedImage.url,
        localPath: storedImage.localPath,
        imageHash: imageHash ?? undefined,
        metadata: storedImage.metadata,
      },
    });

    await prisma.eventLog.create({
      data: {
        visitId,
        event: "UPLOAD_STORED",
        level: "info",
        traceId: correlationId,
        ...userEventActor(session.user),
        metadata: {
          imageId: image.id,
          storageDriver: storedImage.metadata.storageDriver,
          stage: "upload",
          latencyMs: Date.now() - started,
        },
      },
    });

    logInfo("visit image uploaded", {
      correlationId,
      visitId,
      stage: "upload",
      status: "success",
      latencyMs: Date.now() - started,
      imageId: image.id,
    });
    metrics.stageLatency.labels("upload", "success").observe(Date.now() - started);

    const response = NextResponse.json(image, { status: 201 });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    logError(error, "visit image upload failed", {
      correlationId,
      visitId,
      stage: "upload",
      status: "error",
      latencyMs: Date.now() - started,
    });
    metrics.stageLatency.labels("upload", "error").observe(Date.now() - started);
    Sentry.captureException(error, {
      tags: { stage: "upload", visit_id: visitId, correlation_id: correlationId },
    });
    throw error;
  }
}
