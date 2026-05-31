import type { NextRequest } from "next/server";
import { userEventActor } from "@/lib/event-log";
import { mergeOutlet, OutletResolutionError } from "@/lib/outlets";
import { enqueueVisitReportIndex } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const authz = await requireApiSession(ROLE_GROUPS.supervisor);
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const { id } = await params;
  const body = await request.json();
  if (typeof body.targetOutletId !== "string" || !body.targetOutletId.trim()) {
    return NextResponse.json({ error: "targetOutletId is required." }, { status: 400 });
  }

  try {
    const result = await mergeOutlet({
      sourceOutletId: id,
      targetOutletId: body.targetOutletId,
      supervisorId: session.user.id,
      submissionId: typeof body.submissionId === "string" ? body.submissionId : null,
    });
    const reindexResults = await Promise.allSettled(
      result.affectedReportIds.map((visitId) => enqueueVisitReportIndex(visitId, `outlet_merge_${id}`)),
    );
    const reindexQueued = reindexResults.filter((item) => item.status === "fulfilled").length;

    await prisma.eventLog.create({
      data: {
        event: "OUTLET_MERGED",
        level: "info",
        ...userEventActor(session.user),
        metadata: {
          sourceOutletId: id,
          targetOutletId: result.outlet.id,
          supervisorId: session.user.id,
          submissionId: body.submissionId ?? null,
          affectedVisitIds: result.affectedVisitIds,
          affectedReportIds: result.affectedReportIds,
          movedVisits: result.movedVisits,
          retargetedReports: result.retargetedReports,
          copiedAliases: result.copiedAliases,
          updatedSubmissions: result.updatedSubmissions,
          reindexQueued,
          reindexFailed: reindexResults.length - reindexQueued,
        },
      },
    });

    return NextResponse.json({
      outlet: result.outlet,
      merge: {
        sourceOutletId: result.sourceOutletId,
        targetOutletId: result.targetOutletId,
        movedVisits: result.movedVisits,
        retargetedReports: result.retargetedReports,
        copiedAliases: result.copiedAliases,
        updatedSubmissions: result.updatedSubmissions,
        reindexQueued,
      },
    });
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
