import { LeadH5Home } from "@/components/lead-h5-home";
import { hasPendingDailyLearningTask } from "@/lib/daily-learning";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";
import { countPendingStoreTaskInstances } from "@/lib/store-h5-tasks";

export default async function LeadH5HomePage() {
  const session = await requireLeadH5PageSession();
  const [initialDailyLearningPending, initialPendingCount] = await Promise.all([
    hasRolePermission(session.permissions, "lead-h5:daily-learning:view") ? hasPendingDailyLearningTask(session.userId).catch(() => false) : false,
    hasRolePermission(session.permissions, ["lead-h5:tasks:query", "store-h5:tasks:query"]) ? countPendingStoreTaskInstances(session.userId).catch(() => 0) : 0,
  ]);
  return <LeadH5Home realName={session.realName || session.username} permissions={session.permissions} initialDailyLearningPending={initialDailyLearningPending} initialPendingCount={initialPendingCount} />;
}
