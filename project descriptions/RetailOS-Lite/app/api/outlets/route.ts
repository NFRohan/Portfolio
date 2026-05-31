import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { notifyOutletApprovalNeeded } from "@/lib/outlet-approval-alerts";
import { normalizeOutletName, numberOrNull } from "@/lib/outlets";
import { parseOutletVerificationStatus } from "@/lib/outlet-types";
import { prisma } from "@/lib/prisma";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authz = await requireApiSession();
  if (!authz.ok) return authz.response;

  const status = parseOutletVerificationStatus(request.nextUrl.searchParams.get("status"));
  const where: Prisma.OutletWhereInput = status ? { verificationStatus: status } : {};
  const outlets = await prisma.outlet.findMany({
    where,
    include: { _count: { select: { visits: true } } },
    orderBy: status === "UNVERIFIED" ? { createdAt: "desc" } : { name: "asc" },
  });
  return NextResponse.json(outlets);
}

export async function POST(request: NextRequest) {
  const authz = await requireApiSession(ROLE_GROUPS.authenticated);
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

  if (!name || !code) {
    return NextResponse.json({ error: "Name and code are required." }, { status: 400 });
  }

  const latitude = numberOrNull(body.latitude);
  const longitude = numberOrNull(body.longitude);

  if (session.user.role === "REP" && (latitude === null || longitude === null)) {
    return NextResponse.json(
      { error: "Store latitude and longitude are required." },
      { status: 400 },
    );
  }

  const isSupervisorOrAdmin =
    session.user.role === "SUPERVISOR" || session.user.role === "ADMIN";

  try {
    const outlet = await prisma.outlet.create({
      data: {
        name,
        normalizedName: normalizeOutletName(name),
        code,
        address: typeof body.address === "string" ? body.address.trim() || null : null,
        latitude,
        longitude,
        verificationStatus: isSupervisorOrAdmin ? "VERIFIED" : "UNVERIFIED",
        verifiedAt: isSupervisorOrAdmin ? new Date() : null,
        createdById: session.user.role === "REP" ? session.user.id : null,
      },
    });

    if (session.user.role === "REP") {
      void notifyOutletApprovalNeeded({ repId: session.user.id, storeName: name }).catch((error) => {
        console.error("[outlet-approval-alerts] Failed:", error);
      });
    }

    return NextResponse.json(outlet, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `Outlet code "${code}" already exists.` }, { status: 409 });
    }
    throw err;
  }
}
