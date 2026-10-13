import { StoreH5StoreAliases } from "@/components/store-h5-store-aliases";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5StoreAliasesPage() {
  const session = await requireStoreH5PageSession("store-h5:my-store:aliases:view");
  return <StoreH5StoreAliases canEdit={hasRolePermission(session.permissions, "store-h5:my-store:aliases:edit")} />;
}
