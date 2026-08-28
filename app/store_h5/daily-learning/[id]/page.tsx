import { StoreH5DailyLearningDetail } from "@/components/store-h5-daily-learning-detail";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5DailyLearningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStoreH5PageSession();
  return <StoreH5DailyLearningDetail planId={(await params).id} />;
}
