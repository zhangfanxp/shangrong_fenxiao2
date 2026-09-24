import { StoreH5TaskList } from "@/components/store-h5-task-list";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

const taskPermission = (action: "query" | "view") => [`lead-h5:tasks:${action}`, `store-h5:tasks:${action}`];

export default async function LeadH5TasksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireLeadH5PageSession(taskPermission("query"));
  const { status } = await searchParams;
  return <StoreH5TaskList channel="lead-h5" initialStatus={status === "completed" ? "completed" : status === "overdue" ? "overdue" : "pending"} canView={hasRolePermission(session.permissions, taskPermission("view"))} />;
}
