import { StoreH5MyStoreMenu } from "@/components/store-h5-my-store-menu";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5MyStorePage() {
  const session = await requireStoreH5PageSession("store-h5:my-store:view");
  const visibleKeys = [
    hasRolePermission(session.permissions, "store-h5:my-store:employees:query") ? "employees" : null,
    hasRolePermission(session.permissions, "store-h5:my-store:cost:view") ? "cost" : null,
    hasRolePermission(session.permissions, "store-h5:my-store:aliases:view") ? "aliases" : null,
  ].filter((value): value is string => Boolean(value));
  return <StoreH5MyStoreMenu storeName={session.storeName} visibleKeys={visibleKeys} />;
}
