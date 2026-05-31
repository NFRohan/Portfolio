import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/rbac";
import { serializeVisitDetail } from "@/lib/visits";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const authz = await requireApiSession();
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const { id } = await params;
  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      outlet: true,
      rep: { select: { id: true, name: true, email: true } },
      images: true,
      aiResult: true,
      fraudSignals: true,
    },
  });

  if (!visit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isSupervisor = session.user.role === "SUPERVISOR" || session.user.role === "ADMIN";
  if (!isSupervisor && visit.repId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(serializeVisitDetail(visit));
}
