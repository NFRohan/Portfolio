import type { NextRequest } from "next/server";
import { OutletResolutionError, searchOutletCandidates } from "@/lib/outlets";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiSession } from "@/lib/rbac";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, { bucket: "outlet-search", limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const authz = await requireApiSession();
  if (!authz.ok) return authz.response;

  const body = await request.json();
  try {
    const result = await searchOutletCandidates({
      query: body.query ?? body.outletName ?? body.name,
      lat: body.lat ?? body.checkInLat,
      lng: body.lng ?? body.checkInLng,
      radiusMeters: typeof body.radiusMeters === "number" ? body.radiusMeters : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OutletResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
