import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasRolePermission, hasRolePlatformAccess, type RolePermissionRequirement } from "@/lib/role-permissions";
import { jsonIdArray, resolveUserStores } from "@/lib/user-store-scope";
import { sessionCookieSecure } from "@/lib/session-cookie";
import { taskRecordParticipantWhere } from "@/lib/task-record-access";

const cookieName = "canyin_store_h5_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");

type StoreH5Token = { userId: string; channel: "store_h5" };

export type StoreH5Session = {
  userId: string;
  username: string;
  realName: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  labels: string[];
  storeId: string | null;
  storeName: string | null;
  brandId: string | null;
  brandName: string | null;
  stores: { id: string; name: string; brandId: string; brandName: string }[];
};

export async function createStoreH5Session(userId: string) {
  return new SignJWT({ userId, channel: "store_h5" } satisfies StoreH5Token)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience("store_h5")
    .setExpirationTime("8h")
    .sign(secret);
}

export async function getStoreH5Session(requirement?: RolePermissionRequirement): Promise<StoreH5Session | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: "store_h5" });
    const session = payload as unknown as StoreH5Token;
    if (!session.userId || session.channel !== "store_h5") return null;
    const user = await db.user.findUnique({
      where: { id: session.userId },
      include: {
        role: { select: { id: true, name: true, status: true, permissions: true } },
        personnelProfile: {
          select: {
            status: true,
            deletedAt: true,
            store: { select: { id: true, name: true, brandId: true, brand: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!user || user.status !== "ENABLED" || user.role.status !== "ENABLED" || user.mustChangePassword) return null;
    const permissions = Array.isArray(user.role.permissions) ? user.role.permissions.filter((item): item is string => typeof item === "string") : [];
    if (!hasRolePlatformAccess(permissions, "store-h5")) return null;
    if (requirement && !hasRolePermission(permissions, requirement)) return null;
    const configuredStoreIds = jsonIdArray(user.leadH5StoreIds);
    const linkedStores = await db.store.findMany({
      where: {
        operationStatus: { not: "CLOSED" },
        OR: [
          ...(configuredStoreIds.length ? [{ id: { in: configuredStoreIds } }] : []),
          { managerUserId: user.id },
          { chefUserId: user.id },
          { supervisorUserId: user.id },
          { taskRecords: { some: taskRecordParticipantWhere(user.id) } },
        ],
      },
      include: { brand: true },
    });
    const effectiveStoreIds = [...new Set([...configuredStoreIds, ...linkedStores.map(store => store.id)])];
    const resolvedStores = resolveUserStores({ ...user, leadH5StoreIds: effectiveStoreIds }, new Map(linkedStores.map(store => [store.id, store])));
    const primaryStore = resolvedStores[0] || null;
    return {
      userId: user.id,
      username: user.username,
      realName: user.realName || user.username,
      roleId: user.role.id,
      roleName: user.role.name,
      permissions,
      labels: (user.tags || "").split(/[|｜]/).map(tag => tag.trim()).filter(Boolean),
      storeId: primaryStore?.id || null,
      storeName: primaryStore?.name || null,
      brandId: primaryStore?.brand.id || null,
      brandName: primaryStore?.brand.name || null,
      stores: resolvedStores.map(store => ({ id: store.id, name: store.name, brandId: store.brand.id, brandName: store.brand.name })),
    };
  } catch {
    return null;
  }
}

export async function requireStoreH5PageSession(requirement?: RolePermissionRequirement) {
  const session = await getStoreH5Session();
  if (!session) redirect("/store_h5/login");
  if (requirement && !hasRolePermission(session.permissions, requirement)) redirect("/store_h5");
  return session;
}

export function storeH5SessionHasPermission(session: StoreH5Session, requirement: RolePermissionRequirement) {
  return hasRolePermission(session.permissions, requirement);
}

export const storeH5SessionCookie = {
  name: cookieName,
  options: {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  },
};
