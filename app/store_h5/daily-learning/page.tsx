import { StoreH5DailyLearningList } from "@/components/store-h5-daily-learning-list";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5DailyLearningPage() {
  const session = await requireStoreH5PageSession("store-h5:daily-learning:query");
  return <StoreH5DailyLearningList canView={hasRolePermission(session.permissions, "store-h5:daily-learning:view")} />;
}
