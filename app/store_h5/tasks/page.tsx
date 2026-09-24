import { StoreH5TaskList } from "@/components/store-h5-task-list";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5TasksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireStoreH5PageSession("store-h5:tasks:query");
  const { status } = await searchParams;
  return <StoreH5TaskList initialStatus={status === "completed" ? "completed" : status === "overdue" ? "overdue" : "pending"} canView={hasRolePermission(session.permissions, "store-h5:tasks:view")} />;
}
