import type { NextRequest } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { buildStorageKey, createS3Client, getS3Bucket, getStorageDriver, publicObjectUrl } from "@/lib/storage";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest, { params }: Params) {
  const limited = await rateLimit(request, { bucket: "image-presign", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

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

  const existingImage = await prisma.visitImage.findFirst({
    where: { visitId },
    select: { id: true },
  });
  if (existingImage) {
    return NextResponse.json({ error: "Only one shelf image is allowed per visit." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const fileName = typeof body?.fileName === "string" ? body.fileName : "shelf.jpg";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "image/jpeg";
  const sizeBytes = typeof body?.sizeBytes === "number" ? body.sizeBytes : 0;

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Only JPG, PNG, or WebP images are allowed." }, { status: 400 });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image must be smaller than 8MB." }, { status: 400 });
  }

  const bucket = getS3Bucket();
  const storageKey = buildStorageKey(visitId, fileName);
  const presignEndpoint = process.env.S3_PRESIGN_ENDPOINT || process.env.S3_ENDPOINT;
  const uploadUrl = await getSignedUrl(
    createS3Client(presignEndpoint),
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: {
        source: "retailos-lite",
        visitId,
      },
    }),
    { expiresIn: 300 },
  );

  return NextResponse.json({
    uploadUrl,
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    storageKey,
    bucket,
    publicUrl: publicObjectUrl(bucket, storageKey),
    expiresInSeconds: 300,
  });
}
