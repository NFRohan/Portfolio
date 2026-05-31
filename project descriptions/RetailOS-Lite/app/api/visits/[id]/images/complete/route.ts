import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { userEventActor } from "@/lib/event-log";
import { correlationIdFromHeaders } from "@/lib/observability/correlation";
import { logError, logInfo } from "@/lib/observability/logger";
import { metrics } from "@/lib/observability/metrics";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { createS3Client, getS3Bucket, getStorageDriver, publicObjectUrl } from "@/lib/storage";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, { bucket: "image-complete", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const correlationId = correlationIdFromHeaders(request.headers, "upload");
  const started = Date.now();
  const authz = await requireApiSession(ROLE_GROUPS.rep);
  if (!authz.ok) return authz.response;
  const { session } = authz;
  const { id: visitId } = await params;

  if (getStorageDriver() !== "s3") {
    return NextResponse.json({ error: "Signed uploads require IMAGE_STORAGE_DRIVER=s3." }, { status: 501 });
  }

  const visit = await prisma.visit.findUnique({ where: { id: visitId }, select: { id: true, repId: true } });
  if (!visit || visit.repId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existingImage = await prisma.visitImage.findFirst({ where: { visitId }, select: { id: true } });
  if (existingImage) {
    return NextResponse.json({ error: "Only one shelf image is allowed per visit." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const storageKey = typeof body?.storageKey === "string" ? body.storageKey : "";
  const imageHash = typeof body?.imageHash === "string" ? body.imageHash : undefined;
  const contentType = typeof body?.contentType === "string" ? body.contentType : "application/octet-stream";
  const sizeBytes = typeof body?.sizeBytes === "number" ? body.sizeBytes : 0;

  if (!storageKey || !storageKey.includes(`/visits/${visitId}/`)) {
    return NextResponse.json({ error: "Invalid storage key." }, { status: 400 });
  }

  try {
    const bucket = getS3Bucket();
    await createS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
    const image = await prisma.visitImage.create({
      data: {
        visitId,
        url: publicObjectUrl(bucket, storageKey),
        imageHash,
        metadata: {
          sizeBytes,
          contentType,
          storageDriver: "s3",
          storageKey,
          bucket,
          uploadMode: "presigned",
          serverUrl: internalObjectUrl(storageKey),
        },
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
          storageDriver: "s3",
          uploadMode: "presigned",
          stage: "upload",
          latencyMs: Date.now() - started,
        },
      },
    });

    logInfo("visit image upload completed", {
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
    logError(error, "signed visit image completion failed", {
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
    return NextResponse.json({ error: "Uploaded image could not be verified." }, { status: 400 });
  }
}

function internalObjectUrl(storageKey: string): string | undefined {
  const base = process.env.IMAGE_STORAGE_INTERNAL_BASE_URL?.trim();
  if (!base) return undefined;
  return `${base.replace(/\/+$/, "")}/${storageKey.split("\\").join("/")}`;
}
