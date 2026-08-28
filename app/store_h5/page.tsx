import { StoreH5Home } from "@/components/store-h5-home";
import { hasPendingDailyLearningTask } from "@/lib/daily-learning";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { countPendingStoreTaskInstances } from "@/lib/store-h5-tasks";

export default async function StoreH5Page() {
  const session = await requireStoreH5PageSession();
  const [initialPendingCount, initialDailyLearningPending] = await Promise.all([
    countPendingStoreTaskInstances(session.userId).catch(() => 0),
    hasPendingDailyLearningTask(session.userId).catch(() => false),
  ]);
  return <StoreH5Home realName={session.realName} storeName={session.storeName} initialPendingCount={initialPendingCount} initialDailyLearningPending={initialDailyLearningPending} />;
}
