import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

type StorageDriver = "local" | "s3";

export type StoredVisitImage = {
  url: string;
  localPath?: string;
  metadata: {
    sizeBytes: number;
    contentType: string;
    storageDriver: StorageDriver;
    storageKey: string;
    bucket?: string;
  };
};

type SaveVisitImageInput = {
  file: File;
  visitId: string;
};

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export async function saveVisitImageFile({ file, visitId }: SaveVisitImageInput): Promise<StoredVisitImage> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const storageKey = buildStorageKey(visitId, file.name);
  const driver = getStorageDriver();

  if (driver === "s3") {
    return saveToS3({ buffer, contentType, storageKey });
  }

  return saveToLocalDisk({ buffer, contentType, storageKey });
}

export function getStorageDriver(): StorageDriver {
  const raw = (process.env.IMAGE_STORAGE_DRIVER || "local").trim().toLowerCase();
  return raw === "s3" ? "s3" : "local";
}

export function buildStorageKey(visitId: string, originalName: string): string {
  const prefix = trimSlashes(process.env.S3_PREFIX || "uploads");
  const safeVisitId = visitId.replace(/[^a-zA-Z0-9_-]/g, "");
  const extension = normalizedExtension(originalName);
  return `${prefix}/visits/${safeVisitId}/${Date.now()}-${randomUUID()}${extension}`;
}

function normalizedExtension(originalName: string): string {
  const extension = path.extname(originalName).toLowerCase();
  return imageExtensions.has(extension) ? extension : ".jpg";
}

async function saveToLocalDisk({
  buffer,
  contentType,
  storageKey,
}: {
  buffer: Buffer;
  contentType: string;
  storageKey: string;
}): Promise<StoredVisitImage> {
  const localRoot = process.env.IMAGE_STORAGE_LOCAL_DIR || path.join("public", "uploads");
  const publicBase = trimTrailingSlash(process.env.IMAGE_STORAGE_LOCAL_PUBLIC_BASE || "/uploads");
  const relativeKey = removeUploadsPrefix(storageKey);
  const localPath = path.join(process.cwd(), localRoot, relativeKey);

  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);

  return {
    url: `${publicBase}/${toUrlPath(relativeKey)}`,
    localPath,
    metadata: {
      sizeBytes: buffer.length,
      contentType,
      storageDriver: "local",
      storageKey,
    },
  };
}

async function saveToS3({
  buffer,
  contentType,
  storageKey,
}: {
  buffer: Buffer;
  contentType: string;
  storageKey: string;
}): Promise<StoredVisitImage> {
  const bucket = getS3Bucket();
  const client = createS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: {
        source: "retailos-lite",
      },
    }),
  );

  return {
    url: publicObjectUrl(bucket, storageKey),
    metadata: {
      sizeBytes: buffer.length,
      contentType,
      storageDriver: "s3",
      storageKey,
      bucket,
    },
  };
}

export function publicObjectUrl(bucket: string, storageKey: string): string {
  const publicBase = process.env.IMAGE_STORAGE_PUBLIC_BASE_URL?.trim();
  if (publicBase) {
    return `${trimTrailingSlash(publicBase)}/${toUrlPath(storageKey)}`;
  }

  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error("IMAGE_STORAGE_PUBLIC_BASE_URL or S3_ENDPOINT is required when IMAGE_STORAGE_DRIVER=s3.");
  }
  return `${trimTrailingSlash(endpoint)}/${bucket}/${toUrlPath(storageKey)}`;
}

export function createS3Client(endpoint = process.env.S3_ENDPOINT || undefined): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE, true),
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
}

export function getS3Bucket(): string {
  return requiredEnv("S3_BUCKET");
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when IMAGE_STORAGE_DRIVER=s3.`);
  }
  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function removeUploadsPrefix(storageKey: string): string {
  return storageKey.replace(/^uploads\//, "");
}

function toUrlPath(value: string): string {
  return value.split(path.sep).join("/");
}
