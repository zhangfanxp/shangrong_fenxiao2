import { StoreH5Home } from "@/components/store-h5-home";
import { hasPendingDailyLearningTask } from "@/lib/daily-learning";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";
import { countPendingStoreTaskInstances } from "@/lib/store-h5-tasks";

export default async function StoreH5Page() {
  const session = await requireStoreH5PageSession();
  const [initialPendingCount, initialDailyLearningPending] = await Promise.all([
    hasRolePermission(session.permissions, "store-h5:tasks:query") ? countPendingStoreTaskInstances(session.userId).catch(() => 0) : 0,
    hasRolePermission(session.permissions, "store-h5:daily-learning:query") ? hasPendingDailyLearningTask(session.userId).catch(() => false) : false,
  ]);
  return <StoreH5Home realName={session.realName} storeName={session.storeName} permissions={session.permissions} initialPendingCount={initialPendingCount} initialDailyLearningPending={initialDailyLearningPending} canAccessDailyAttendance={Boolean(session.storeId) && hasRolePermission(session.permissions, "store-h5:daily-attendance:view")} />;
}
