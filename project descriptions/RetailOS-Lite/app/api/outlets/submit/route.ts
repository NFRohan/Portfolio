import type { NextRequest } from "next/server";
import { OutletResolutionError, submitOutletSelection } from "@/lib/outlets";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiSession, ROLE_GROUPS } from "@/lib/rbac";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, { bucket: "outlet-submit", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const authz = await requireApiSession(ROLE_GROUPS.rep);
  if (!authz.ok) return authz.response;
  const { session } = authz;

  const body = await request.json();
  try {
    const resolution = await submitOutletSelection({
      repId: session.user.id,
      submittedName: body.submittedName ?? body.outletName ?? body.name,
      submittedLat: body.submittedLat ?? body.checkInLat ?? body.lat,
      submittedLng: body.submittedLng ?? body.checkInLng ?? body.lng,
      selectedOutletId: body.selectedOutletId ?? body.outletId,
      forceNewOutlet: Boolean(body.forceNewOutlet),
    });

    return NextResponse.json({
      outlet: resolution.outlet,
      outletSubmission: resolution.outletSubmission,
      created: resolution.created,
      matchedBy: resolution.matchedBy,
    });
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
