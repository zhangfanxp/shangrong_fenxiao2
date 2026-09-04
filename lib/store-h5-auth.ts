import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPlatformConfig, userHasAnyLoginTag } from "@/lib/platform-config";
import { jsonIdArray, resolveUserStores } from "@/lib/user-store-scope";
import { sessionCookieSecure } from "@/lib/session-cookie";

const cookieName = "canyin_store_h5_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");

type StoreH5Token = { userId: string; channel: "store_h5" };

export type StoreH5Session = {
  userId: string;
  username: string;
  realName: string;
  roleId: string;
  roleName: string;
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

export async function getStoreH5Session(): Promise<StoreH5Session | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: "store_h5" });
    const session = payload as unknown as StoreH5Token;
    if (!session.userId || session.channel !== "store_h5") return null;
    const [user, platform] = await Promise.all([
      db.user.findUnique({
        where: { id: session.userId },
        include: {
          role: { select: { id: true, name: true, status: true } },
          personnelProfile: {
            select: {
              status: true,
              deletedAt: true,
              store: { select: { id: true, name: true, brandId: true, brand: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
      getPlatformConfig(),
    ]);
    if (!user || user.status !== "ENABLED" || user.role.status !== "ENABLED") return null;
    if (!userHasAnyLoginTag(user.tags, platform.storeH5LoginTags)) return null;
    const configuredStoreIds = jsonIdArray(user.leadH5StoreIds);
    const configuredStores = configuredStoreIds.length ? await db.store.findMany({ where: { id: { in: configuredStoreIds } }, include: { brand: true } }) : [];
    const resolvedStores = resolveUserStores(user, new Map(configuredStores.map(store => [store.id, store])));
    const primaryStore = resolvedStores[0] || null;
    return {
      userId: user.id,
      username: user.username,
      realName: user.realName || user.username,
      roleId: user.role.id,
      roleName: user.role.name,
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

export async function requireStoreH5PageSession() {
  const session = await getStoreH5Session();
  if (!session) redirect("/store_h5/login");
  return session;
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
