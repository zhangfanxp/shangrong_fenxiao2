import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPlatformConfig, userHasAnyLoginTag } from "@/lib/platform-config";

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

export async function getLeadH5Session(): Promise<LeadH5Session | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: "lead_h5" });
    const tokenSession = payload as unknown as LeadH5Token;
    if (!tokenSession.userId || tokenSession.channel !== "lead_h5") return null;
    const [user, platform] = await Promise.all([
      db.user.findUnique({ where: { id: tokenSession.userId }, include: { role: true } }),
      getPlatformConfig(),
    ]);
    if (!user || user.status !== "ENABLED" || user.role.status !== "ENABLED") return null;
    if (!userHasAnyLoginTag(user.tags, platform.leadH5LoginTags)) return null;
    const permissions = Array.isArray(user.role.permissions)
      ? user.role.permissions.filter((item): item is string => typeof item === "string")
      : [];
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

export async function requireLeadH5PageSession() {
  const session = await getLeadH5Session();
  if (!session) redirect("/lead_h5/login");
  return session;
}

export const leadH5SessionCookie = {
  name: cookieName,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  },
};
