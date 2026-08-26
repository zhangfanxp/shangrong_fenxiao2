import type { Prisma } from "@prisma/client";

export type LeadH5DataAccess = {
  permissions: string[];
  brandPermissionIds: string[] | null;
  storePermissionIds: string[] | null;
};

export function leadH5StoreScopeInfo(access: LeadH5DataAccess) {
  const hasExplicitScope = access.brandPermissionIds !== null || access.storePermissionIds !== null;
  const all = !hasExplicitScope && (access.permissions.includes("*") || access.permissions.includes("data:all"));
  return {
    all,
    brandIds: access.brandPermissionIds || [],
    storeIds: access.storePermissionIds || [],
  };
}

export function leadH5StoreDataScope(access: LeadH5DataAccess) {
  const { all, brandIds, storeIds } = leadH5StoreScopeInfo(access);
  if (all) return {};
  const where: Prisma.StoreWhereInput = {};
  if (brandIds.length) where.brandId = { in: brandIds };
  if (storeIds.length) where.id = { in: storeIds };
  return where;
}
