import { StoreH5StoreCost } from "@/components/store-h5-store-cost";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5StoreCostPage() {
  const session = await requireStoreH5PageSession("store-h5:my-store:cost:view");
  return <StoreH5StoreCost canEdit={hasRolePermission(session.permissions, "store-h5:my-store:cost:edit")} />;
}
