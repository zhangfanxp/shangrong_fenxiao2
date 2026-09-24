import { MobileOnlineLessonPlayer } from "@/components/mobile-online-courses";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function StoreH5OnlineLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const session = await requireStoreH5PageSession("store-h5:courses:view");
  const { id, lessonId } = await params;
  return <MobileOnlineLessonPlayer channel="store-h5" courseId={id} lessonId={lessonId} canLearn={hasRolePermission(session.permissions, "store-h5:courses:learn")} canDownload={hasRolePermission(session.permissions, "store-h5:courses:download")} />;
}
