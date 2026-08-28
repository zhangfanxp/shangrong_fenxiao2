import { MobileOnlineLessonPlayer } from "@/components/mobile-online-courses";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5OnlineLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  await requireStoreH5PageSession();
  const { id, lessonId } = await params;
  return <MobileOnlineLessonPlayer channel="store-h5" courseId={id} lessonId={lessonId} />;
}

