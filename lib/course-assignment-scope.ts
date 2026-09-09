import type { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonIdArray } from "@/lib/user-store-scope";

export type AssignmentAccess = { brandIds: string[] | null; storeIds: string[] | null };
export type AssignmentScope = { brandId: string; storeId: string; brandName: string; storeName: string };
export const assignmentUserSelect = {
  id: true, username: true, realName: true, leadH5BrandIds: true, leadH5StoreIds: true,
  role: { select: { name: true } },
  personnelProfile: { select: { status: true, deletedAt: true, storeId: true } },
} satisfies Prisma.UserSelect;
type SnapshotUser = Prisma.UserGetPayload<{ select: typeof assignmentUserSelect }>;
type ScopeStore = { id: string; name: string; brandId: string; brand: { name: string } };

export async function assignmentAccess(session: Session): Promise<AssignmentAccess> {
  if (session.permissions.includes("*") || session.role === "SUPER_ADMIN") return { brandIds: null, storeIds: null };
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { leadH5BrandIds: true, leadH5StoreIds: true } });
  if (!user) return { brandIds: [], storeIds: [] };
  const configured = (value: unknown, prefix: string) => {
    if (Array.isArray(value)) return jsonIdArray(value);
    const ids = session.permissions.filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length));
    return ids.length ? ids : null;
  };
  return { brandIds: configured(user.leadH5BrandIds, "data:brand:"), storeIds: configured(user.leadH5StoreIds, "data:store:") };
}

export function scopeIsAllowed(scopes: AssignmentScope[], access: AssignmentAccess) {
  return scopes.length > 0 && scopes.every(scope =>
    (access.brandIds === null || access.brandIds.includes(scope.brandId)) &&
    (access.storeIds === null || access.storeIds.includes(scope.storeId)));
}

export function snapshotUserScopes(user: SnapshotUser, stores: ScopeStore[], brands: { id: string; name: string }[]): AssignmentScope[] {
  const brandIds = jsonIdArray(user.leadH5BrandIds);
  const storeIds = new Set(jsonIdArray(user.leadH5StoreIds));
  if (user.personnelProfile?.storeId && user.personnelProfile.status === "ACTIVE" && !user.personnelProfile.deletedAt) storeIds.add(user.personnelProfile.storeId);
  if (storeIds.size) {
    // Unknown/deleted store IDs are retained as unscoped sentinels, never broadened.
    return [...storeIds].map(id => stores.find(store => store.id === id)).filter(store => !store || !brandIds.length || brandIds.includes(store.brandId))
      .map(store => store ? { brandId: store.brandId, storeId: store.id, brandName: store.brand.name, storeName: store.name } : { brandId: "", storeId: "", brandName: "", storeName: "" });
  }
  if (brandIds.length) return brandIds.map(id => ({ brandId: id, storeId: "", brandName: brands.find(brand => brand.id === id)?.name || "", storeName: "" }));
  return [{ brandId: "", storeId: "", brandName: "", storeName: "" }];
}

export async function assignmentScopeCatalog(client: Prisma.TransactionClient = db) {
  const [stores, brands] = await Promise.all([
    client.store.findMany({ select: { id: true, name: true, brandId: true, brand: { select: { name: true } } } }),
    client.brand.findMany({ select: { id: true, name: true } }),
  ]);
  return { stores, brands };
}

export function assignmentBatchScope(access: AssignmentAccess): Prisma.CourseAssignmentBatchWhereInput {
  if (access.brandIds === null && access.storeIds === null) return {};
  const allowed: Prisma.CourseAssignmentUserScopeWhereInput = {
    ...(access.brandIds !== null ? { brandId: { in: access.brandIds } } : {}),
    ...(access.storeIds !== null ? { storeId: { in: access.storeIds } } : {}),
  };
  // Entire batches are hidden when any recipient is outside scope: counts,
  // fuzzy matching and whole-batch operations cannot leak cross-scope users.
  return { users: { some: {}, every: { scopes: { some: allowed, none: { NOT: allowed } } } } };
}

export async function assignmentSelectableUserScope(access: AssignmentAccess): Promise<Prisma.UserWhereInput> {
  if (access.brandIds === null && access.storeIds === null) return {};
  const [{ stores, brands }, users] = await Promise.all([
    assignmentScopeCatalog(), db.user.findMany({ select: assignmentUserSelect }),
  ]);
  return { id: { in: users.filter(user => scopeIsAllowed(snapshotUserScopes(user, stores, brands), access)).map(user => user.id) } };
}
