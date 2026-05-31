import { randomUUID } from "node:crypto";
import { Prisma, type Outlet, type OutletSubmission } from "@prisma/client";
import { notifyOutletApprovalNeeded } from "@/lib/outlet-approval-alerts";
import { prisma } from "@/lib/prisma";

const AUTO_OUTLET_CODE_PREFIX = "AUTO";
const OUTLET_SEARCH_RADIUS_METERS = 100;
const AUTO_MATCH_RADIUS_METERS = 75;
const GEO_SCORE_DECAY_METERS = 300;
const AUTO_MATCH_CONFIDENCE = 0.9;
const REVIEW_MATCH_CONFIDENCE = 0.6;
const AUTO_MATCH_MARGIN = 0.12;
const NAME_WEIGHT = 0.6;
const GEO_WEIGHT = 0.4;

type OutletWithAliases = Prisma.OutletGetPayload<{
  include: {
    aliases: true;
    _count: { select: { visits: true } };
  };
}>;

export class OutletResolutionError extends Error {
  status = 400;
}

export type OutletSearchCandidate = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: string;
  distanceMeters: number;
  nameSimilarity: number;
  geoSimilarity: number;
  confidence: number;
  visitCount: number;
  matchedAlias: string | null;
};

export type OutletSearchResult = {
  query: string;
  normalizedQuery: string;
  radiusMeters: number;
  candidates: OutletSearchCandidate[];
  autoMatch: OutletSearchCandidate | null;
  canCreateNew: boolean;
};

export type OutletResolution = {
  outlet: Outlet;
  outletSubmission: OutletSubmission | null;
  created: boolean;
  matchedBy: "legacy_id" | "rep_selected" | "auto_match" | "new_outlet";
};

export type OutletMergeResult = {
  outlet: Outlet & { _count: { visits: number } };
  sourceOutletId: string;
  targetOutletId: string;
  affectedVisitIds: string[];
  affectedReportIds: string[];
  movedVisits: number;
  retargetedReports: number;
  copiedAliases: number;
  updatedSubmissions: number;
};

export async function resolveOutletForVisit({
  repId,
  outletId,
  outletName,
  checkInLat,
  checkInLng,
  forceNewOutlet,
}: {
  repId: string;
  outletId?: unknown;
  outletName?: unknown;
  checkInLat?: unknown;
  checkInLng?: unknown;
  forceNewOutlet?: unknown;
}): Promise<OutletResolution> {
  return submitOutletSelection({
    repId,
    submittedName: outletName,
    submittedLat: checkInLat,
    submittedLng: checkInLng,
    selectedOutletId: outletId,
    forceNewOutlet: Boolean(forceNewOutlet),
  });
}

export async function searchOutletCandidates({
  query,
  lat,
  lng,
  radiusMeters = OUTLET_SEARCH_RADIUS_METERS,
}: {
  query: unknown;
  lat: unknown;
  lng: unknown;
  radiusMeters?: number;
}): Promise<OutletSearchResult> {
  const submittedName = parseOutletName(query);
  const normalizedQuery = normalizeOutletName(submittedName);
  const submittedLat = requiredNumber(lat, "GPS latitude is required for outlet search.");
  const submittedLng = requiredNumber(lng, "GPS longitude is required for outlet search.");
  const outlets = await loadOutletSearchPool({
    normalizedQuery,
    submittedLat,
    submittedLng,
    radiusMeters,
  });

  const candidates = outlets
    .map((outlet) => scoreOutletCandidate(outlet, normalizedQuery, submittedLat, submittedLng))
    .filter((candidate): candidate is OutletSearchCandidate => Boolean(candidate))
    .filter((candidate) => candidate.distanceMeters <= radiusMeters)
    .sort((a, b) => b.confidence - a.confidence || a.distanceMeters - b.distanceMeters)
    .slice(0, 8);

  const autoMatch = autoMatchCandidate(candidates);

  return {
    query: submittedName,
    normalizedQuery,
    radiusMeters,
    candidates,
    autoMatch,
    canCreateNew: true,
  };
}

async function loadOutletSearchPool({
  normalizedQuery,
  submittedLat,
  submittedLng,
  radiusMeters,
}: {
  normalizedQuery: string;
  submittedLat: number;
  submittedLng: number;
  radiusMeters: number;
}): Promise<OutletWithAliases[]> {
  const dbIds = await loadOutletSearchIdsFromPostgres({
    normalizedQuery,
    submittedLat,
    submittedLng,
    radiusMeters,
  });

  if (dbIds.length > 0) {
    const outlets = await prisma.outlet.findMany({
      where: { id: { in: dbIds } },
      include: {
        aliases: true,
        _count: { select: { visits: true } },
      },
    });
    const order = new Map(dbIds.map((id, index) => [id, index]));
    return outlets.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  return prisma.outlet.findMany({
    where: { verificationStatus: { not: "REJECTED" } },
    include: {
      aliases: true,
      _count: { select: { visits: true } },
    },
    take: 500,
  });
}

async function loadOutletSearchIdsFromPostgres({
  normalizedQuery,
  submittedLat,
  submittedLng,
  radiusMeters,
}: {
  normalizedQuery: string;
  submittedLat: number;
  submittedLng: number;
  radiusMeters: number;
}): Promise<string[]> {
  try {
    const latitudeDelta = radiusMeters / 111_320;
    const longitudeDelta = radiusMeters / (111_320 * Math.max(0.1, Math.cos(toRadians(submittedLat))));
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      WITH candidate_scores AS (
        SELECT
          o.id,
          (
            6371000 * 2 * asin(
              sqrt(
                power(sin(radians((o.latitude - ${submittedLat}) / 2)), 2) +
                cos(radians(${submittedLat})) *
                cos(radians(o.latitude)) *
                power(sin(radians((o.longitude - ${submittedLng}) / 2)), 2)
              )
            )
          ) AS distance_meters,
          greatest(
            similarity(coalesce(o."normalizedName", ''), ${normalizedQuery}),
            coalesce(max(similarity(coalesce(a."normalizedAlias", ''), ${normalizedQuery})), 0)
          ) AS name_similarity
        FROM "Outlet" o
        LEFT JOIN "OutletAlias" a ON a."outletId" = o.id
        WHERE o."verificationStatus" != 'REJECTED'
          AND o.latitude IS NOT NULL
          AND o.longitude IS NOT NULL
          AND o.latitude BETWEEN ${submittedLat - latitudeDelta} AND ${submittedLat + latitudeDelta}
          AND o.longitude BETWEEN ${submittedLng - longitudeDelta} AND ${submittedLng + longitudeDelta}
        GROUP BY o.id
      )
      SELECT id
      FROM candidate_scores
      WHERE distance_meters <= ${radiusMeters}
      ORDER BY name_similarity DESC, distance_meters ASC
      LIMIT 80
    `;
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}

export async function submitOutletSelection({
  repId,
  submittedName,
  submittedLat,
  submittedLng,
  selectedOutletId,
  forceNewOutlet = false,
}: {
  repId: string;
  submittedName?: unknown;
  submittedLat?: unknown;
  submittedLng?: unknown;
  selectedOutletId?: unknown;
  forceNewOutlet?: boolean;
}): Promise<OutletResolution> {
  const explicitOutletId = stringOrNull(selectedOutletId);
  const selectedOutlet = explicitOutletId
    ? await prisma.outlet.findUnique({
        where: { id: explicitOutletId },
        include: { aliases: true, _count: { select: { visits: true } } },
      })
    : null;

  if (explicitOutletId && !selectedOutlet) {
    throw new OutletResolutionError("Selected outlet was not found.");
  }

  const fallbackName = selectedOutlet?.name;
  const name = parseOutletName(typeof submittedName === "string" && submittedName.trim() ? submittedName : fallbackName);
  const normalizedName = normalizeOutletName(name);
  const lat = numberOrNull(submittedLat);
  const lng = numberOrNull(submittedLng);
  const possibleMatches = lat !== null && lng !== null ? await searchOutletCandidates({ query: name, lat, lng }) : null;

  if (selectedOutlet) {
    const selectedCandidate =
      possibleMatches?.candidates.find((candidate) => candidate.id === selectedOutlet.id) ??
      (lat !== null && lng !== null ? scoreOutletCandidate(selectedOutlet, normalizedName, lat, lng) : null);

    if (selectedCandidate && selectedCandidate.distanceMeters > OUTLET_SEARCH_RADIUS_METERS) {
      throw new OutletResolutionError("Selected outlet is not near the current GPS location.");
    }

    const submission = await prisma.outletSubmission.create({
      data: {
        repId,
        submittedName: name,
        normalizedName,
        submittedLat: lat,
        submittedLng: lng,
        matchedOutletId: selectedOutlet.id,
        matchConfidence: selectedCandidate?.confidence ?? null,
        status:
          selectedCandidate && isAutoConfidence(selectedCandidate, possibleMatches?.candidates ?? [])
            ? "AUTO_MATCHED"
            : "PENDING_REVIEW",
        possibleMatches: toPossibleMatchesJson(possibleMatches?.candidates ?? []),
      },
    });

    if (submission.status === "AUTO_MATCHED") {
      await createOutletAlias(selectedOutlet.id, name, submission.id);
    } else if (submission.status === "PENDING_REVIEW") {
      queueOutletApprovalAlert(repId, name, submission.status);
    }

    return {
      outlet: selectedOutlet,
      outletSubmission: submission,
      created: false,
      matchedBy: submission.status === "AUTO_MATCHED" ? "auto_match" : "rep_selected",
    };
  }

  if (possibleMatches?.autoMatch && !forceNewOutlet) {
    const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: possibleMatches.autoMatch.id } });
    const submission = await prisma.outletSubmission.create({
      data: {
        repId,
        submittedName: name,
        normalizedName,
        submittedLat: lat,
        submittedLng: lng,
        matchedOutletId: outlet.id,
        matchConfidence: possibleMatches.autoMatch.confidence,
        status: "AUTO_MATCHED",
        possibleMatches: toPossibleMatchesJson(possibleMatches.candidates),
      },
    });
    await createOutletAlias(outlet.id, name, submission.id);
    return { outlet, outletSubmission: submission, created: false, matchedBy: "auto_match" };
  }

  const topCandidate = possibleMatches?.candidates[0] ?? null;
  const outlet = await prisma.outlet.create({
    data: {
      name,
      normalizedName,
      code: await generateAutoOutletCode(),
      latitude: lat,
      longitude: lng,
      verificationStatus: "UNVERIFIED",
      createdById: repId,
    },
  });

  const submission = await prisma.outletSubmission.create({
    data: {
      repId,
      submittedName: name,
      normalizedName,
      submittedLat: lat,
      submittedLng: lng,
      matchedOutletId: topCandidate?.id ?? null,
      createdOutletId: outlet.id,
      matchConfidence: topCandidate?.confidence ?? null,
      status: topCandidate && topCandidate.confidence >= REVIEW_MATCH_CONFIDENCE ? "PENDING_REVIEW" : "NEW_OUTLET",
      possibleMatches: toPossibleMatchesJson(possibleMatches?.candidates ?? []),
    },
  });

  if (submission.status === "NEW_OUTLET" || submission.status === "PENDING_REVIEW") {
    queueOutletApprovalAlert(repId, name, submission.status);
  }

  return { outlet, outletSubmission: submission, created: true, matchedBy: "new_outlet" };
}

export async function approveOutlet({
  outletId,
  supervisorId,
  submissionId,
}: {
  outletId: string;
  supervisorId: string;
  submissionId?: string | null;
}) {
  const outlet = await prisma.outlet.update({
    where: { id: outletId },
    data: {
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
      approvedById: supervisorId,
    },
    include: { _count: { select: { visits: true } } },
  });

  if (submissionId) {
    const submission = await prisma.outletSubmission.update({
      where: { id: submissionId },
      data: {
        status: "APPROVED",
        matchedOutletId: outlet.id,
        reviewedById: supervisorId,
        reviewedAt: new Date(),
      },
    });
    await createOutletAlias(outlet.id, submission.submittedName, submission.id);
  }

  return outlet;
}

export async function rejectOutlet({
  outletId,
  supervisorId,
  submissionId,
}: {
  outletId: string;
  supervisorId: string;
  submissionId?: string | null;
}) {
  const submission = submissionId
    ? await prisma.outletSubmission.findUnique({ where: { id: submissionId } })
    : await prisma.outletSubmission.findFirst({ where: { createdOutletId: outletId }, orderBy: { createdAt: "desc" } });

  if (submission) {
    await prisma.outletSubmission.update({
      where: { id: submission.id },
      data: {
        status: "REJECTED",
        reviewedById: supervisorId,
        reviewedAt: new Date(),
      },
    });
  }

  const shouldRejectOutlet = !submission || submission.createdOutletId === outletId;
  if (!shouldRejectOutlet) {
    return prisma.outlet.findUniqueOrThrow({
      where: { id: outletId },
      include: { _count: { select: { visits: true } } },
    });
  }

  return prisma.outlet.update({
    where: { id: outletId },
    data: {
      verificationStatus: "REJECTED",
      approvedById: supervisorId,
    },
    include: { _count: { select: { visits: true } } },
  });
}

export async function mergeOutlet({
  sourceOutletId,
  targetOutletId,
  supervisorId,
  submissionId,
}: {
  sourceOutletId: string;
  targetOutletId: string;
  supervisorId: string;
  submissionId?: string | null;
}) {
  if (sourceOutletId === targetOutletId) {
    throw new OutletResolutionError("Source and target outlets must be different.");
  }

  return prisma.$transaction(async (tx): Promise<OutletMergeResult> => {
    const [sourceOutlet, targetOutlet] = await Promise.all([
      tx.outlet.findUnique({ where: { id: sourceOutletId } }),
      tx.outlet.findUnique({ where: { id: targetOutletId } }),
    ]);

    if (!sourceOutlet || !targetOutlet) {
      throw new OutletResolutionError("Could not find both outlets for merge.");
    }

    if (targetOutlet.verificationStatus === "REJECTED") {
      throw new OutletResolutionError("Cannot merge into a rejected outlet.");
    }

    const [affectedVisits, affectedReports, sourceAliases] = await Promise.all([
      tx.visit.findMany({ where: { outletId: sourceOutletId }, select: { id: true } }),
      tx.visitReport.findMany({
        where: { outletId: sourceOutletId },
        select: { id: true, visitId: true, title: true, retrievalText: true },
      }),
      tx.outletAlias.findMany({ where: { outletId: sourceOutletId } }),
    ]);
    const affectedVisitIds = affectedVisits.map((visit) => visit.id);
    const affectedReportIds = affectedReports.map((report) => report.visitId);

    const movedVisits = await tx.visit.updateMany({
      where: { outletId: sourceOutletId },
      data: { outletId: targetOutletId },
    });

    for (const report of affectedReports) {
      await tx.visitReport.update({
        where: { id: report.id },
        data: {
          outletId: targetOutletId,
          title: retargetReportTitle(report.title, targetOutlet.name),
          retrievalText: retargetReportText(report.retrievalText, {
            sourceOutlet,
            targetOutlet,
          }),
        },
      });
    }

    const updatedSubmissions = await tx.outletSubmission.updateMany({
      where: {
        OR: [
          { createdOutletId: sourceOutletId },
          { matchedOutletId: sourceOutletId },
        ],
      },
      data: {
        status: "MERGED",
        matchedOutletId: targetOutletId,
        reviewedById: supervisorId,
        reviewedAt: new Date(),
      },
    });

    if (submissionId) {
      await tx.outletSubmission.update({
        where: { id: submissionId },
        data: {
          status: "MERGED",
          matchedOutletId: targetOutletId,
          reviewedById: supervisorId,
          reviewedAt: new Date(),
        },
      });
    }

    await tx.outlet.update({
      where: { id: sourceOutletId },
      data: {
        verificationStatus: "REJECTED",
        approvedById: supervisorId,
      },
    });

    const aliasInputs = [
      { aliasName: sourceOutlet.name, sourceSubmissionId: submissionId ?? null },
      ...sourceAliases.map((alias) => ({
        aliasName: alias.aliasName,
        sourceSubmissionId: alias.sourceSubmissionId,
      })),
    ];
    let copiedAliases = 0;
    for (const alias of aliasInputs) {
      const result = await upsertOutletAlias(tx, targetOutletId, alias.aliasName, alias.sourceSubmissionId ?? null);
      if (result) copiedAliases += 1;
    }

    const outlet = await tx.outlet.findUniqueOrThrow({
      where: { id: targetOutletId },
      include: { _count: { select: { visits: true } } },
    });

    return {
      outlet,
      sourceOutletId,
      targetOutletId,
      affectedVisitIds,
      affectedReportIds,
      movedVisits: movedVisits.count,
      retargetedReports: affectedReports.length,
      copiedAliases,
      updatedSubmissions: updatedSubmissions.count,
    };
  });
}

export function normalizeOutletName(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function scoreOutletCandidate(
  outlet: OutletWithAliases,
  normalizedQuery: string,
  submittedLat: number,
  submittedLng: number,
): OutletSearchCandidate | null {
  if (outlet.latitude === null || outlet.longitude === null) return null;

  const distanceMeters = haversineMeters(submittedLat, submittedLng, outlet.latitude, outlet.longitude);
  const aliasScores = outlet.aliases.map((alias) => ({
    alias: alias.aliasName,
    score: fuzzyNameSimilarity(normalizedQuery, alias.normalizedAlias),
  }));
  const canonicalScore = fuzzyNameSimilarity(normalizedQuery, outlet.normalizedName ?? normalizeOutletName(outlet.name));
  const bestAlias = aliasScores.sort((a, b) => b.score - a.score)[0] ?? null;
  const nameSimilarity = Math.max(canonicalScore, bestAlias?.score ?? 0);
  const geoSimilarity = Math.max(0, 1 - distanceMeters / GEO_SCORE_DECAY_METERS);
  const confidence = roundScore(nameSimilarity * NAME_WEIGHT + geoSimilarity * GEO_WEIGHT);

  return {
    id: outlet.id,
    name: outlet.name,
    code: outlet.code,
    address: outlet.address,
    latitude: outlet.latitude,
    longitude: outlet.longitude,
    verificationStatus: outlet.verificationStatus,
    distanceMeters: Math.round(distanceMeters),
    nameSimilarity: roundScore(nameSimilarity),
    geoSimilarity: roundScore(geoSimilarity),
    confidence,
    visitCount: outlet._count.visits,
    matchedAlias: bestAlias && bestAlias.score > canonicalScore ? bestAlias.alias : null,
  };
}

function autoMatchCandidate(candidates: OutletSearchCandidate[]): OutletSearchCandidate | null {
  const [topCandidate, secondCandidate] = candidates;
  if (!topCandidate) return null;
  return isAutoConfidence(topCandidate, candidates, secondCandidate) ? topCandidate : null;
}

function isAutoConfidence(
  candidate: OutletSearchCandidate,
  candidates: OutletSearchCandidate[],
  secondCandidate = candidates.find((item) => item.id !== candidate.id),
): boolean {
  const margin = candidate.confidence - (secondCandidate?.confidence ?? 0);
  return (
    candidate.confidence >= AUTO_MATCH_CONFIDENCE &&
    candidate.distanceMeters <= AUTO_MATCH_RADIUS_METERS &&
    margin >= AUTO_MATCH_MARGIN
  );
}

function fuzzyNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const tokenUnion = new Set([...aTokens, ...bTokens]);
  const tokenIntersection = [...aTokens].filter((token) => bTokens.has(token));
  const tokenScore = tokenUnion.size === 0 ? 0 : tokenIntersection.length / tokenUnion.size;
  const trigramScore = diceCoefficient(trigrams(a), trigrams(b));

  return Math.max(tokenScore * 0.95, trigramScore);
}

function trigrams(value: string): string[] {
  const padded = `  ${value}  `;
  const grams: string[] = [];
  for (let index = 0; index < padded.length - 2; index += 1) {
    grams.push(padded.slice(index, index + 3));
  }
  return grams;
}

function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bCounts = new Map<string, number>();
  for (const gram of b) {
    bCounts.set(gram, (bCounts.get(gram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const gram of a) {
    const count = bCounts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      bCounts.set(gram, count - 1);
    }
  }

  return (2 * overlap) / (a.length + b.length);
}

function parseOutletName(value: unknown): string {
  if (typeof value !== "string") {
    throw new OutletResolutionError("Shop name is required.");
  }

  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw new OutletResolutionError("Shop name must be at least 2 characters.");
  }

  if (name.length > 120) {
    throw new OutletResolutionError("Shop name must be 120 characters or less.");
  }

  return name;
}

async function generateAutoOutletCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `${AUTO_OUTLET_CODE_PREFIX}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const existing = await prisma.outlet.findUnique({ where: { code } });
    if (!existing) return code;
  }

  throw new OutletResolutionError("Could not generate a unique outlet code.");
}

async function createOutletAlias(outletId: string, aliasName: string, sourceSubmissionId: string | null) {
  return upsertOutletAlias(prisma, outletId, aliasName, sourceSubmissionId);
}

async function upsertOutletAlias(
  client: Pick<typeof prisma, "outletAlias">,
  outletId: string,
  aliasName: string,
  sourceSubmissionId: string | null,
) {
  const normalizedAlias = normalizeOutletName(aliasName);
  if (!normalizedAlias) return null;

  return client.outletAlias.upsert({
    where: {
      outletId_normalizedAlias: {
        outletId,
        normalizedAlias,
      },
    },
    update: {
      aliasName,
      sourceSubmissionId,
    },
    create: {
      outletId,
      aliasName,
      normalizedAlias,
      sourceSubmissionId,
    },
  });
}

function toPossibleMatchesJson(candidates: OutletSearchCandidate[]): Prisma.InputJsonValue {
  return candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    code: candidate.code,
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    verificationStatus: candidate.verificationStatus,
    distanceMeters: candidate.distanceMeters,
    nameSimilarity: candidate.nameSimilarity,
    geoSimilarity: candidate.geoSimilarity,
    confidence: candidate.confidence,
    visitCount: candidate.visitCount,
    matchedAlias: candidate.matchedAlias,
  }));
}

function requiredNumber(value: unknown, message: string): number {
  const parsed = numberOrNull(value);
  if (parsed === null) {
    throw new OutletResolutionError(message);
  }
  return parsed;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function retargetReportTitle(title: string, targetOutletName: string): string {
  return title.replace(/^.+? visit compliance/i, `${targetOutletName} visit compliance`);
}

function retargetReportText(
  retrievalText: string,
  {
    sourceOutlet,
    targetOutlet,
  }: {
    sourceOutlet: Outlet;
    targetOutlet: Outlet;
  },
): string {
  const lines = retrievalText.split("\n");
  const nextLines = lines.map((line) => {
    if (line.startsWith("Outlet:")) return `Outlet: ${targetOutlet.name}`;
    if (line.startsWith("Outlet ID:")) return `Outlet ID: ${targetOutlet.id}`;
    return line;
  });
  const mergeNote = `Merged Duplicate Outlet: ${sourceOutlet.name} (${sourceOutlet.id})`;
  if (!nextLines.some((line) => line === mergeNote)) {
    nextLines.push(mergeNote);
  }
  return nextLines.join("\n");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function queueOutletApprovalAlert(
  repId: string,
  storeName: string,
  submissionStatus: "NEW_OUTLET" | "PENDING_REVIEW",
) {
  void notifyOutletApprovalNeeded({ repId, storeName, submissionStatus }).catch((error) => {
    console.error("[outlet-approval-alerts] Failed:", error);
  });
}
