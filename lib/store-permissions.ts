export type StoreListAction = "query" | "create" | "view" | "edit" | "cost-view" | "cost-edit";

export function canStoreListAction(permissions: string[], action: StoreListAction) {
  const permission = action.startsWith("cost-") ? `stores:cost:${action.slice(5)}` : `stores:list:${action}`;
  return permissions.includes("*") || permissions.includes("stores:list:view") || permissions.includes(permission);
}
