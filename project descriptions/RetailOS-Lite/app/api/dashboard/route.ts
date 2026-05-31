import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { serializeVisitListItem } from "@/lib/visits";
import { NextResponse } from "next/server";

type DailyAggregateRow = {
  date: string | Date;
  visits: number | bigint;
  avgComplianceScore: number | bigint | null;
  scoredVisits: number | bigint;
  posmPresent: number | bigint;
  posmMissing: number | bigint;
  fraudDetections: number | bigint;
  safeVisits: number | bigint;
};

type NormalizedDailyAggregate = {
  date: string;
  visits: number;
  avgComplianceScore: number;
  scoredVisits: number;
  posmPresent: number;
  posmMissing: number;
  fraudDetections: number;
  safeVisits: number;
  posmCompliancePct: number;
  qualityScore: number;
};

export async function GET(request: NextRequest) {
  const authz = await requireApiSession(ROLE_GROUPS.supervisor);
  if (!authz.ok) return authz.response;

  const rangeDays = rangeDaysFrom(request.nextUrl.searchParams.get("range"));
  const timeZone = timeZoneFrom(request.nextUrl.searchParams.get("tz"));
  const todayKey = dateKeyInTimeZone(new Date(), timeZone);
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const yesterdayKey = addDaysToDateKey(todayKey, -1);
  const currentStartKey = addDaysToDateKey(tomorrowKey, -rangeDays);
  const previousStartKey = addDaysToDateKey(currentStartKey, -rangeDays);

  const [trend, previousTrend] = await Promise.all([
    dailyAggregates(currentStartKey, tomorrowKey, timeZone),
    dailyAggregates(previousStartKey, currentStartKey, timeZone),
  ]);

  const [flaggedCount, outletsBelowThreshold, recentVisitsRaw, needsAttentionRaw] = await Promise.all([
    prisma.visit.count({ where: { status: "FLAGGED" } }),
    countOutletsBelowThreshold(60, currentStartKey, tomorrowKey, timeZone),
    prisma.visit.findMany({
      include: visitListInclude,
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.visit.findMany({
      where: dashboardAttentionWhere(),
      include: visitListInclude,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const recentVisits = recentVisitsRaw.map(serializeVisitListItem);
  const needsAttention = needsAttentionRaw
    .map(serializeVisitListItem)
    .sort((a, b) => (a.complianceScore ?? 100) - (b.complianceScore ?? 100))
    .slice(0, 5);
  const currentSummary = summarizeTrend(trend);
  const previousSummary = summarizeTrend(previousTrend);
  const today = trend.find((point) => point.date === todayKey);
  const yesterday = trend.find((point) => point.date === yesterdayKey);
  const visitsToday = today?.visits ?? 0;
  const visitsYesterday = yesterday?.visits ?? 0;

  const summary = {
    rangeDays,
    timeZone,
    visitsToday,
    visitsDeltaPct: percentChange(visitsToday, visitsYesterday),
    avgComplianceScore: currentSummary.avgComplianceScore,
    previousAvgComplianceScore: previousSummary.avgComplianceScore,
    avgComplianceDeltaPct: percentChange(currentSummary.avgComplianceScore, previousSummary.avgComplianceScore),
    missingPosmCount: currentSummary.posmMissing,
    fraudDetectionCount: currentSummary.fraudDetections,
    flaggedFraudCount: currentSummary.fraudDetections,
    posmCompliancePct: currentSummary.posmCompliancePct,
    posmComplianceDeltaPct: currentSummary.posmCompliancePct - previousSummary.posmCompliancePct,
    qualityScore: currentSummary.qualityScore,
    qualityDeltaPct: percentChange(currentSummary.qualityScore, previousSummary.qualityScore),
  };

  return NextResponse.json({
    visitsToday,
    avgComplianceScore: summary.avgComplianceScore,
    flaggedCount,
    outletsBelowThreshold,
    visits: recentVisits,
    needsAttention,
    recentVisits,
    summary,
    trend: trend.map((point) => ({
      date: point.date,
      visits: point.visits,
      avgComplianceScore: point.avgComplianceScore,
      posmCompliancePct: point.posmCompliancePct,
      qualityScore: point.qualityScore,
      fraudDetections: point.fraudDetections,
      missingPosm: point.posmMissing,
    })),
  });
}

const visitListInclude = {
  outlet: true,
  rep: { select: { id: true, name: true, email: true } },
  images: true,
  aiResult: true,
  fraudSignals: true,
} satisfies Prisma.VisitInclude;

function dashboardAttentionWhere(): Prisma.VisitWhereInput {
  return {
    OR: [
      { status: { in: ["FLAGGED", "FAILED"] } },
      { fraudSignals: { some: { type: { not: "IMAGE_HASHED" } } } },
      { aiResult: { is: { complianceScore: { lt: 60 } } } },
    ],
  };
}

async function countOutletsBelowThreshold(
  threshold: number,
  startDate: string,
  endExclusiveDate: string,
  timeZone: string,
) {
  const rows = await prisma.$queryRaw<Array<{ count: number | bigint }>>`
    SELECT count(DISTINCT v."outletId")::int AS count
    FROM "Visit" v
    JOIN "AIResult" ar ON ar."visitId" = v.id
    WHERE ar."complianceScore" < ${threshold}
      AND ((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date >= ${startDate}::date
      AND ((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date < ${endExclusiveDate}::date
  `;

  return Number(rows[0]?.count ?? 0);
}

async function dailyAggregates(
  startDate: string,
  endExclusiveDate: string,
  timeZone: string,
): Promise<NormalizedDailyAggregate[]> {
  const rows = await prisma.$queryRaw<DailyAggregateRow[]>`
    WITH days AS (
      SELECT generate_series(${startDate}::date, (${endExclusiveDate}::date - interval '1 day'), interval '1 day')::date AS day
    ),
    visit_daily AS (
      SELECT
        ((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date AS day,
        count(*)::int AS visits,
        round(avg(ar."complianceScore"))::int AS "avgComplianceScore",
        count(*) FILTER (WHERE ar."complianceScore" IS NOT NULL)::int AS "scoredVisits",
        count(*) FILTER (WHERE ar."posm"->>'detected' = 'true')::int AS "posmPresent",
        count(*) FILTER (WHERE ar."posm"->>'detected' = 'false')::int AS "posmMissing",
        count(*) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM "FraudSignal" hf
            WHERE hf."visitId" = v.id
              AND hf."type" <> 'IMAGE_HASHED'
          )
          AND v.status <> 'FLAGGED'
          AND (ar."complianceScore" IS NULL OR ar."complianceScore" >= 70)
          AND COALESCE(ar."posm"->>'detected', 'true') <> 'false'
        )::int AS "safeVisits"
      FROM "Visit" v
      LEFT JOIN "AIResult" ar ON ar."visitId" = v.id
      WHERE ((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date >= ${startDate}::date
        AND ((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date < ${endExclusiveDate}::date
      GROUP BY day
    ),
    fraud_daily AS (
      SELECT
        ((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date AS day,
        count(f.id)::int AS "fraudDetections"
      FROM "Visit" v
      JOIN "FraudSignal" f ON f."visitId" = v.id
      WHERE ((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date >= ${startDate}::date
        AND ((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone})::date < ${endExclusiveDate}::date
        AND f."type" <> 'IMAGE_HASHED'
      GROUP BY day
    )
    SELECT
      d.day::text AS date,
      COALESCE(vd.visits, 0)::int AS visits,
      COALESCE(vd."avgComplianceScore", 0)::int AS "avgComplianceScore",
      COALESCE(vd."scoredVisits", 0)::int AS "scoredVisits",
      COALESCE(vd."posmPresent", 0)::int AS "posmPresent",
      COALESCE(vd."posmMissing", 0)::int AS "posmMissing",
      COALESCE(fd."fraudDetections", 0)::int AS "fraudDetections",
      COALESCE(vd."safeVisits", 0)::int AS "safeVisits"
    FROM days d
    LEFT JOIN visit_daily vd ON vd.day = d.day
    LEFT JOIN fraud_daily fd ON fd.day = d.day
    ORDER BY d.day ASC
  `;

  return rows.map((row) => {
    const visits = toNumber(row.visits);
    const fraudDetections = toNumber(row.fraudDetections);
    const safeVisits = toNumber(row.safeVisits);
    const posmPresent = toNumber(row.posmPresent);
    const posmMissing = toNumber(row.posmMissing);
    const knownPosm = posmPresent + posmMissing;

    return {
      date: normalizeDateKey(row.date),
      visits,
      avgComplianceScore: toNumber(row.avgComplianceScore),
      scoredVisits: toNumber(row.scoredVisits),
      posmPresent,
      posmMissing,
      fraudDetections,
      safeVisits,
      posmCompliancePct: knownPosm > 0 ? Math.round((posmPresent / knownPosm) * 100) : 0,
      qualityScore: visits > 0 ? Math.max(0, Math.round((safeVisits / visits) * 100)) : 0,
    };
  });
}

function summarizeTrend(points: NormalizedDailyAggregate[]) {
  const visits = sum(points, "visits");
  const scoredVisits = sum(points, "scoredVisits");
  const weightedCompliance = points.reduce((total, point) => total + point.avgComplianceScore * point.scoredVisits, 0);
  const posmPresent = sum(points, "posmPresent");
  const posmMissing = sum(points, "posmMissing");
  const knownPosm = posmPresent + posmMissing;
  const fraudDetections = sum(points, "fraudDetections");
  const safeVisits = sum(points, "safeVisits");

  return {
    visits,
    avgComplianceScore: scoredVisits > 0 ? Math.round(weightedCompliance / scoredVisits) : 0,
    posmMissing,
    fraudDetections,
    posmCompliancePct: knownPosm > 0 ? Math.round((posmPresent / knownPosm) * 100) : 0,
    qualityScore: visits > 0 ? Math.max(0, Math.round((safeVisits / visits) * 100)) : 0,
  };
}

function sum(points: NormalizedDailyAggregate[], key: keyof NormalizedDailyAggregate): number {
  return points.reduce((total, point) => total + Number(point[key] ?? 0), 0);
}

function rangeDaysFrom(raw: string | null): number {
  const parsed = raw?.match(/^(\d+)d$/)?.[1] ?? raw ?? "7";
  const days = Number(parsed);
  if (!Number.isFinite(days)) return 7;
  return Math.min(90, Math.max(1, Math.trunc(days)));
}

function timeZoneFrom(raw: string | null): string {
  const candidate = raw?.trim() || process.env.DASHBOARD_TIME_ZONE || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function toNumber(value: number | bigint | null): number {
  if (value === null) return 0;
  return Number(value);
}

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function normalizeDateKey(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}
