import { StoreH5Home } from "@/components/store-h5-home";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { countPendingStoreTaskInstances } from "@/lib/store-h5-tasks";

export default async function StoreH5Page() {
  const session = await requireStoreH5PageSession();
  const initialPendingCount = await countPendingStoreTaskInstances(session.userId).catch(() => 0);
  return <StoreH5Home realName={session.realName} storeName={session.storeName} initialPendingCount={initialPendingCount} />;
}
