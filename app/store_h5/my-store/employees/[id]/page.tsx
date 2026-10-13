import { StoreH5EmployeeDetail } from "@/components/store-h5-employee-detail";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStoreH5PageSession("store-h5:my-store:employees:view");
  return <StoreH5EmployeeDetail personnelId={(await params).id} canResign={hasRolePermission(session.permissions, "store-h5:my-store:employees:resign")} />;
}
