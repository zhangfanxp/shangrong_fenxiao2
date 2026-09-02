import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { canAccessPath, type PermissionRequirement, hasPermission } from "@/lib/access-control";
import { db } from "@/lib/db";

const cookieName = "canyin_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");

export type Session = { userId: string; username: string; realName: string; role: string; permissions: string[] };

export async function createSession(session: Session) {
  return new SignJWT(session).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(secret);
}

export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret); const tokenSession = payload as unknown as Session;
    if (!tokenSession.userId) return null;
    const user = await db.user.findUnique({ where: { id: tokenSession.userId }, include: { role: true } });
    if (!user || user.status !== "ENABLED" || user.role.status !== "ENABLED") return null;
    const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
    return { userId: user.id, username: user.username, realName: user.realName, role: user.role.code, permissions };
  } catch { return null; }
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/lead_pc/login");
  return session;
}

export async function requirePageAccess(pathname: string) {
  const session = await requireSession();
  if (!canAccessPath(pathname, session.permissions)) redirect("/lead_pc/forbidden");
  return session;
}

export function sessionHasPermission(session: Session, requirement: PermissionRequirement) {
  return hasPermission(session.permissions, requirement);
}

export async function requireApiSession() {
  return getSession();
}

export const sessionCookie = { name: cookieName, options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 8 } };
