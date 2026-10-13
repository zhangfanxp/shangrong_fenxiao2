import { StoreH5EmployeeList } from "@/components/store-h5-employee-list";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5EmployeesPage() {
  const session = await requireStoreH5PageSession("store-h5:my-store:employees:query");
  return <StoreH5EmployeeList canView={hasRolePermission(session.permissions, "store-h5:my-store:employees:view")} canCreate={hasRolePermission(session.permissions, "store-h5:my-store:employees:create")} />;
}
