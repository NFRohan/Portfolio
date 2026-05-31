import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import exifr from "exifr";
import sharp from "sharp";
import { config } from "../config.js";
import type { FraudSignal, Visit, VisitImage } from "../types/domain.js";
import type { VisitRepository } from "../repositories/visitRepository.js";

const nowIso = () => new Date().toISOString();
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PERCEPTUAL_HASH_ALGORITHM = "dhash-8x8";
const PERCEPTUAL_HASH_DUPLICATE_THRESHOLD = 8;
const PERCEPTUAL_HASH_HIGH_SEVERITY_THRESHOLD = 4;

type ExifMetadata = {
  latitude?: number;
  longitude?: number;
  capturedAt?: string;
  sourceFields: string[];
};

export async function runContextualFraudChecks(
  visit: Visit,
  repository: VisitRepository,
): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = [];

  signals.push(...(await hashAndDuplicateSignals(visit, repository)));
  signals.push(...(await perceptualDuplicateSignals(visit, repository)));
  signals.push(...(await exifSignals(visit, repository)));
  const gpsSignal = gpsMismatchSignal(visit);
  if (gpsSignal) signals.push(gpsSignal);
  const timestampSignal = timestampAnomalySignal(visit);
  if (timestampSignal) signals.push(timestampSignal);

  return signals;
}

async function hashAndDuplicateSignals(
  visit: Visit,
  repository: VisitRepository,
): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = [];

  for (const image of visit.images) {
    if (!image.imageHash) {
      const imageBuffer = await imageBufferFor(image);
      if (!imageBuffer) continue;

      const imageHash = sha256(imageBuffer);
      const updatedImage: VisitImage = { ...image, imageHash };
      await repository.updateVisitImage(updatedImage);
      image.imageHash = imageHash;
    }

    if (image.imageHash) {
      const duplicates = await repository.findImagesByHash(image.imageHash, visit.id);
      if (duplicates.length > 0) {
        signals.push({
          visitId: visit.id,
          type: "DUPLICATE_IMAGE",
          severity: "HIGH",
          message: "Image appears to be reused from another visit.",
          metadata: {
            imageId: image.id,
            imageHash: image.imageHash,
            duplicateImageIds: duplicates.map((duplicate) => duplicate.id),
          },
          createdAt: nowIso(),
        });
      }
    }
  }

  return signals;
}

async function perceptualDuplicateSignals(
  visit: Visit,
  repository: VisitRepository,
): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = [];
  const candidates = await repository.findImagesWithPerceptualHash(visit.id);

  for (const image of visit.images) {
    let currentHash = perceptualHashFromMetadata(image.metadata);

    if (!currentHash) {
      const imageBuffer = await imageBufferFor(image);
      if (!imageBuffer) continue;

      currentHash = await perceptualHash(imageBuffer);
      if (!currentHash) continue;

      const updatedImage: VisitImage = {
        ...image,
        metadata: withPerceptualHash(image.metadata, currentHash),
      };
      await repository.updateVisitImage(updatedImage);
      image.metadata = updatedImage.metadata;
    }

    const matches = candidates
      .filter((candidate) => !image.imageHash || candidate.imageHash !== image.imageHash)
      .map((candidate) => {
        const candidateHash = perceptualHashFromMetadata(candidate.metadata);
        if (!candidateHash) return null;
        return {
          imageId: candidate.id,
          visitId: candidate.visitId,
          distance: hammingDistanceHex(currentHash, candidateHash),
        };
      })
      .filter((match): match is { imageId: string; visitId: string; distance: number } =>
        match !== null && match.distance <= PERCEPTUAL_HASH_DUPLICATE_THRESHOLD,
      )
      .sort((a, b) => a.distance - b.distance);

    if (matches.length === 0) continue;

    const nearestDistance = matches[0]?.distance ?? PERCEPTUAL_HASH_DUPLICATE_THRESHOLD;
    signals.push({
      visitId: visit.id,
      type: "PERCEPTUAL_DUPLICATE_IMAGE",
      severity: nearestDistance <= PERCEPTUAL_HASH_HIGH_SEVERITY_THRESHOLD ? "HIGH" : "MEDIUM",
      message: "Image is visually similar to a previous visit image.",
      metadata: {
        imageId: image.id,
        perceptualHash: currentHash,
        algorithm: PERCEPTUAL_HASH_ALGORITHM,
        threshold: PERCEPTUAL_HASH_DUPLICATE_THRESHOLD,
        similarImages: matches.slice(0, 5),
      },
      createdAt: nowIso(),
    });
  }

  return signals;
}

async function exifSignals(
  visit: Visit,
  repository: VisitRepository,
): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = [];

  for (const image of visit.images) {
    const imageBuffer = await imageBufferFor(image);
    if (!imageBuffer) continue;

    const exif = await readExifMetadata(imageBuffer);
    if (!exif) continue;

    await repository.updateVisitImage({
      ...image,
      metadata: {
        ...image.metadata,
        exif,
      },
    });

    const gpsSignal = exifGpsMismatchSignal(visit, image, exif);
    if (gpsSignal) signals.push(gpsSignal);

    const timestampSignal = exifTimestampAnomalySignal(visit, image, exif);
    if (timestampSignal) signals.push(timestampSignal);
  }

  return signals;
}

async function imageBufferFor(image: VisitImage): Promise<Buffer | null> {
  if (image.localPath) {
    return readLocalImageBuffer(image.localPath);
  }

  const serverUrl = serverUrlFromMetadata(image.metadata);
  if (serverUrl) {
    return downloadImageBuffer(serverUrl);
  }

  if (image.url?.startsWith("http://") || image.url?.startsWith("https://")) {
    return downloadImageBuffer(image.url);
  }

  return null;
}

function serverUrlFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata.serverUrl;
  return typeof value === "string" && value.startsWith("http") ? value : null;
}

async function readLocalImageBuffer(localPath: string): Promise<Buffer> {
  const resolved = path.isAbsolute(localPath) ? localPath : path.join(rootDir, localPath);
  return fs.readFile(resolved);
}

async function downloadImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function perceptualHash(buffer: Buffer): Promise<string | null> {
  try {
    const raw = await sharp(buffer)
      .rotate()
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();

    let bits = "";
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const left = raw[row * 9 + column];
        const right = raw[row * 9 + column + 1];
        bits += left > right ? "1" : "0";
      }
    }

    return bitsToHex(bits);
  } catch {
    return null;
  }
}

function withPerceptualHash(
  metadata: Record<string, unknown> | undefined,
  perceptualHashValue: string,
): Record<string, unknown> {
  const baseMetadata = isRecord(metadata) ? metadata : {};
  const fraudMetadata = isRecord(baseMetadata.fraud) ? baseMetadata.fraud : {};

  return {
    ...baseMetadata,
    fraud: {
      ...fraudMetadata,
      perceptualHash: perceptualHashValue,
      perceptualHashAlgorithm: PERCEPTUAL_HASH_ALGORITHM,
    },
  };
}

function perceptualHashFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!isRecord(metadata) || !isRecord(metadata.fraud)) return null;
  const value = metadata.fraud.perceptualHash;
  if (typeof value !== "string" || !/^[a-f0-9]{16}$/i.test(value)) return null;
  return value.toLowerCase();
}

function bitsToHex(bits: string): string {
  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return hex.padStart(16, "0");
}

function hammingDistanceHex(left: string, right: string): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftNibble = Number.parseInt(left[index] ?? "0", 16);
    const rightNibble = Number.parseInt(right[index] ?? "0", 16);
    distance += bitCount(leftNibble ^ rightNibble);
  }
  return distance;
}

function bitCount(value: number): number {
  let count = 0;
  let remaining = value;
  while (remaining > 0) {
    count += remaining & 1;
    remaining >>= 1;
  }
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readExifMetadata(imageBuffer: Buffer): Promise<ExifMetadata | null> {
  try {
    const raw = await exifr.parse(imageBuffer, {
      tiff: true,
      ifd0: {},
      exif: true,
      gps: true,
      makerNote: false,
      mergeOutput: true,
      reviveValues: true,
    });

    if (!raw || typeof raw !== "object") return null;

    const sourceFields = Object.keys(raw);
    const latitude = numberFrom(raw.latitude ?? raw.GPSLatitude);
    const longitude = numberFrom(raw.longitude ?? raw.GPSLongitude);
    const capturedAt = dateFrom(
      raw.DateTimeOriginal ?? raw.CreateDate ?? raw.DateTime ?? raw.ModifyDate ?? raw["36867"] ?? raw["306"],
    );

    if (latitude === undefined && longitude === undefined && !capturedAt) return null;

    return {
      latitude,
      longitude,
      capturedAt: capturedAt?.toISOString(),
      sourceFields,
    };
  } catch {
    return null;
  }
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function dateFrom(value: unknown): Date | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function gpsMismatchSignal(visit: Visit): FraudSignal | null {
  const { latitude, longitude } = visit.outlet;
  if (
    latitude === undefined ||
    longitude === undefined ||
    visit.checkInLat === undefined ||
    visit.checkInLng === undefined
  ) {
    return null;
  }

  const distanceMeters = haversineMeters(latitude, longitude, visit.checkInLat, visit.checkInLng);
  if (distanceMeters <= config.fraudGpsThresholdMeters) return null;

  return {
    visitId: visit.id,
    type: "GPS_MISMATCH",
    severity: distanceMeters > config.fraudGpsThresholdMeters * 3 ? "HIGH" : "MEDIUM",
    message: "Rep check-in location is far from the outlet location.",
    metadata: {
      distanceMeters: Math.round(distanceMeters),
      thresholdMeters: config.fraudGpsThresholdMeters,
      outletLat: latitude,
      outletLng: longitude,
      checkInLat: visit.checkInLat,
      checkInLng: visit.checkInLng,
    },
    createdAt: nowIso(),
  };
}

function exifGpsMismatchSignal(
  visit: Visit,
  image: VisitImage,
  exif: ExifMetadata,
): FraudSignal | null {
  if (exif.latitude === undefined || exif.longitude === undefined) return null;

  const reference =
    visit.checkInLat !== undefined && visit.checkInLng !== undefined
      ? {
          type: "check_in",
          latitude: visit.checkInLat,
          longitude: visit.checkInLng,
        }
      : visit.outlet.latitude !== undefined && visit.outlet.longitude !== undefined
        ? {
            type: "outlet",
            latitude: visit.outlet.latitude,
            longitude: visit.outlet.longitude,
          }
        : null;

  if (!reference) return null;

  const distanceMeters = haversineMeters(
    reference.latitude,
    reference.longitude,
    exif.latitude,
    exif.longitude,
  );
  if (distanceMeters <= config.fraudExifGpsThresholdMeters) return null;

  return {
    visitId: visit.id,
    type: "EXIF_GPS_MISMATCH",
    severity: distanceMeters > config.fraudExifGpsThresholdMeters * 3 ? "HIGH" : "MEDIUM",
    message: "Image EXIF GPS location does not match the submitted visit location.",
    metadata: {
      imageId: image.id,
      referenceType: reference.type,
      distanceMeters: Math.round(distanceMeters),
      thresholdMeters: config.fraudExifGpsThresholdMeters,
      exifLat: exif.latitude,
      exifLng: exif.longitude,
      referenceLat: reference.latitude,
      referenceLng: reference.longitude,
    },
    createdAt: nowIso(),
  };
}

function exifTimestampAnomalySignal(
  visit: Visit,
  image: VisitImage,
  exif: ExifMetadata,
): FraudSignal | null {
  if (!exif.capturedAt) return null;

  const referenceTimestamp = visit.clientTimestamp ?? visit.serverCreatedAt;
  if (!referenceTimestamp) return null;

  const exifTime = new Date(exif.capturedAt).getTime();
  const referenceTime = new Date(referenceTimestamp).getTime();
  if (!Number.isFinite(exifTime) || !Number.isFinite(referenceTime)) return null;

  const driftHours = Math.abs(referenceTime - exifTime) / (1000 * 60 * 60);
  if (driftHours <= config.fraudExifTimestampDriftHours) return null;

  return {
    visitId: visit.id,
    type: "EXIF_TIMESTAMP_ANOMALY",
    severity: driftHours > config.fraudExifTimestampDriftHours * 2 ? "HIGH" : "MEDIUM",
    message: "Image EXIF capture time is far from the submitted visit timestamp.",
    metadata: {
      imageId: image.id,
      exifCapturedAt: exif.capturedAt,
      referenceTimestamp,
      driftHours: Number(driftHours.toFixed(2)),
      thresholdHours: config.fraudExifTimestampDriftHours,
    },
    createdAt: nowIso(),
  };
}

function timestampAnomalySignal(visit: Visit): FraudSignal | null {
  if (!visit.clientTimestamp || !visit.serverCreatedAt) return null;

  const clientTime = new Date(visit.clientTimestamp).getTime();
  const serverTime = new Date(visit.serverCreatedAt).getTime();
  if (!Number.isFinite(clientTime) || !Number.isFinite(serverTime)) return null;

  const delayHours = (serverTime - clientTime) / (1000 * 60 * 60);
  if (clientTime > serverTime + 5 * 60 * 1000) {
    return {
      visitId: visit.id,
      type: "TIMESTAMP_ANOMALY",
      severity: "MEDIUM",
      message: "Client timestamp is in the future compared with server receipt time.",
      metadata: { clientTimestamp: visit.clientTimestamp, serverCreatedAt: visit.serverCreatedAt },
      createdAt: nowIso(),
    };
  }

  if (delayHours <= config.fraudTimestampDelayHours) return null;

  return {
    visitId: visit.id,
    type: "TIMESTAMP_ANOMALY",
    severity: delayHours > config.fraudTimestampDelayHours * 2 ? "HIGH" : "MEDIUM",
    message: "Visit was synced significantly after the client capture time.",
    metadata: {
      clientTimestamp: visit.clientTimestamp,
      serverCreatedAt: visit.serverCreatedAt,
      delayHours: Number(delayHours.toFixed(2)),
      thresholdHours: config.fraudTimestampDelayHours,
    },
    createdAt: nowIso(),
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusMeters = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
