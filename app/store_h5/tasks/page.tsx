import { StoreH5TaskList } from "@/components/store-h5-task-list";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5TasksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStoreH5PageSession();
  const { status } = await searchParams;
  return <StoreH5TaskList initialStatus={status === "completed" ? "completed" : "pending"} />;
}
