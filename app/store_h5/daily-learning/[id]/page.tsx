import { StoreH5DailyLearningDetail } from "@/components/store-h5-daily-learning-detail";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5DailyLearningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStoreH5PageSession("store-h5:daily-learning:view");
  return <StoreH5DailyLearningDetail planId={(await params).id} canRecord={hasRolePermission(session.permissions, "store-h5:daily-learning:record")} />;
}
