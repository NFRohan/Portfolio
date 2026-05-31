import type { NextRequest } from "next/server";
import { userEventActor } from "@/lib/event-log";
import { OutletResolutionError, rejectOutlet } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const authz = await requireApiSession(ROLE_GROUPS.supervisor);
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const outlet = await rejectOutlet({
      outletId: id,
      supervisorId: session.user.id,
      submissionId: typeof body.submissionId === "string" ? body.submissionId : null,
    });

    await prisma.eventLog.create({
      data: {
        event: "OUTLET_REJECTED",
        level: "info",
        ...userEventActor(session.user),
        metadata: { outletId: outlet.id, supervisorId: session.user.id, submissionId: body.submissionId ?? null },
      },
    });

    return NextResponse.json(outlet);
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
