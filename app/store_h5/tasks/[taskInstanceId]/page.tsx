import { StoreH5TaskForm } from "@/components/store-h5-task-form";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5TaskPage({ params }: { params: Promise<{ taskInstanceId: string }> }) {
  const session = await requireStoreH5PageSession("store-h5:tasks:view");
  const { taskInstanceId } = await params;
  return <StoreH5TaskForm taskInstanceId={taskInstanceId} draftOwnerId={session.userId} canAttach={hasRolePermission(session.permissions, "store-h5:tasks:attachment")} canSubmitTask={hasRolePermission(session.permissions, "store-h5:tasks:submit")} />;
}
