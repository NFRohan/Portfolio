import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CORRELATION_HEADER, REQUEST_ID_HEADER, createCorrelationId } from "@/lib/observability/correlation";

type SessionRole = "REP" | "SUPERVISOR" | "ADMIN";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET });
  const { pathname } = request.nextUrl;

  const isRepRoute = pathname.startsWith("/rep");
  const isSupervisorRoute = pathname.startsWith("/supervisor");
  const isLoginRoute = pathname === "/login";
  const isProtected = isRepRoute || isSupervisorRoute;

  const correlationId =
    request.headers.get(CORRELATION_HEADER) ||
    request.headers.get(REQUEST_ID_HEADER) ||
    createCorrelationId("web");

  if (isLoginRoute && token) {
    return NextResponse.redirect(new URL(homeForRole(token.role as SessionRole | undefined), request.url));
  }

  if (!isProtected) return nextWithCorrelation(request, correlationId);

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as SessionRole | undefined;

  if (isRepRoute && role !== "REP") {
    return NextResponse.redirect(new URL("/supervisor", request.url));
  }

  if (isSupervisorRoute && role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/rep/visits", request.url));
  }

  return nextWithCorrelation(request, correlationId);
}

function nextWithCorrelation(request: NextRequest, correlationId: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);
  requestHeaders.set(REQUEST_ID_HEADER, correlationId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CORRELATION_HEADER, correlationId);
  response.headers.set(REQUEST_ID_HEADER, correlationId);
  return response;
}

function homeForRole(role: SessionRole | undefined): string {
  if (role === "REP") return "/rep/visits";
  if (role === "SUPERVISOR" || role === "ADMIN") return "/supervisor";
  return "/login";
}

export const config = {
  matcher: ["/login", "/rep/:path*", "/supervisor/:path*"],
};
