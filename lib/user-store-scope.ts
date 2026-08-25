export type UserScopeStore = { id: string; name: string; brandId: string; brand: { id: string; name: string } };

type UserWithStoreScope = {
  leadH5BrandIds: unknown;
  leadH5StoreIds: unknown;
  personnelProfile?: { status: string; deletedAt: Date | null; store: UserScopeStore } | null;
};

export function jsonIdArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
}

export function resolveUserStores(user: UserWithStoreScope, configuredStoreById: Map<string, UserScopeStore>, requiredBrandIds?: readonly string[]) {
  const stores = new Map<string, UserScopeStore>();
  const profile = user.personnelProfile;
  if (profile && profile.status === "ACTIVE" && !profile.deletedAt) stores.set(profile.store.id, profile.store);
  for (const storeId of jsonIdArray(user.leadH5StoreIds)) {
    const store = configuredStoreById.get(storeId);
    if (store) stores.set(store.id, store);
  }
  const allowedBrandIds = jsonIdArray(user.leadH5BrandIds);
  return [...stores.values()].filter(store =>
    (!allowedBrandIds.length || allowedBrandIds.includes(store.brandId))
    && (!requiredBrandIds?.length || requiredBrandIds.includes(store.brandId)));
}
