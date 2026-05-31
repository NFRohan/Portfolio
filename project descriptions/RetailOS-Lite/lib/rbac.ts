import type { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const ROLE_GROUPS = {
  authenticated: ["REP", "SUPERVISOR", "ADMIN"],
  rep: ["REP"],
  supervisor: ["SUPERVISOR", "ADMIN"],
  admin: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type AuthorizedSession = Session & {
  user: Session["user"] & { id: string; role: Role };
};

type AuthResult =
  | { ok: true; session: AuthorizedSession }
  | { ok: false; response: NextResponse };

export function hasRole(role: Role | undefined, allowed: readonly Role[]): boolean {
  return Boolean(role && allowed.includes(role));
}

export async function requireApiSession(allowed: readonly Role[] = ROLE_GROUPS.authenticated): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!hasRole(session.user.role, allowed)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session: session as AuthorizedSession };
}

export function homeForRole(role: Role | undefined): string {
  if (role === "REP") return "/rep/visits";
  if (role === "SUPERVISOR" || role === "ADMIN") return "/supervisor";
  return "/login";
}
