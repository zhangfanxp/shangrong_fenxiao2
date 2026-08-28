import { StoreH5DailyLearningList } from "@/components/store-h5-daily-learning-list";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5DailyLearningPage() {
  await requireStoreH5PageSession();
  return <StoreH5DailyLearningList />;
}
