import { StoreH5TaskForm } from "@/components/store-h5-task-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

const taskPermission = (action: "view" | "attachment" | "submit") => [`lead-h5:tasks:${action}`, `store-h5:tasks:${action}`];

export default async function LeadH5TaskPage({ params }: { params: Promise<{ taskInstanceId: string }> }) {
  const session = await requireLeadH5PageSession(taskPermission("view"));
  const { taskInstanceId } = await params;
  return <StoreH5TaskForm
    channel="lead-h5"
    taskInstanceId={taskInstanceId}
    draftOwnerId={session.userId}
    canAttach={hasRolePermission(session.permissions, taskPermission("attachment"))}
    canSubmitTask={hasRolePermission(session.permissions, taskPermission("submit"))}
  />;
}
