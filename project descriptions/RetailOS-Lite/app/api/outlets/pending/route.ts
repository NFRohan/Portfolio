import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchOutletCandidates, type OutletSearchCandidate } from "@/lib/outlets";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

const pendingStatuses = ["PENDING_REVIEW", "NEW_OUTLET"] as const;

export async function GET() {
  const authz = await requireApiSession(ROLE_GROUPS.supervisor);
  if (!authz.ok) return authz.response;

  const submissions = await prisma.outletSubmission.findMany({
    where: {
      status: { in: [...pendingStatuses] },
    },
    include: {
      rep: { select: { id: true, name: true, email: true } },
      matchedOutlet: true,
      createdOutlet: { include: { _count: { select: { visits: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const submissionOutletIds = submissions.map((submission) => submission.createdOutletId).filter(Boolean) as string[];
  const orphanedOutlets = await prisma.outlet.findMany({
    where: {
      verificationStatus: "UNVERIFIED",
      id: { notIn: submissionOutletIds.length > 0 ? submissionOutletIds : ["__none__"] },
    },
    include: { _count: { select: { visits: true } } },
    orderBy: { createdAt: "desc" },
  });

  const submissionsWithLiveMatches = await Promise.all(
    submissions.map(async (submission) => {
      const liveMatches = await loadLivePossibleMatches(submission);
      const reviewOutletId = submission.createdOutletId ?? submission.matchedOutletId;
      const bestExternalMatch = liveMatches.find((match) => match.id !== reviewOutletId) ?? null;

      return {
        ...submission,
        matchConfidence: bestExternalMatch?.confidence ?? submission.matchConfidence,
        possibleMatches: liveMatches,
      };
    }),
  );

  return NextResponse.json({
    submissions: submissionsWithLiveMatches,
    orphanedOutlets,
  });
}

function parsePossibleMatches(value: Prisma.JsonValue): OutletSearchCandidate[] {
  return Array.isArray(value) ? value.filter(isOutletSearchCandidate) : [];
}

function isOutletSearchCandidate(value: Prisma.JsonValue): value is OutletSearchCandidate {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return "id" in value;
}

async function loadLivePossibleMatches(submission: {
  submittedName: string;
  submittedLat: number | null;
  submittedLng: number | null;
  possibleMatches: Prisma.JsonValue;
}) {
  if (submission.submittedLat === null || submission.submittedLng === null) {
    return parsePossibleMatches(submission.possibleMatches);
  }

  try {
    const result = await searchOutletCandidates({
      query: submission.submittedName,
      lat: submission.submittedLat,
      lng: submission.submittedLng,
    });
    return result.candidates;
  } catch {
    return parsePossibleMatches(submission.possibleMatches);
  }
}
