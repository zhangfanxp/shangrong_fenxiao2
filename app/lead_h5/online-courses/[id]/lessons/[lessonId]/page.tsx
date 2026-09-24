import { MobileOnlineLessonPlayer } from "@/components/mobile-online-courses";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function LeadH5OnlineLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const session = await requireLeadH5PageSession("lead-h5:courses:view");
  const { id, lessonId } = await params;
  return <MobileOnlineLessonPlayer channel="lead-h5" courseId={id} lessonId={lessonId} canLearn={hasRolePermission(session.permissions, "lead-h5:courses:learn")} canDownload={hasRolePermission(session.permissions, "lead-h5:courses:download")} />;
}
