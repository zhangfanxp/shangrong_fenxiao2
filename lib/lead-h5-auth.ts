import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasRolePermission, hasRolePlatformAccess, type RolePermissionRequirement } from "@/lib/role-permissions";
import { sessionCookieSecure } from "@/lib/session-cookie";

const cookieName = "canyin_lead_h5_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");

type LeadH5Token = { userId: string; channel: "lead_h5" };

export type LeadH5Session = {
  userId: string;
  username: string;
  realName: string;
  permissions: string[];
  brandPermissionIds: string[] | null;
  storePermissionIds: string[] | null;
};

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

export async function createLeadH5Session(userId: string) {
  return new SignJWT({ userId, channel: "lead_h5" } satisfies LeadH5Token)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience("lead_h5")
    .setExpirationTime("8h")
    .sign(secret);
}

export async function getLeadH5Session(requirement?: RolePermissionRequirement): Promise<LeadH5Session | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: "lead_h5" });
    const tokenSession = payload as unknown as LeadH5Token;
    if (!tokenSession.userId || tokenSession.channel !== "lead_h5") return null;
    const user = await db.user.findUnique({ where: { id: tokenSession.userId }, include: { role: true } });
    if (!user || user.status !== "ENABLED" || user.role.status !== "ENABLED" || user.mustChangePassword) return null;
    const permissions = Array.isArray(user.role.permissions)
      ? user.role.permissions.filter((item): item is string => typeof item === "string")
      : [];
    if (!hasRolePlatformAccess(permissions, "lead-h5")) return null;
    if (requirement && !hasRolePermission(permissions, requirement)) return null;
    const configuredBrandIds = jsonStringArray(user.leadH5BrandIds);
    const configuredStoreIds = jsonStringArray(user.leadH5StoreIds);
    const tokenBrandIds = permissions.filter(value => value.startsWith("data:brand:")).map(value => value.slice(11)).filter(Boolean);
    const tokenStoreIds = permissions.filter(value => value.startsWith("data:store:")).map(value => value.slice(11)).filter(Boolean);
    return {
      userId: user.id, username: user.username, realName: user.realName || user.username, permissions,
      brandPermissionIds: configuredBrandIds ?? (tokenBrandIds.length ? tokenBrandIds : null),
      storePermissionIds: configuredStoreIds ?? (tokenStoreIds.length ? tokenStoreIds : null),
    };
  } catch {
    return null;
  }
}

export async function requireLeadH5PageSession(requirement?: RolePermissionRequirement) {
  const session = await getLeadH5Session();
  if (!session) redirect("/lead_h5/login");
  if (requirement && !hasRolePermission(session.permissions, requirement)) redirect("/lead_h5");
  return session;
}

export function leadH5SessionHasPermission(session: LeadH5Session, requirement: RolePermissionRequirement) {
  return hasRolePermission(session.permissions, requirement);
}

export function leadH5ReviewPermission(reviewType: string, action: "view" | "submit") {
  if (reviewType === "FRONT_HALL_AUDIT") return `lead-h5:front-hall:${action}`;
  if (reviewType === "BACK_KITCHEN_AUDIT") return `lead-h5:back-kitchen:${action}`;
  if (reviewType === "STORE_CREDIT_SCORE") return `lead-h5:store-credit:${action}`;
  return null;
}

export const leadH5SessionCookie = {
  name: cookieName,
  options: {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  },
};
