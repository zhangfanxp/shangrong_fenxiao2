import { StoreH5TaskForm } from "@/components/store-h5-task-form";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5TaskPage({ params }: { params: Promise<{ taskInstanceId: string }> }) {
  await requireStoreH5PageSession();
  const { taskInstanceId } = await params;
  return <StoreH5TaskForm taskInstanceId={taskInstanceId} />;
}
