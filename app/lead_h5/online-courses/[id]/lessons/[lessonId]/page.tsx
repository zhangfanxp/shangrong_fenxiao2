import { MobileOnlineLessonPlayer } from "@/components/mobile-online-courses";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function LeadH5OnlineLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  await requireLeadH5PageSession();
  const { id, lessonId } = await params;
  return <MobileOnlineLessonPlayer channel="lead-h5" courseId={id} lessonId={lessonId} />;
}

