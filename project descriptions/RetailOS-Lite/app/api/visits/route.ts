import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { userEventActor } from "@/lib/event-log";
import { numberOrNull, OutletResolutionError, resolveOutletForVisit } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { serializeVisitDetail, serializeVisitListItem } from "@/lib/visits";
import { NextResponse } from "next/server";

const visitDetailInclude = {
  outlet: true,
  rep: { select: { id: true, name: true, email: true } },
  images: true,
  aiResult: true,
  fraudSignals: true,
} satisfies Prisma.VisitInclude;

export async function GET(request: NextRequest) {
  const authz = await requireApiSession();
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const isSupervisor = session.user.role === "SUPERVISOR" || session.user.role === "ADMIN";
  const searchParams = request.nextUrl.searchParams;
  const paginated = wantsPaginatedVisitLogs(searchParams);
  const baseWhere = visitLogWhere(searchParams, {
    isSupervisor,
    userId: session.user.id,
  });
  const where = paginated ? withRiskStatus(baseWhere, searchParams.get("status")) : baseWhere;

  if (paginated) {
    const page = positiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(100, positiveInt(searchParams.get("pageSize"), 10));
    const [total, facets] = await Promise.all([
      prisma.visit.count({ where }),
      visitLogFacets(baseWhere),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const visits = await prisma.visit.findMany({
      where,
      include: visitListInclude,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });

    return NextResponse.json({
      items: visits.map(serializeVisitListItem),
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
      facets,
    });
  }

  const visits = await prisma.visit.findMany({
    where,
    include: visitListInclude,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(visits.map(serializeVisitListItem));
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, { bucket: "visit-create", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const authz = await requireApiSession(ROLE_GROUPS.rep);
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const body = await request.json();
  try {
    if (typeof body.clientVisitId === "string" && body.clientVisitId.trim()) {
      const existingVisit = await prisma.visit.findUnique({
        where: { clientVisitId: body.clientVisitId },
        include: visitDetailInclude,
      });
      if (existingVisit) {
        if (existingVisit.repId !== session.user.id) {
          return NextResponse.json({ error: "Client visit id already belongs to another rep" }, { status: 409 });
        }
        return NextResponse.json(serializeVisitDetail(existingVisit));
      }
    }

    const checkInLat = numberOrNull(body.checkInLat);
    const checkInLng = numberOrNull(body.checkInLng);
    const outletResolution = await resolveOutletForVisit({
      repId: session.user.id,
      outletId: body.outletId,
      outletName: body.outletName,
      checkInLat,
      checkInLng,
      forceNewOutlet: body.forceNewOutlet,
    });

    const visit = await prisma.visit.create({
      data: {
        clientVisitId: body.clientVisitId,
        outletId: outletResolution.outlet.id,
        repId: session.user.id,
        checkInLat,
        checkInLng,
        clientTimestamp: body.clientTimestamp ? new Date(body.clientTimestamp) : new Date(),
        notes: body.notes,
        status: "PENDING",
      },
      include: visitDetailInclude,
    });

    if (outletResolution.created) {
      await prisma.outlet.update({
        where: { id: outletResolution.outlet.id },
        data: { createdByVisitId: visit.id },
      });
    }

    if (outletResolution.outletSubmission) {
      await prisma.outletSubmission.update({
        where: { id: outletResolution.outletSubmission.id },
        data: { visitId: visit.id },
      });

      await prisma.eventLog.create({
        data: {
          visitId: visit.id,
          event: "OUTLET_SUBMISSION_RESOLVED",
          level: "info",
          ...userEventActor(session.user),
          metadata: {
            outletId: outletResolution.outlet.id,
            outletName: outletResolution.outlet.name,
            matchedBy: outletResolution.matchedBy,
            outletSubmissionId: outletResolution.outletSubmission.id,
            outletSubmissionStatus: outletResolution.outletSubmission.status,
          },
        },
      });
    }

    return NextResponse.json(serializeVisitDetail(visit), { status: 201 });
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

function wantsPaginatedVisitLogs(searchParams: URLSearchParams): boolean {
  return ["page", "pageSize", "q", "status", "from", "to", "scope"].some((key) => searchParams.has(key));
}

function visitLogWhere(
  searchParams: URLSearchParams,
  session: { isSupervisor: boolean; userId: string },
): Prisma.VisitWhereInput {
  const where: Prisma.VisitWhereInput = {};
  const scope = searchParams.get("scope");

  if (!session.isSupervisor || scope === "mine") {
    where.repId = session.userId;
  }

  const createdAt: Prisma.DateTimeFilter = {};
  const from = parseDateParam(searchParams.get("from"));
  const to = parseDateParam(searchParams.get("to"), true);
  if (from) createdAt.gte = from;
  if (to) createdAt.lt = to;
  if (createdAt.gte || createdAt.lt) {
    where.createdAt = createdAt;
  }

  const q = searchParams.get("q")?.trim();
  if (q) {
    where.OR = [
      { outlet: { name: { contains: q, mode: "insensitive" } } },
      { outlet: { code: { contains: q, mode: "insensitive" } } },
      { rep: { name: { contains: q, mode: "insensitive" } } },
      { rep: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

const visitListInclude = {
  outlet: true,
  rep: { select: { id: true, name: true, email: true } },
  images: true,
  aiResult: true,
  fraudSignals: true,
} satisfies Prisma.VisitInclude;

async function visitLogFacets(baseWhere: Prisma.VisitWhereInput) {
  const highRiskWhere = withRiskStatus(baseWhere, "high-risk");
  const reviewNeededWhere = withRiskStatus(baseWhere, "review-needed");
  const flaggedWhere = withRiskStatus(baseWhere, "flagged");
  const safeWhere = withRiskStatus(baseWhere, "safe");
  const [all, safe, flagged, reviewNeeded, highRisk] = await Promise.all([
    prisma.visit.count({ where: baseWhere }),
    prisma.visit.count({ where: safeWhere }),
    prisma.visit.count({ where: flaggedWhere }),
    prisma.visit.count({ where: reviewNeededWhere }),
    prisma.visit.count({ where: highRiskWhere }),
  ]);

  return { all, safe, flagged, reviewNeeded, highRisk };
}

function withRiskStatus(baseWhere: Prisma.VisitWhereInput, rawStatus: string | null): Prisma.VisitWhereInput {
  const status = rawStatus?.toLowerCase();
  if (!status || status === "all" || status === "all-logs") return baseWhere;
  if (status === "safe") return andWhere(baseWhere, safeRiskWhere());
  if (status === "flagged") return andWhere(baseWhere, { NOT: safeRiskWhere() });
  if (status === "review" || status === "review-needed") return andWhere(baseWhere, reviewRiskWhere());
  if (status === "high-risk" || status === "high") return andWhere(baseWhere, highRiskWhere());
  return baseWhere;
}

function highRiskWhere(): Prisma.VisitWhereInput {
  return {
    OR: [
      { fraudSignals: { some: { type: { not: "IMAGE_HASHED" }, severity: "HIGH" } } },
      { aiResult: { is: { complianceScore: { lt: 50 } } } },
    ],
  };
}

function reviewRiskWhere(): Prisma.VisitWhereInput {
  return {
    OR: [
      { status: { in: ["FLAGGED", "FAILED"] } },
      { fraudSignals: { some: { type: { not: "IMAGE_HASHED" } } } },
      { aiResult: { is: { complianceScore: { lt: 70 } } } },
      { aiResult: { is: { posm: { path: ["detected"], equals: false } } } },
      { aiResult: { is: { outcomeSummary: { path: ["posm", "detected"], equals: false } } } },
    ],
  };
}

function safeRiskWhere(): Prisma.VisitWhereInput {
  return {
    AND: [
      { status: { notIn: ["FLAGGED", "FAILED"] } },
      { fraudSignals: { none: { type: { not: "IMAGE_HASHED" } } } },
      {
        OR: [
          { aiResult: null },
          { aiResult: { is: { complianceScore: { gte: 70 } } } },
        ],
      },
      {
        NOT: {
          OR: [
            { aiResult: { is: { posm: { path: ["detected"], equals: false } } } },
            { aiResult: { is: { outcomeSummary: { path: ["posm", "detected"], equals: false } } } },
          ],
        },
      },
    ],
  };
}

function andWhere(...clauses: Prisma.VisitWhereInput[]): Prisma.VisitWhereInput {
  return { AND: clauses };
}

function positiveInt(raw: string | null, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}

function parseDateParam(raw: string | null, endExclusive = false): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

  return parsed;
}
